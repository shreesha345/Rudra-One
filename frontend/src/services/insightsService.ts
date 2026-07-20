/**
 * Insights Service - Client-side AI processing using Google Gemini
 * Converts caller transcripts into structured insights in real-time
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const BASE_PROMPT = `
You are a professional emergency dispatch intelligence system analyzing caller statements to extract critical information for incident investigation and response coordination.

EXTRACTION REQUIREMENTS:
1. Extract only verified, actionable intelligence
2. Maintain professional, concise language without emojis or casual expressions
3. Consolidate related information into single, clear statements
4. Use actual values provided by caller - never use placeholders or brackets
5. Omit fields entirely if information is not explicitly provided
6. Avoid speculation or assumptions

Return a JSON object with the following structure:
{
    "persons_described": [{"name": "John Doe", "role": "caller"}],
    "location": ["Sector 17, Gurgaon, near Community Center", "Third floor, residential building"],
    "incident": {
        "incident_type": "fire",
        "description": "Major fire in residential building",
        "severity": "critical",
        "source": "AC unit malfunction",
        "current_state": "spreading"
    },
    "time_info": {"duration": "15 minutes", "start_time": "approximately 15 minutes ago"},
    "additional_info": ["Multiple individuals trapped on balconies", "Third floor fully engulfed"],
    "new_information_found": true,
    "summary": "Major fire at residential building in Sector 17, Gurgaon near Community Center. Fire originated from AC unit malfunction approximately 15 minutes ago. Third floor fully engulfed with multiple individuals trapped on balconies requiring immediate rescue."
}

LOCATION FORMATTING:
- Consolidate address, area, and landmarks into 1-2 precise statements
- Format: "Sector 17, Gurgaon, near Community Center" (single consolidated entry)
- Include floor or unit designation only if specifically mentioned
- Eliminate redundant or repetitive location data

PERSONS IDENTIFICATION:
- Include only when names are explicitly stated by caller
- Format: {"name": "Full Name", "role": "caller/witness/victim/resident"}
- Omit if caller does not provide identification

INCIDENT CLASSIFICATION:
- incident_type: fire/medical/crime/noise/environmental/hazmat/other
- severity: low/medium/high/critical
- current_state: active/spreading/contained/stable/resolved
- description: Brief professional summary of incident nature

TIME INFORMATION:
- duration: Length of ongoing incident
- start_time: When incident began
- Use precise language: "15 minutes ago" not "about 15 minutes"

ADDITIONAL INFORMATION:
- Include only critical operational details not captured in other fields
- One clear, professional sentence per item
- Prioritize information relevant to response coordination
- Avoid duplication of data from other fields

SUMMARY REQUIREMENTS:
- Professional, comprehensive paragraph format
- Include: location, incident type, severity, timeline, and critical response needs
- Use formal emergency services language
- Avoid emojis, exclamation marks, or casual expressions
`;

export interface InsightsData {
  persons_described: Array<{ name: string; role: string } | string>;
  location: string[];
  incident: {
    incident_type?: string;
    description?: string;
    severity?: string;
    source?: string;
    current_state?: string;
    [key: string]: any;
  };
  time_info: {
    duration?: string;
    start_time?: string;
    frequency?: string;
    [key: string]: any;
  };
  additional_info: string[];
  new_information_found: boolean;
  summary: string;
}

export class InsightsExtractor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private conversationHistory: Map<string, InsightsData>;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    this.conversationHistory = new Map();
  }

  private buildExtractionPrompt(sentence: string, existingData?: InsightsData): string {
    let prompt = BASE_PROMPT;
    
    if (existingData) {
      prompt += `\n\nEXISTING INFORMATION:\n${JSON.stringify(existingData, null, 2)}\nExtract NEW actionable info and integrate it.`;
    }
    
    prompt += `\n\nCURRENT CALLER STATEMENT:\n"${sentence}"\nReturn valid JSON only.`;
    
    return prompt;
  }

  private mergeListsUnique<T>(oldList: T[], newList: T[]): T[] {
    const result = [...oldList];
    
    for (const item of newList) {
      // For objects, do deep comparison
      if (typeof item === 'object' && item !== null) {
        const exists = result.some(existing => 
          JSON.stringify(existing) === JSON.stringify(item)
        );
        if (!exists) {
          result.push(item);
        }
      } else {
        // For primitives, simple includes check
        if (!result.includes(item)) {
          result.push(item);
        }
      }
    }
    
    return result;
  }

  private mergeData(existing: InsightsData, newData: Partial<InsightsData>): InsightsData {
    const merged = { ...existing };

    // Merge lists
    if (newData.persons_described) {
      merged.persons_described = this.mergeListsUnique(
        existing.persons_described || [],
        newData.persons_described
      );
    }

    if (newData.location) {
      merged.location = this.mergeListsUnique(
        existing.location || [],
        newData.location
      );
    }

    if (newData.additional_info) {
      merged.additional_info = this.mergeListsUnique(
        existing.additional_info || [],
        newData.additional_info
      );
    }

    // Merge incident object
    if (newData.incident) {
      merged.incident = { ...existing.incident };
      for (const [key, value] of Object.entries(newData.incident)) {
        if (value) {
          merged.incident[key] = value;
        }
      }
    }

    // Merge time_info object
    if (newData.time_info) {
      merged.time_info = { ...existing.time_info };
      for (const [key, value] of Object.entries(newData.time_info)) {
        if (value) {
          merged.time_info[key] = value;
        }
      }
    }

    // Update summary
    if (newData.summary) {
      merged.summary = newData.summary;
    }

    // Update new_information_found flag
    merged.new_information_found = newData.new_information_found ?? true;

    return merged;
  }

  async processSentence(
    sentence: string,
    callerId: string,
    callerName?: string
  ): Promise<InsightsData> {
    // Get or initialize existing data
    let existingData = this.conversationHistory.get(callerId);
    
    if (!existingData) {
      existingData = {
        persons_described: [],
        location: [],
        additional_info: [],
        incident: {},
        time_info: {},
        summary: "",
        new_information_found: false,
      };
    }

    if (callerName && !existingData.persons_described.some(p => 
      typeof p === 'object' && p.name === callerName
    )) {
      existingData.persons_described.push({ name: callerName, role: "caller" });
    }

    const prompt = this.buildExtractionPrompt(sentence, existingData);

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let responseText = response.text().trim();

      // Strip code block markers
      const markers = ["```json", "```"];
      for (const marker of markers) {
        if (responseText.startsWith(marker)) {
          responseText = responseText.substring(marker.length);
        }
        if (responseText.endsWith(marker)) {
          responseText = responseText.substring(0, responseText.length - marker.length);
        }
      }
      responseText = responseText.trim();

      const extractedData = JSON.parse(responseText) as Partial<InsightsData>;
      const mergedData = this.mergeData(existingData, extractedData);
      
      this.conversationHistory.set(callerId, mergedData);
      
      return mergedData;
    } catch (error) {
      console.error("Error processing sentence:", error);
      return existingData;
    }
  }

  getCurrentState(callerId: string): InsightsData | null {
    return this.conversationHistory.get(callerId) || null;
  }

  deleteSession(callerId: string): boolean {
    return this.conversationHistory.delete(callerId);
  }

  listSessions(): string[] {
    return Array.from(this.conversationHistory.keys());
  }

  clearAllSessions(): void {
    this.conversationHistory.clear();
  }
}

// Singleton instance
let insightsExtractorInstance: InsightsExtractor | null = null;

export function getInsightsExtractor(apiKey?: string): InsightsExtractor {
  if (!insightsExtractorInstance) {
    const key = apiKey || import.meta.env.VITE_GOOGLE_API_KEY;
    if (!key) {
      throw new Error("Google API Key is required. Set VITE_GOOGLE_API_KEY in .env");
    }
    insightsExtractorInstance = new InsightsExtractor(key);
  }
  return insightsExtractorInstance;
}
