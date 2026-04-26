/**
 * Protocol Service - Emergency dispatch protocol question management
 * Tracks predefined questions and generates context-specific follow-ups using AI
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ProtocolQuestion {
  id: string;
  question: string;
  category: string;
  isAsked: boolean;
  isPredefined: boolean;
  priority: number;
}

export interface ProtocolState {
  questions: ProtocolQuestion[];
  conversationContext: string;
  lastUpdated: number;
}

// Predefined essential questions that every emergency call should cover
const PREDEFINED_QUESTIONS: Omit<ProtocolQuestion, 'isAsked'>[] = [
  {
    id: "emergency-type",
    question: "What's your emergency?",
    category: "incident",
    isPredefined: true,
    priority: 1
  },
  {
    id: "location-address",
    question: "What is the exact address of the incident?",
    category: "location",
    isPredefined: true,
    priority: 2
  },
  {
    id: "caller-safety",
    question: "Are you in a safe location right now?",
    category: "safety",
    isPredefined: true,
    priority: 3
  },
  {
    id: "injuries",
    question: "Is anyone injured or in need of medical attention?",
    category: "medical",
    isPredefined: true,
    priority: 4
  },
  {
    id: "weapons-violence",
    question: "Are there any weapons or violence involved?",
    category: "safety",
    isPredefined: true,
    priority: 5
  },
  {
    id: "people-count",
    question: "How many people are involved?",
    category: "incident",
    isPredefined: true,
    priority: 6
  }
];

const AI_PROMPT = `You are an emergency dispatch protocol assistant. Based on the conversation context, generate 3-5 additional critical questions that the dispatcher should ask to gather complete information.

RULES:
1. Questions must be direct, clear, and quick to answer
2. Focus on actionable information needed for emergency response
3. Avoid questions already covered in the conversation
4. Prioritize safety, location details, and immediate threats
5. Keep questions professional and concise
6. Each question should gather specific, useful information

Return a JSON array of questions in this format:
[
  {
    "question": "What color and make is the vehicle?",
    "category": "description",
    "priority": 7
  },
  {
    "question": "Which direction did they go?",
    "category": "location",
    "priority": 8
  }
]

CONVERSATION CONTEXT:
{context}

Return only valid JSON array, no additional text.`;

export class ProtocolManager {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private sessions: Map<string, ProtocolState>;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    this.sessions = new Map();
  }

  /**
   * Initialize a new protocol session for a call
   */
  initializeSession(callerId: string): ProtocolState {
    const questions: ProtocolQuestion[] = PREDEFINED_QUESTIONS.map(q => ({
      ...q,
      isAsked: false
    }));

    const state: ProtocolState = {
      questions,
      conversationContext: "",
      lastUpdated: Date.now()
    };

    this.sessions.set(callerId, state);
    return state;
  }

  /**
   * Get current protocol state for a call
   */
  getSession(callerId: string): ProtocolState | null {
    return this.sessions.get(callerId) || null;
  }

  /**
   * Check if a question was asked in the conversation and mark it
   */
  checkAndMarkQuestion(
    callerId: string,
    conversationText: string
  ): { updated: boolean; markedQuestions: string[] } {
    const state = this.sessions.get(callerId);
    if (!state) {
      return { updated: false, markedQuestions: [] };
    }

    const lowerConversation = conversationText.toLowerCase();
    const markedQuestions: string[] = [];
    let updated = false;

    // Check each unanswered question
    for (const question of state.questions) {
      if (question.isAsked) continue;

      // Check if the question topic was addressed in conversation
      const wasAsked = this.detectQuestionInConversation(question, lowerConversation);
      
      if (wasAsked) {
        question.isAsked = true;
        markedQuestions.push(question.id);
        updated = true;
      }
    }

    if (updated) {
      state.lastUpdated = Date.now();
      this.sessions.set(callerId, state);
    }

    return { updated, markedQuestions };
  }

  /**
   * Detect if a question topic was addressed in the conversation
   */
  private detectQuestionInConversation(question: ProtocolQuestion, conversationText: string): boolean {
    const patterns: Record<string, string[]> = {
      "emergency-type": ["emergency", "what.*happen", "problem", "issue", "incident"],
      "location-address": ["address", "location", "where", "street", "building", "apartment", "floor"],
      "caller-safety": ["safe", "danger", "threat", "secure", "hiding"],
      "injuries": ["injur", "hurt", "medical", "ambulance", "bleeding", "pain", "wound"],
      "weapons-violence": ["weapon", "gun", "knife", "violence", "armed", "attack"],
      "people-count": ["how many", "number of people", "\\d+\\s*people", "crowd", "group"]
    };

    const questionPatterns = patterns[question.id];
    if (!questionPatterns) {
      // For AI-generated questions, use keyword matching
      const keywords = question.question.toLowerCase()
        .replace(/[?.,!]/g, '')
        .split(' ')
        .filter(w => w.length > 3);
      
      return keywords.some(keyword => conversationText.includes(keyword));
    }

    // Check if any pattern matches
    return questionPatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(conversationText);
    });
  }

  /**
   * Generate additional context-specific questions using AI
   */
  async generateAdditionalQuestions(
    callerId: string,
    conversationContext: string
  ): Promise<ProtocolQuestion[]> {
    const state = this.sessions.get(callerId);
    if (!state) {
      throw new Error("Session not initialized");
    }

    // Update conversation context
    state.conversationContext = conversationContext;

    try {
      const prompt = AI_PROMPT.replace('{context}', conversationContext);
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

      const aiQuestions = JSON.parse(responseText) as Array<{
        question: string;
        category: string;
        priority: number;
      }>;

      // Convert to ProtocolQuestion format
      const newQuestions: ProtocolQuestion[] = aiQuestions.map((q, index) => ({
        id: `ai-${Date.now()}-${index}`,
        question: q.question,
        category: q.category,
        isAsked: false,
        isPredefined: false,
        priority: q.priority || (100 + index)
      }));

      // Add to state (avoid duplicates)
      for (const newQ of newQuestions) {
        const exists = state.questions.some(
          existing => existing.question.toLowerCase() === newQ.question.toLowerCase()
        );
        if (!exists) {
          state.questions.push(newQ);
        }
      }

      // Sort by priority
      state.questions.sort((a, b) => a.priority - b.priority);
      state.lastUpdated = Date.now();
      this.sessions.set(callerId, state);

      return newQuestions;
    } catch (error) {
      console.error("Error generating additional questions:", error);
      return [];
    }
  }

  /**
   * Get unanswered questions
   */
  getUnansweredQuestions(callerId: string): ProtocolQuestion[] {
    const state = this.sessions.get(callerId);
    if (!state) return [];
    
    return state.questions.filter(q => !q.isAsked);
  }

  /**
   * Get answered questions
   */
  getAnsweredQuestions(callerId: string): ProtocolQuestion[] {
    const state = this.sessions.get(callerId);
    if (!state) return [];
    
    return state.questions.filter(q => q.isAsked);
  }

  /**
   * Manually mark a question as asked
   */
  markQuestionAsked(callerId: string, questionId: string): boolean {
    const state = this.sessions.get(callerId);
    if (!state) return false;

    const question = state.questions.find(q => q.id === questionId);
    if (question) {
      question.isAsked = true;
      state.lastUpdated = Date.now();
      this.sessions.set(callerId, state);
      return true;
    }

    return false;
  }

  /**
   * Get completion percentage
   */
  getCompletionPercentage(callerId: string): number {
    const state = this.sessions.get(callerId);
    if (!state || state.questions.length === 0) return 0;

    const predefinedQuestions = state.questions.filter(q => q.isPredefined);
    const askedPredefined = predefinedQuestions.filter(q => q.isAsked);
    
    return Math.round((askedPredefined.length / predefinedQuestions.length) * 100);
  }

  /**
   * Delete a session
   */
  deleteSession(callerId: string): boolean {
    return this.sessions.delete(callerId);
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }
}

// Singleton instance
let protocolManagerInstance: ProtocolManager | null = null;

export function getProtocolManager(apiKey?: string): ProtocolManager {
  if (!protocolManagerInstance) {
    const key = apiKey || import.meta.env.VITE_GOOGLE_API_KEY;
    if (!key) {
      throw new Error("Google API Key is required. Set VITE_GOOGLE_API_KEY in .env");
    }
    protocolManagerInstance = new ProtocolManager(key);
  }
  return protocolManagerInstance;
}
