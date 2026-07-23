/**
 * Insights Service - Client-side AI processing using Google Gemini
 * Converts caller transcripts into structured insights in real-time
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// Simple OpenAI client implementation to avoid adding heavy dependencies
class OpenAIClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateContent(prompt: string): Promise<{ response: { text: () => string } }> {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content || "";

      return {
        response: {
          text: () => text
        }
      };
    } catch (error) {
      console.error("OpenAI Request Failed:", error);
      throw error;
    }
  }
}

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
    "summary": "Major fire at residential building in Sector 17, Gurgaon near Community Center. Fire originated from AC unit malfunction approximately 15 minutes ago. Third floor fully engulfed with multiple individuals trapped on balconies requiring immediate rescue.",
    "emergency_type": "fire"
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

EMERGENCY TYPE CLASSIFICATION (REQUIRED):
- Classify EVERY incident into exactly ONE of three emergency types: "hospital", "police", or "fire"
- This field is MANDATORY - always include "emergency_type" in your response
- Classification rules:
  * "hospital": Medical emergencies (injuries, bleeding, heart attacks, unconscious persons, breathing problems, poisoning, overdose, pregnancy complications, severe pain, medical assistance needed)
  * "fire": Fire-related emergencies (building fires, vehicle fires, explosions, gas leaks, smoke, burning smell, fire hazards)
  * "police": Criminal activities and public safety (crime, theft, robbery, burglary, assault, domestic violence, suspicious activity, threats, weapons, break-ins, kidnapping, harassment, stalking, missing persons, disturbances, noise complaints, traffic accidents with no injuries)
- When multiple types apply, prioritize based on severity:
  1. Life-threatening medical issues → "hospital"
  2. Active fires or explosions → "fire"
  3. Criminal activity, violence, or public safety → "police"
- Examples:
  * "Person bleeding heavily" → "hospital"
  * "Building on fire" → "fire"
  * "Someone breaking into my house" → "police"
  * "Car accident with injuries" → "hospital"
  * "Shooting incident" → "hospital" (if injuries mentioned) OR "police" (if no injuries mentioned)
  * "Gas leak with fire" → "fire"
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
  emergency_type?: 'hospital' | 'police' | 'fire';
}

export class InsightsExtractor {
  private genAI: GoogleGenerativeAI | null = null;
  private openAI: OpenAIClient | null = null;
  private model: any;
  private provider: "google" | "openai";
  private conversationHistory: Map<string, InsightsData>;

  constructor(apiKey: string, provider: "google" | "openai" = "google", modelName?: string) {
    this.provider = provider;
    this.conversationHistory = new Map();

    if (provider === "google") {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: modelName || "gemini-2.5-flash" });
    } else {
      this.openAI = new OpenAIClient(apiKey, modelName || "gpt-4o");
      this.model = this.openAI; // Both have generateContent method with compatible signature
    }
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

    // Update emergency_type
    if (newData.emergency_type) {
      merged.emergency_type = newData.emergency_type;
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
        emergency_type: undefined,
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
    const provider = (import.meta.env.VITE_TRAINING_AI_PROVIDER || "google").toLowerCase() as "google" | "openai";
    
    let key = apiKey;
    let modelName = "";

    if (provider === "google") {
      key = key || import.meta.env.VITE_GOOGLE_API_KEY;
      modelName = import.meta.env.VITE_TRAINING_GOOGLE_MODEL || "gemini-2.5-flash";
      if (!key) {
        throw new Error("Google API Key is required. Set VITE_GOOGLE_API_KEY in .env");
      }
    } else {
      key = key || import.meta.env.VITE_OPENAI_API_KEY;
      modelName = import.meta.env.VITE_TRAINING_OPENAI_MODEL || "gpt-4o";
      if (!key) {
        console.warn("OpenAI API Key is missing. Set VITE_OPENAI_API_KEY in .env");
        // Fallback to Google if OpenAI key is missing but Google key exists
        if (import.meta.env.VITE_GOOGLE_API_KEY) {
          console.log("Falling back to Google Gemini");
          return new InsightsExtractor(import.meta.env.VITE_GOOGLE_API_KEY, "google", import.meta.env.VITE_TRAINING_GOOGLE_MODEL);
        }
        throw new Error("OpenAI API Key is required. Set VITE_OPENAI_API_KEY in .env");
      }
    }
    
    insightsExtractorInstance = new InsightsExtractor(key, provider, modelName);
  }
  return insightsExtractorInstance;
}
