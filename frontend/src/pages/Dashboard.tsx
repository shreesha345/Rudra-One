import { useNavigate } from "react-router-dom";
import { Phone, Plus, Search, Bell, User, ChevronDown, Share2, Sparkles, Copy, Volume2, VolumeX, MapPin, FileText, Play, GripVertical, Radio, BarChart3, GraduationCap, Compass, Settings, Send, Mic, MicOff, CheckCircle, XCircle, AlertCircle, Info, MessageSquare, Ambulance, Shield, Flame, Loader2, LayoutDashboard, Archive, MoreHorizontal, Clock, Filter, RefreshCw, Save, Languages, Trash2, Menu, X, ChevronLeft, ChevronRight, History, Globe, ArrowRight, Tag, LineChart, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket, TranscriptionMessage } from "@/hooks/useWebSocket";
import { AudioService } from "@/services/audioService";
import { apiService } from "@/services/apiService";
import { useToast } from "@/hooks/use-toast";
import { getInsightsExtractor, InsightsData } from "@/services/insightsService";
import { getProtocolManager, ProtocolQuestion } from "@/services/protocolService";
import { useRealtimeTranslation } from "@/hooks/useRealtimeTranslation";
import ReactMarkdown from 'react-markdown';
import { MapView } from "@/components/MapView";
import { DispatchMap, DispatchMapRef, EmergencyStation } from "@/components/DispatchMap";
import { twilioService } from "@/services/twilioService";
import { elevenlabsService } from "@/services/elevenlabsService";

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Speech Recognition interface
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  stopping?: boolean;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface Call {
  phone: string;
  preview: string;
  time: string;
  date: string;
  language: string;
  isLive: boolean;
  call_sid?: string;
}

interface ConversationMessage {
  sender: string;
  time: string;
  message: string;
  is_final?: boolean;
  originalMessage?: string;
  isTranslated?: boolean;
}

interface TrainingLog {
  session_id: string;
  scenario: string;
  date: string;
  time: string;
  duration?: string;  // Duration in format "MM:SS"
  status: "active" | "completed" | "error";
  confidence_score?: number;
  evaluation?: string;
  started_at: string;
  ended_at?: string;
  conversation?: ConversationMessage[];  // Store the conversation history
  insights?: InsightsData;  // Store extracted insights
}

// Helper function to format duration in MM:SS format
const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Timer component for live training sessions
const TrainingTimer: React.FC<{ startTime: number }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return <>{formatDuration(elapsed)}</>;
};

// Simple geocoding function (in production, use Mapbox Geocoding API or Google Geocoding API)
const geocodeLocation = async (locationText: string): Promise<{ lat: number; lng: number } | null> => {
  // Common NYC locations database (simplified)
  const locationDatabase: Record<string, { lat: number; lng: number }> = {
    // Manhattan neighborhoods
    'times square': { lat: 40.7580, lng: -73.9855 },
    'central park': { lat: 40.7829, lng: -73.9654 },
    'wall street': { lat: 40.7074, lng: -74.0113 },
    'harlem': { lat: 40.8116, lng: -73.9465 },
    'chinatown': { lat: 40.7158, lng: -73.9970 },
    'soho': { lat: 40.7233, lng: -74.0030 },
    'tribeca': { lat: 40.7163, lng: -74.0086 },
    'greenwich village': { lat: 40.7336, lng: -74.0027 },
    'upper east side': { lat: 40.7736, lng: -73.9566 },
    'upper west side': { lat: 40.7870, lng: -73.9754 },

    // Other boroughs
    'brooklyn': { lat: 40.6782, lng: -73.9442 },
    'queens': { lat: 40.7282, lng: -73.7949 },
    'bronx': { lat: 40.8448, lng: -73.8648 },
    'staten island': { lat: 40.5795, lng: -74.1502 },

    // Landmarks
    'empire state building': { lat: 40.7484, lng: -73.9857 },
    'brooklyn bridge': { lat: 40.7061, lng: -73.9969 },
    'statue of liberty': { lat: 40.6892, lng: -74.0445 },
  };

  const searchText = locationText.toLowerCase();

  // Try to find a match in the database
  for (const [key, coords] of Object.entries(locationDatabase)) {
    if (searchText.includes(key)) {
      console.log(`📍 Geocoded "${locationText}" to ${key}:`, coords);
      return coords;
    }
  }

  // If no match found, try to use Mapbox Geocoding API (if token is available)
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  if (mapboxToken && mapboxToken !== 'your_mapbox_token_here') {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationText)}.json?access_token=${mapboxToken}&limit=1`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        console.log(`📍 Geocoded "${locationText}" via Mapbox:`, { lat, lng });
        return { lat, lng };
      }
    } catch (error) {
      console.error('Geocoding API error:', error);
    }
  }

  console.log(`⚠️ Could not geocode location: "${locationText}"`);
  return null;
};

// Validate that a location text is sufficiently specific (address-like or known landmark)
const validateLocationText = (text: string | undefined): boolean => {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  // Accept if contains a street number pattern (number followed by word)
  const hasStreetNumber = /\b\d{1,5}\s+[a-z]/i.test(t);
  // Common address terms
  const addressTerms = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'lane', 'ln', 'drive', 'dr', 'court', 'ct', 'highway', 'hwy'];
  const hasAddressTerm = addressTerms.some(term => t.includes(term));
  // Known NYC landmark/neighborhood keys reused from geocode database
  const landmarkTerms = ['times square', 'central park', 'wall street', 'harlem', 'chinatown', 'soho', 'tribeca', 'greenwich village', 'upper east side', 'upper west side', 'brooklyn', 'queens', 'bronx', 'staten island', 'empire state building', 'brooklyn bridge', 'statue of liberty'];
  const hasLandmark = landmarkTerms.some(term => t.includes(term));
  // Require either a street number+term or landmark; avoid vague phrases like 'near the diner'
  return (hasStreetNumber && hasAddressTerm) || hasLandmark;
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [activeNavItem, setActiveNavItem] = useState("calls");
  const [leftWidth, setLeftWidth] = useState(280); // From design spec: 280px
  const [rightWidth, setRightWidth] = useState(376); // From design spec: 376px
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitHeight, setSplitHeight] = useState(50); // Percentage for top panel
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [topPanelTab, setTopPanelTab] = useState<"insights" | "protocol">("insights");
  const [bottomPanelTab, setBottomPanelTab] = useState<"insights" | "protocol">("protocol");
  const [detectedLanguage, setDetectedLanguage] = useState("Spanish");
  const [isMessageFieldVisible, setIsMessageFieldVisible] = useState(false);
  const [messageText, setMessageText] = useState("");

  // Settings state
  const [callForwardNumber, setCallForwardNumber] = useState<string>("");
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(true);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'call-forwarding' | 'language' | 'database'>('call-forwarding');

  // AI Agent state
  const [isAiActive, setIsAiActive] = useState(true); // Track if AI agent is active
  const [hasBeenTransferred, setHasBeenTransferred] = useState(false); // Track if call has been transferred to human
  const [isCallerMuted, setIsCallerMuted] = useState(true); // Track if caller audio is muted
  const [isAiAudioEnabled, setIsAiAudioEnabled] = useState(false); // Track if AI audio is enabled (default false)

  // Analytics State
  const [analyticsMessages, setAnalyticsMessages] = useState<Array<{role: 'user' | 'assistant', type: 'text' | 'html', content: string}>>([]);
  const [analyticsInput, setAnalyticsInput] = useState('');
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const analyticsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    analyticsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [analyticsMessages, isAnalyticsLoading]);

  const handleAnalyticsSubmit = async () => {
    if (!analyticsInput.trim()) return;
    
    const userMessage = analyticsInput;
    setAnalyticsInput('');
    setAnalyticsMessages(prev => [...prev, { role: 'user', type: 'text', content: userMessage }]);
    setIsAnalyticsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      
      if (!response.ok) throw new Error('Failed to fetch');
      
      const data = await response.json();
      setAnalyticsMessages(prev => [...prev, { role: 'assistant', type: data.type, content: data.content }]);
    } catch (error) {
      console.error("Analytics error:", error);
      setAnalyticsMessages(prev => [...prev, { role: 'assistant', type: 'text', content: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const [forwardingNumber, setForwardingNumber] = useState("");
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(false);

  // Load settings on mount and when window regains focus
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/api/settings`);
        const data = await response.json();

        if (data.status === 'success' && data.settings) {
          if (data.settings.default_translation_language) {
            const langCode = data.settings.default_translation_language;

            // Map ISO code to full name for the Select component
            const codeToName: Record<string, string> = {
              'en': 'English',
              'hi': 'Hindi',
              'bn': 'Bengali',
              'te': 'Telugu',
              'mr': 'Marathi',
              'ta': 'Tamil',
              'gu': 'Gujarati',
              'kn': 'Kannada',
              'ml': 'Malayalam',
              'pa': 'Punjabi',
              'or': 'Odia'
            };

            const langName = codeToName[langCode];
            if (langName) {
              setDetectedLanguage(langName);
              console.log(`🌍 Set default language from settings: ${langName} (${langCode})`);
            }
          }

          // Update emergency contacts from settings
          const hospital = data.settings.emergency_hospital || '';
          const police = data.settings.emergency_police || '';
          const fire = data.settings.emergency_fire || '';

          setEmergencyContacts({
            hospital,
            police,
            fire
          });
          
          // Also update the individual state variables used in the settings panel
          setHospitalNumber(hospital);
          setPoliceNumber(police);
          setFireNumber(fire);
          
          console.log('🚑 Updated emergency contacts from settings');
        }
      } catch (error) {
        console.error('Failed to load settings in Dashboard:', error);
      }
    };

    // Fetch on mount
    fetchSettings();

    // Refetch when window regains focus (e.g., after navigating back from Settings)
    const handleFocus = () => {
      console.log('🔄 Window focused - refreshing settings');
      fetchSettings();
    };

    window.addEventListener('focus', handleFocus);

    // Also listen for custom event from Settings page
    const handleSettingsUpdate = () => {
      console.log('⚙️ Settings updated - refreshing');
      fetchSettings();
    };

    window.addEventListener('settings-updated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('settings-updated', handleSettingsUpdate);
    };
  }, []);

  // Load call history from database
  const loadCallHistory = useCallback(async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/api/calls`);
      const data = await response.json();

      if (data.status === 'success' && data.calls) {
        const historyCalls: Call[] = data.calls.map((call: any) => ({
          phone: call.phone || 'Unknown Caller',
          preview: 'View call history...',
          time: call.time,
          date: call.date,
          language: call.language,
          isLive: call.is_live,
          call_sid: call.call_sid,
        }));

        setCalls(historyCalls);
        console.log(`📚 Loaded ${historyCalls.length} calls from history`);
      }
    } catch (error) {
      console.error('Failed to load call history:', error);
    }
  }, []);

  // Load call history on mount
  useEffect(() => {
    loadCallHistory();
  }, [loadCallHistory]);

  // Map location state
  const [mapLocation, setMapLocation] = useState(() => {
    const saved = localStorage.getItem('mapLocation');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved map location:', e);
      }
    }
    return {
      latitude: 40.7128,
      longitude: -74.0060,
      address: "123 Main Street, New York, NY",
      district: "Manhattan, New York"
    };
  });

  // Save map location to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('mapLocation', JSON.stringify(mapLocation));
  }, [mapLocation]);

  // Emergency services state
  const [nearestServices, setNearestServices] = useState<{
    hospital?: { name: string; distance: number };
    police?: { name: string; distance: number };
    fire?: { name: string; distance: number };
  }>({});
  const [audioLevel, setAudioLevel] = useState(0);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [selectedIncident, setSelectedIncident] = useState(() => {
    const saved = localStorage.getItem('selectedIncident');
    if (saved) {
      try {
        return parseInt(saved, 10);
      } catch (e) {
        console.error('Failed to parse saved selected incident:', e);
      }
    }
    return 0;
  });

  // Save selected incident to localStorage
  useEffect(() => {
    localStorage.setItem('selectedIncident', selectedIncident.toString());
  }, [selectedIncident]);
  const [isLiveCall, setIsLiveCall] = useState(false);

  // Tabs section resize state
  const [tabsHeight, setTabsHeight] = useState(400); // default height in pixels
  const [isResizingTabs, setIsResizingTabs] = useState(false);

  // WebSocket and call management state
  const [calls, setCalls] = useState<Call[]>([
    { phone: "+1 (847) 770-3730", preview: "Hello, I'd like to file a...", time: "01:26", date: "03/13/25", language: "Spanish", isLive: false, call_sid: "demo-call-1" },
    { phone: "+1 (510) 501-1384", preview: "This is a message from De...", time: "02:10", date: "03/12/25", language: "English", isLive: true, call_sid: "demo-call-2" },
    { phone: "+1 (201) 410-4917", preview: "In the city of Los Angeles,...", time: "00:32", date: "03/12/25", language: "Mandarin", isLive: false, call_sid: "demo-call-3" },
    { phone: "+1 (201) 323-2235", preview: "Can someone please...", time: "00:53", date: "03/11/25", language: "French", isLive: false, call_sid: "demo-call-4" },
  ]);
  const [conversation, setConversation] = useState<ConversationMessage[]>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('conversation');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved conversation:', e);
      }
    }
    return [
      { sender: "Dispatch", time: "2:30 AM", message: "911, what's your emergency?" },
      { sender: "Caller", time: "2:30 AM", message: "Hi, I need to report a noise complaint." },
      { sender: "Dispatch", time: "2:31 AM", message: "Can you provide your name and the address where the noise is coming from?" },
      { sender: "Caller", time: "2:31 AM", message: "My name is John Smith, and the noise is coming from 123 Main Street, apartment 4B." },
      { sender: "Dispatch", time: "2:32 AM", message: "How many people are involved, would you say?" },
      { sender: "Caller", time: "2:33 AM", message: "It's a fairly large party, about 100 people." },
      { sender: "Dispatch", time: "2:33 AM", message: "How much time has elapsed since you first noticed the noise in this report?" },
      { sender: "Caller", time: "2:34 AM", message: "Probably 3 hours." },
      { sender: "Dispatch", time: "2:34 AM", message: "What type of noise are you hearing? Music, shouting, or something else?" },
      { sender: "Caller", time: "2:34 AM", message: "Loud music, people shouting, and it sounds like they're moving furniture around." },
      { sender: "Dispatch", time: "2:34 AM", message: "Okay. So to summarize, you are John Smith, reporting a noise complaint at 123 Main Street, due to a party with approximately 100 people that has been ongoing for 3 hours. Is that correct?" },
      { sender: "Caller", time: "2:34 AM", message: "That's right." },
      { sender: "Dispatch", time: "2:35 AM", message: "Thank you for that information. I'll file an incident for you now and get someone to help." },
      { sender: "Caller", time: "2:35 AM", message: "How long will it take for someone to respond?" },
      { sender: "Dispatch", time: "2:35 AM", message: "We'll have officers dispatched within the next 15-20 minutes. Is there anything else I can help you with?" },
      { sender: "Caller", time: "2:36 AM", message: "No, that's all. Thank you." },
      { sender: "Dispatch", time: "2:36 AM", message: "You're welcome. Have a good evening." },
    ];
  });

  // Debug: Log conversation updates
  useEffect(() => {
    console.log('🔄 Conversation state updated:', conversation.length, 'messages');
    if (conversation.length > 0) {
      console.log('Last message:', conversation[conversation.length - 1]);
    }
  }, [conversation]);
  const [isMicActive, setIsMicActive] = useState(false);
  const audioServiceRef = useRef<AudioService | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const [selectedCallSid, setSelectedCallSid] = useState<string | null>(() => {
    return localStorage.getItem('selectedCallSid');
  });

  // Save selected call SID to localStorage
  useEffect(() => {
    if (selectedCallSid) {
      localStorage.setItem('selectedCallSid', selectedCallSid);
    } else {
      localStorage.removeItem('selectedCallSid');
    }
  }, [selectedCallSid]);
  const [selectedCallerNumber, setSelectedCallerNumber] = useState<string | null>(null);
  const [pendingToast, setPendingToast] = useState<{ title: string; description: string } | null>(null);

  // Insights state - Start with empty state for live calls
  const [insights, setInsights] = useState<InsightsData>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('callInsights');
    if (saved) {
      try {
        const parsedInsights = JSON.parse(saved);
        // Clear emergency_type and location from saved insights to prevent auto-processing on page load
        return {
          ...parsedInsights,
          emergency_type: undefined,
          location: [] // Clear location to prevent geocoding
        };
      } catch (e) {
        console.error('Failed to parse saved insights:', e);
      }
    }
    return {
      summary: "",
      location: [],
      persons_described: [],
      additional_info: [],
      incident: {},
      time_info: {},
      new_information_found: false,
      emergency_type: undefined
    };
  });
  const [isStreamingInsights, setIsStreamingInsights] = useState(false);
  const insightsExtractorRef = useRef<ReturnType<typeof getInsightsExtractor> | null>(null);

  // Protocol questions state
  const [protocolQuestions, setProtocolQuestions] = useState<ProtocolQuestion[]>([]);
  const [hasGeneratedAIQuestions, setHasGeneratedAIQuestions] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const protocolManagerRef = useRef<ReturnType<typeof getProtocolManager> | null>(null);

  // Real-time translation hook
  const {
    translateCallerMessage,
    translateDispatcherMessage,
    detectedLanguage: autoDetectedLanguage,
    isTranslating,
  } = useRealtimeTranslation();

  // Training state
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('trainingLogs');
    if (saved) {
      try {
        const logs = JSON.parse(saved);
        console.log('📚 Loaded training logs from storage:', logs.length, 'sessions');
        return logs;
      } catch (e) {
        console.error('Failed to parse saved training logs:', e);
      }
    }
    console.log('📚 No training logs in storage - starting fresh');
    return [];
  });
  const [activeTrainingSession, setActiveTrainingSession] = useState<string | null>(null);
  const [trainingConversation, setTrainingConversation] = useState<ConversationMessage[]>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('trainingConversation');
    if (saved) {
      try {
        const conv = JSON.parse(saved);
        console.log('💬 Loaded training conversation from storage:', conv.length, 'messages');
        return conv;
      } catch (e) {
        console.error('Failed to parse saved training conversation:', e);
      }
    }
    return [];
  });
  const [isTrainingInProgress, setIsTrainingInProgress] = useState(false);
  const [trainingStartTime, setTrainingStartTime] = useState<number | null>(null);
  const [hasGeneratedTrainingAIQuestions, setHasGeneratedTrainingAIQuestions] = useState(false);
  const [trainingUpdateTrigger, setTrainingUpdateTrigger] = useState(0);
  const [trainingConfidence, setTrainingConfidence] = useState<number | null>(() => {
    const saved = localStorage.getItem('trainingConfidence');
    return saved ? JSON.parse(saved) : null;
  });
  const [trainingEvaluation, setTrainingEvaluation] = useState<string | null>(() => {
    const saved = localStorage.getItem('trainingEvaluation');
    return saved ? JSON.parse(saved) : null;
  });
  const [trainingInsights, setTrainingInsights] = useState<InsightsData>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('trainingInsights');
    if (saved) {
      try {
        const parsedInsights = JSON.parse(saved);
        // Clear emergency_type and location from saved training insights to prevent auto-processing on page load
        return {
          ...parsedInsights,
          emergency_type: undefined,
          location: [] // Clear location to prevent geocoding
        };
      } catch (e) {
        console.error('Failed to parse saved training insights:', e);
      }
    }
    return {
      persons_described: [],
      summary: "",
      location: [],
      incident: {},
      time_info: {},
      additional_info: [],
      new_information_found: false,
      emergency_type: undefined
    };
  });
  const trainingInsightsExtractorRef = useRef<ReturnType<typeof getInsightsExtractor> | null>(null);

  // Messages state
  const [activeMessages, setActiveMessages] = useState<Array<{ number: string, timestamp: string }>>([
    { number: '+917795075436', timestamp: new Date().toISOString() }
  ]);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState<{ [key: string]: number }>({}); // Store timestamp of when link was sent
  
  // Cleanup old linkSent states (timeout after 60 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLinkSent(prev => {
        const newState = { ...prev };
        let changed = false;
        Object.keys(newState).forEach(key => {
          if (now - newState[key] > 60000) { // 60 seconds timeout
            delete newState[key];
            changed = true;
          }
        });
        return changed ? newState : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [locationData, setLocationData] = useState<{ [call_sid: string]: { latitude: number, longitude: number, address?: string, timestamp: string } }>(() => {
    const saved = localStorage.getItem('locationData');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved location data:', e);
      }
    }
    return {};
  });

  // Save location data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('locationData', JSON.stringify(locationData));
  }, [locationData]);

  // Dispatch state
  const [dispatchEmergencyType, setDispatchEmergencyType] = useState<'hospital' | 'police' | 'fire'>('hospital');
  const [dispatchStations, setDispatchStations] = useState<EmergencyStation[]>([]);
  const [isSearchingStations, setIsSearchingStations] = useState(false);
  const [selectedStationIndex, setSelectedStationIndex] = useState<number | null>(null);
  const dispatchMapRef = useRef<DispatchMapRef>(null);
  // Background auto-dispatch notification state
  const [autoDispatchTriggered, setAutoDispatchTriggered] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<Array<{ id: string; title: string; emergencyType: string; location: string; stations: EmergencyStation[]; status: 'pending' | 'approved' | 'denied' | 'sent'; timestamp: string; viewed?: boolean }>>(() => {
    const saved = localStorage.getItem('notificationHistory');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return [];
  });
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);

  // Emergency contact numbers from admin
  const [emergencyContacts, setEmergencyContacts] = useState<{
    hospital: string;
    police: string;
    fire: string;
  }>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('emergencyContacts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved emergency contacts:', e);
      }
    }
    return {
      hospital: '',
      police: '',
      fire: ''
    };
  });
  // Separate localStorage-backed emergency numbers
  const [hospitalNumber, setHospitalNumber] = useState<string>(() => localStorage.getItem('hospitalEmergencyNumber') || '');
  const [fireNumber, setFireNumber] = useState<string>(() => localStorage.getItem('fireEmergencyNumber') || '');
  const [policeNumber, setPoliceNumber] = useState<string>(() => localStorage.getItem('policeEmergencyNumber') || '');

  // Speech recognition state
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition | null>(null);
  const [isTrainingSpeechActive, setIsTrainingSpeechActive] = useState(false);

  // Show toast when pendingToast changes
  useEffect(() => {
    if (pendingToast) {
      toast(pendingToast);
      setPendingToast(null);
    }
  }, [pendingToast, toast]);

  // Save insights to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('callInsights', JSON.stringify(insights));
  }, [insights]);

  // Save training insights to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('trainingInsights', JSON.stringify(trainingInsights));
    // Persist emergency type & location separately for fast dispatch fallback
    if (trainingInsights.emergency_type) {
      localStorage.setItem('dispatchEmergencyType', trainingInsights.emergency_type);
      console.log('💾 Stored dispatchEmergencyType:', trainingInsights.emergency_type);
    }
    if (trainingInsights.location && trainingInsights.location.length > 0) {
      localStorage.setItem('dispatchLocation', JSON.stringify(trainingInsights.location));
    }
  }, [trainingInsights]);

  // Save training logs to localStorage whenever they change
  useEffect(() => {
    console.log('💾 Saving training logs to localStorage:', trainingLogs.length, 'sessions');
    localStorage.setItem('trainingLogs', JSON.stringify(trainingLogs));
  }, [trainingLogs]);

  // Save training conversation to localStorage whenever it changes
  useEffect(() => {
    console.log('💾 Saving training conversation to localStorage:', trainingConversation.length, 'messages');
    localStorage.setItem('trainingConversation', JSON.stringify(trainingConversation));
  }, [trainingConversation]);

  // Save training confidence to localStorage
  useEffect(() => {
    if (trainingConfidence !== null) {
      console.log('💾 Saving training confidence:', trainingConfidence);
      localStorage.setItem('trainingConfidence', JSON.stringify(trainingConfidence));
    }
  }, [trainingConfidence]);

  // Save training evaluation to localStorage
  useEffect(() => {
    if (trainingEvaluation !== null) {
      console.log('💾 Saving training evaluation');
      localStorage.setItem('trainingEvaluation', JSON.stringify(trainingEvaluation));
    }
  }, [trainingEvaluation]);

  // Save conversation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conversation', JSON.stringify(conversation));
  }, [conversation]);

  // Save insights to database whenever they change (for live calls)
  useEffect(() => {
    if (selectedCallSid && isLiveCall && insights.summary) {
      const saveInsights = async () => {
        try {
          await apiService.saveInsights(selectedCallSid, insights);
          console.log('💾 Saved insights to database');
        } catch (error) {
          console.error('Failed to save insights:', error);
        }
      };

      // Debounce the save to avoid too many database writes
      const timeoutId = setTimeout(saveInsights, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [insights, selectedCallSid, isLiveCall]);

  // Save emergency contacts to localStorage whenever they change
  useEffect(() => {
    console.log('💾 Saving emergency contacts to localStorage');
    localStorage.setItem('emergencyContacts', JSON.stringify(emergencyContacts));
    // Keep individual keys in sync (only if values present)
    if (emergencyContacts.hospital) localStorage.setItem('hospitalEmergencyNumber', emergencyContacts.hospital);
    if (emergencyContacts.fire) localStorage.setItem('fireEmergencyNumber', emergencyContacts.fire);
    if (emergencyContacts.police) localStorage.setItem('policeEmergencyNumber', emergencyContacts.police);
  }, [emergencyContacts]);

  // Persist notification history
  useEffect(() => {
    localStorage.setItem('notificationHistory', JSON.stringify(notificationHistory));
  }, [notificationHistory]);

  // Auto-dispatch: Set emergency type and search when entering dispatch section
  useEffect(() => {
    if (activeNavItem === 'dispatch') {
      // Use regular insights for live calls (training doesn't use dispatch)
      const currentInsights = insights;

      console.log('🚨 AUTO-DISPATCH DEBUG:');
      console.log('📊 Current insights:', currentInsights);
      console.log('🏥 Emergency type from insights:', currentInsights.emergency_type);
      console.log('📍 Location from insights:', currentInsights.location);
      console.log('🗺️ Current map location:', mapLocation);

      // Update map location from insights if available
      if (currentInsights.location && currentInsights.location.length > 0) {
        const insightsLocation = currentInsights.location[0];
        if (validateLocationText(insightsLocation)) {
          console.log('🔄 Updating map location from validated insights:', insightsLocation);
          geocodeLocation(insightsLocation).then(coords => {
            if (coords) {
              console.log('✅ Geocoded (validated) location:', coords);
              setMapLocation({
                latitude: coords.lat,
                longitude: coords.lng,
                address: insightsLocation,
                district: currentInsights.location[1] || mapLocation.district
              });
            } else {
              console.log('⚠️ Geocode failed for validated location, keeping existing map location');
            }
          });
        } else {
          console.log('🚫 Insights location not specific enough, skipping map centering:', insightsLocation);
        }
      }

      // Primary source: live call insights
      if (currentInsights.emergency_type) {
        console.log('🚨 Auto-dispatch: Using live call emergency type:', currentInsights.emergency_type);
        setDispatchEmergencyType(currentInsights.emergency_type);
      } else {
        // Fallback: training insights from localStorage
        const storedTraining = localStorage.getItem('trainingInsights');
        const storedType = localStorage.getItem('dispatchEmergencyType');
        let fallbackType: 'hospital' | 'police' | 'fire' | undefined = storedType as any;
        let trainingObj: any = null;
        if (storedTraining) {
          try {
            trainingObj = JSON.parse(storedTraining);
            if (!fallbackType && trainingObj?.emergency_type) {
              fallbackType = trainingObj.emergency_type;
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse trainingInsights from storage', e);
          }
        }
        if (fallbackType) {
          console.log('🔁 Auto-dispatch fallback to training emergency type:', fallbackType);
          setDispatchEmergencyType(fallbackType);
          // If live insights had no location, try training location
          if ((!currentInsights.location || currentInsights.location.length === 0) && trainingObj?.location?.length) {
            const trainLocation = trainingObj.location[0];
            console.log('📍 Fallback geocode using training location:', trainLocation);
            geocodeLocation(trainLocation).then(coords => {
              if (coords) {
                setMapLocation({
                  latitude: coords.lat,
                  longitude: coords.lng,
                  address: trainLocation,
                  district: trainingObj.location[1] || mapLocation.district
                });
              }
            });
          }
        } else {
          console.log('ℹ️ No emergency type in any insights, defaulting to hospital');
          setDispatchEmergencyType('hospital');
        }
      }

      // Auto-trigger search after a brief delay (works for both primary & fallback types)
      setTimeout(() => {
        if (dispatchMapRef.current) {
          console.log('🔍 Auto-dispatch: Searching stations for type:', dispatchEmergencyType);
          setIsSearchingStations(true);
          dispatchMapRef.current.searchNearestStations()
            .then(() => console.log('✅ Auto-dispatch: Station search done'))
            .catch(err => console.error('❌ Auto-dispatch search error', err))
            .finally(() => setIsSearchingStations(false));
        }
      }, 1000);
    }
  }, [activeNavItem, insights.emergency_type, insights.location]);

  // Background auto-dispatch without navigation: trigger once when we have both emergency type and location
  useEffect(() => {
    if (autoDispatchTriggered) return; // already handled
    
    const isTrainingMode = activeNavItem === 'training' && isTrainingInProgress;
    
    let emergencyType: 'hospital' | 'police' | 'fire' | undefined;
    let locationText: string | undefined;
    let liveLocation: { latitude: number; longitude: number; address?: string } | null = null;

    if (isTrainingMode) {
      // TRAINING CONTEXT: Only use training insights
      emergencyType = trainingInsights.emergency_type as any;
      locationText = trainingInsights.location?.[0];
      
      // Fallback to storage if current state is empty
      if (!emergencyType) emergencyType = localStorage.getItem('dispatchEmergencyType') as any;
      if (!locationText) locationText = localStorage.getItem('dispatchLocation');
      
    } else {
      // LIVE CALL CONTEXT: Only use live insights and live location data
      if (!isLiveCall && !selectedCallSid) return;

      emergencyType = insights.emergency_type as any;
      locationText = insights.location?.[0];
      
      // Check for live location data (highest priority for location)
      if (selectedCallSid) {
        liveLocation = locationData[selectedCallSid];
        if (liveLocation?.address) {
          locationText = liveLocation.address;
        }
      }
    }

    if (!emergencyType || !locationText) return;

    // Context check based on mode
    let hasEnoughContext = false;
    if (isTrainingMode) {
       hasEnoughContext = trainingConversation.length >= 4 || (trainingInsights.new_information_found && trainingConversation.length >= 2);
    } else {
       hasEnoughContext = conversation.length >= 4 || (insights.new_information_found && conversation.length >= 2);
    }

    // If we have live location (real call), we should trigger immediately regardless of context
    if (!isTrainingMode && !hasEnoughContext && !liveLocation) {
      return;
    }
    
    // For training, ensure we have enough conversation context
    if (isTrainingMode && !hasEnoughContext) {
       return;
    }

    // Do not attempt background dispatch if in training and location not validated
    if (isTrainingMode && !validateLocationText(locationText)) {
      console.log('🚫 Training location not validated, skipping background auto-dispatch');
      return;
    }

    // Geocode location text first
    // If we have live location coordinates, use them directly instead of geocoding
    const geocodePromise = liveLocation 
      ? Promise.resolve({ lat: liveLocation.latitude, lng: liveLocation.longitude })
      : geocodeLocation(locationText);

    geocodePromise.then(coords => {
      if (!coords) {
        console.log('⚠️ Auto-dispatch background: could not geocode location');
        return;
      }

      // Update map location to reflect the auto-dispatch target
      setMapLocation(prev => ({
        ...prev,
        latitude: coords.lat,
        longitude: coords.lng,
        address: locationText || prev.address,
        district: prev.district
      }));

      // Fetch nearest stations (lightweight copy of DispatchMap logic)
      const radius = 15000; // 15km
      const amenity = emergencyType === 'fire' ? 'fire_station' : emergencyType;
      const overpassQuery = `\n        [out:json][timeout:25];\n        (\n          node["amenity"="${amenity}"](around:${radius},${coords.lat},${coords.lng});\n          way["amenity"="${amenity}"](around:${radius},${coords.lat},${coords.lng});\n          relation["amenity"="${amenity}"](around:${radius},${coords.lat},${coords.lng});\n        );\n        out center;\n      `;
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 3959; // miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      fetch(overpassUrl)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Overpass error')))
        .then(data => {
          let stations: EmergencyStation[] = [];
          if (data.elements && data.elements.length > 0) {
            stations = data.elements.map((el: any) => {
              const lat = el.lat || el.center?.lat; const lon = el.lon || el.center?.lon;
              if (!lat || !lon) return null;
              return {
                id: el.id?.toString() || Math.random().toString(36).slice(2),
                name: el.tags?.name || `${emergencyType.charAt(0).toUpperCase() + emergencyType.slice(1)} Station`,
                type: emergencyType,
                latitude: lat,
                longitude: lon,
                distance: calculateDistance(coords.lat, coords.lng, lat, lon),
                address: 'Address pending'
              } as EmergencyStation;
            }).filter(Boolean);
            stations.sort((a, b) => a.distance - b.distance);
            stations = stations.slice(0, 5);
          } else {
            // Fallback demo stations (reuse pattern)
            const demoBase = [
              { name: 'Station Alpha', lat: coords.lat + 0.01, lon: coords.lng + 0.01 },
              { name: 'Station Beta', lat: coords.lat - 0.012, lon: coords.lng + 0.018 },
              { name: 'Station Gamma', lat: coords.lat + 0.02, lon: coords.lng - 0.013 },
              { name: 'Station Delta', lat: coords.lat - 0.018, lon: coords.lng - 0.017 },
              { name: 'Station Epsilon', lat: coords.lat + 0.005, lon: coords.lng + 0.022 }
            ];
            stations = demoBase.map((s, i) => ({
              id: `demo-${i}`,
              name: s.name,
              type: emergencyType,
              latitude: s.lat,
              longitude: s.lon,
              distance: calculateDistance(coords.lat, coords.lng, s.lat, s.lon),
              address: 'Demo Address'
            })) as EmergencyStation[];
            stations.sort((a, b) => a.distance - b.distance);
          }

          // Store in history as pending
          const id = Date.now().toString();
          setNotificationHistory(prev => [...prev, { id, title: 'Auto Dispatch Proposal', emergencyType, location: locationText, stations, status: 'pending', timestamp: new Date().toISOString() }]);

          // Show interactive toast with Approve/Deny
          toast({
            title: 'Nearest ' + emergencyType.charAt(0).toUpperCase() + emergencyType.slice(1) + ' Units',
            duration: 5000,
            description: (
              <div className="mt-2 text-xs space-y-2">
                <div className="text-xs text-gray-300">Location: {locationText}</div>
                <div className="space-y-1">
                  {stations.slice(0, 3).map((s, i) => (
                    <div key={s.id} className="flex justify-between">
                      <span>{i + 1}. {s.name}</span>
                      <span className="text-gray-400">{s.distance.toFixed(2)} mi</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => {
                      setDispatchEmergencyType(emergencyType);
                      setDispatchStations(stations);
                      // Ensure map reflects this auto-dispatch location before approve
                      setMapLocation(prev => ({ ...prev, latitude: coords.lat, longitude: coords.lng, address: locationText, district: prev.district }));
                      setNotificationHistory(prev => prev.map(n => n.id === id ? { ...n, status: 'approved' } : n));
                      setAutoDispatchTriggered(true);
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#1f1f1f] border border-[#333] text-white text-xs hover:bg-[#2a2a2a]">Approve</button>
                  <button
                    onClick={() => {
                      if (stations[0]) {
                        setDispatchEmergencyType(emergencyType);
                        setDispatchStations(stations);
                        setMapLocation(prev => ({ ...prev, latitude: coords.lat, longitude: coords.lng, address: locationText, district: prev.district }));
                        handleEmergencySMSAndCall(stations[0]).then(() => {
                          setNotificationHistory(prev => prev.map(n => n.id === id ? { ...n, status: 'sent' } : n));
                        });
                        setAutoDispatchTriggered(true);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#1f1f1f] border border-[#333] text-white text-xs hover:bg-[#2a2a2a]">SMS + Call</button>
                  <button
                    onClick={() => {
                      setNotificationHistory(prev => prev.map(n => n.id === id ? { ...n, status: 'denied' } : n));
                      setAutoDispatchTriggered(true);
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#1f1f1f] border border-[#333] text-white text-xs hover:bg-[#2a2a2a]">Deny</button>
                </div>
              </div>
            ),
            // Provide neutral styling (avoid destructive red)
            className: 'bg-[#121212] border border-[#333] text-white'
          });
        })
        .catch(err => {
          console.error('Auto-dispatch background Overpass error', err);
        });
    });
  }, [insights.emergency_type, insights.location, trainingInsights.emergency_type, trainingInsights.location, autoDispatchTriggered, locationData, selectedCallSid, conversation.length, insights.new_information_found, activeNavItem, isTrainingInProgress, trainingConversation.length, trainingInsights.new_information_found]);

  // Reset auto-dispatch trigger when switching calls or when call ends
  useEffect(() => {
    setAutoDispatchTriggered(false);
  }, [selectedCallSid, isLiveCall]);

  // Initialize protocol manager
  useEffect(() => {
    if (!protocolManagerRef.current) {
      try {
        protocolManagerRef.current = getProtocolManager();
      } catch (error) {
        console.error("Failed to initialize protocol manager:", error);
      }
    }
  }, []);

  // Auto-check protocol questions based on conversation content
  useEffect(() => {
    if (!protocolManagerRef.current || !selectedCallerNumber || conversation.length === 0) return;

    const conversationText = conversation.map(msg => msg.message).join(' ');

    // Check and mark questions after every message
    const result = protocolManagerRef.current.checkAndMarkQuestion(
      selectedCallerNumber,
      conversationText
    );

    if (result.updated) {
      // Update state with latest questions
      const state = protocolManagerRef.current.getSession(selectedCallerNumber);
      if (state) {
        setProtocolQuestions([...state.questions]);

        // Scroll to show new suggestions
        setTimeout(() => {
          conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }

    // Generate AI questions early based on conversation context (after 2-3 messages)
    if (!hasGeneratedAIQuestions && conversation.length >= 3) {
      setHasGeneratedAIQuestions(true);
      setIsGeneratingQuestions(true);
      protocolManagerRef.current.generateAdditionalQuestions(
        selectedCallerNumber,
        conversationText
      ).then(newQuestions => {
        if (newQuestions.length > 0) {
          const state = protocolManagerRef.current!.getSession(selectedCallerNumber);
          if (state) {
            setProtocolQuestions([...state.questions]);
          }
        }
      }).catch(error => {
        console.error("Failed to generate AI questions:", error);
      }).finally(() => {
        setIsGeneratingQuestions(false);
      });
    }
  }, [conversation, selectedCallerNumber, hasGeneratedAIQuestions]);

  // Auto-check protocol questions for TRAINING based on conversation content
  useEffect(() => {
    if (!protocolManagerRef.current || !activeTrainingSession || trainingConversation.length === 0) return;

    const conversationText = trainingConversation.map(msg => msg.message).join(' ');

    // Check and mark questions after every message
    const result = protocolManagerRef.current.checkAndMarkQuestion(
      activeTrainingSession,
      conversationText
    );

    if (result.updated) {
      setTrainingUpdateTrigger(prev => prev + 1);
    }

    // Generate AI questions early based on conversation context (after 2-3 messages)
    if (!hasGeneratedTrainingAIQuestions && trainingConversation.length >= 3) {
      setHasGeneratedTrainingAIQuestions(true);
      setIsGeneratingQuestions(true);
      protocolManagerRef.current.generateAdditionalQuestions(
        activeTrainingSession,
        conversationText
      ).then(newQuestions => {
        if (newQuestions.length > 0) {
          setTrainingUpdateTrigger(prev => prev + 1);
        }
      }).catch(error => {
        console.error("Failed to generate AI questions for training:", error);
      }).finally(() => {
        setIsGeneratingQuestions(false);
      });
    }
  }, [trainingConversation, activeTrainingSession, hasGeneratedTrainingAIQuestions]);

  // MapBox reverse geocoding helper
  const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!mapboxToken) {
        console.error('MapBox token not configured');
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}`
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const place = data.features[0];
        return place.place_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }

      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };
  // WebSocket for call notifications
  const { isConnected: notificationsConnected, sendMessage: sendNotificationMessage } = useWebSocket({
    url: apiService.getWebSocketUrl('/client/notifications'),
    autoReconnect: false, // Disable auto-reconnect to prevent spam
    onOpen: () => {
      console.log('🔔 Notification WebSocket CONNECTED');
    },
    onClose: () => {
      console.log('🔔 Notification WebSocket DISCONNECTED');
    },
    onMessage: async (message: TranscriptionMessage) => {
      console.log('🔔 Notification received:', message);
      const msg = message as any;
      if (msg.type === 'location_update' && msg.location) {
        // Handle location data received from backend
        const { latitude, longitude, caller_number, call_sid } = msg.location;
        console.log('📍 Location received via WebSocket:', msg.location);
        console.log('📍 Caller number from location:', caller_number);
        console.log('📍 Call SID from location:', call_sid);

        if (latitude && longitude) {
          // Reverse geocode to get address
          reverseGeocode(latitude, longitude).then(address => {
            // Send address back to server for AI
            if (call_sid && address) {
              console.log('📤 Sending address update to server for AI:', address);
              sendNotificationMessage(JSON.stringify({
                type: 'address_update',
                call_sid: call_sid,
                address: address
              }));
            }

            const locationInfo = {
              latitude,
              longitude,
              address,
              timestamp: new Date().toISOString()
            };

            // Use the provided call_sid directly if available
            if (call_sid) {
              console.log('📍 Using provided call_sid:', call_sid);
              
              // Store location data
              setLocationData(prev => {
                const updated = {
                  ...prev,
                  [call_sid]: locationInfo
                };
                console.log('✅ Location data updated for call_sid:', call_sid);
                console.log('📍 Updated locationData state:', updated);
                console.log('📍 All stored call_sids:', Object.keys(updated));
                return updated;
              });
              
              // Clear the "Link Sent" state for this number
              if (caller_number) {
                 setLinkSent(prev => {
                   const newState = { ...prev };
                   delete newState[caller_number];
                   return newState;
                 });
              }

              // Show toast notification
              toast({
                title: "📍 Location Received",
                description: address,
              });
              
              // Update map location
              setMapLocation(prev => ({
                ...prev,
                latitude,
                longitude,
                address,
                district: prev.district
              }));

              console.log('✅ Location stored for call_sid:', call_sid);
            } else if (caller_number) {
              // Fallback: find call_sid from calls list by phone number
              const normalizedCaller = caller_number.replace(/\D/g, '');
              
              setCalls(prevCalls => {
                const matchingCall = prevCalls.find(call => {
                  const normalizedCallPhone = call.phone.replace(/\D/g, '');
                  return normalizedCallPhone.includes(normalizedCaller) || normalizedCaller.includes(normalizedCallPhone);
                });
                
                if (matchingCall && matchingCall.call_sid) {
                  const foundCallSid = matchingCall.call_sid;
                  console.log('📍 Found call_sid from calls list (fuzzy match):', foundCallSid);
                  
                  // Schedule location update after this state update
                  setTimeout(() => {
                    setLocationData(prev => {
                      const updated = {
                        ...prev,
                        [foundCallSid]: locationInfo
                      };
                      console.log('✅ Location data updated for call_sid (fuzzy):', foundCallSid);
                      console.log('📍 Updated locationData state:', updated);
                      return updated;
                    });
                    
                    setLinkSent(prev => {
                      const newState = { ...prev };
                      delete newState[caller_number];
                      return newState;
                    });

                    toast({
                      title: "📍 Location Received",
                      description: address,
                    });
                    
                    setMapLocation(prev => ({
                      ...prev,
                      latitude,
                      longitude,
                      address,
                      district: prev.district
                    }));
                  }, 0);
                } else {
                  console.log('⚠️ Could not find call_sid for location update');
                }
                
                return prevCalls; // Don't modify calls
              });
            } else {
              console.log('⚠️ No call_sid or caller_number provided for location update');
            }
          });
        }
      } else if (message.type === 'call_started') {
        // Check if call already exists to prevent duplicates
        setCalls(prev => {
          const exists = prev.some(call => call.call_sid === message.call_sid);
          if (exists) {
            return prev; // Don't add duplicate
          }

          const newCall: Call = {
            phone: (message.caller_number && message.caller_number !== 'unknown') ? message.caller_number : 'Unknown Caller',
            preview: 'Incoming call...',
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
            language: 'English',
            isLive: true,
            call_sid: message.call_sid,
          };

          // Clear conversation and insights for new call
          console.log('🆕 New call started - clearing conversation and insights. Caller:', newCall.phone);
          setConversation([]);
          setInsights({
            summary: "",
            location: [],
            persons_described: [],
            additional_info: [],
            incident: {},
            time_info: {},
            new_information_found: false
          });

          // Location data will be set when location_update message arrives
          // No need to clear here as each call has unique call_sid

          // Reset insights extractor for new call
          if (insightsExtractorRef.current) {
            insightsExtractorRef.current = getInsightsExtractor();
          }

          // Add to active messages
          setActiveMessages(prevMessages => {
            const exists = prevMessages.some(msg => msg.number === message.caller_number);
            if (!exists && message.caller_number) {
              return [...prevMessages, {
                number: message.caller_number,
                timestamp: new Date().toISOString()
              }];
            }
            return prevMessages;
          });

          // Schedule toast to be shown in effect
          setPendingToast({
            title: "Incoming Call",
            description: `Call from ${message.caller_number}`,
          });

          // Auto-select this call (set it as the active call)
          setTimeout(() => {
            setSelectedIncident(0); // Since new call is added at index 0
            setSelectedCallSid(message.call_sid);
            setSelectedCallerNumber(newCall.phone);
            setIsLiveCall(true);
            setDetectedLanguage('English');
            setActiveNavItem('calls'); // Switch to calls view

            // Clear old conversation and insights for new call
            setConversation([]);
            setInsights({
              summary: "",
              location: [],
              persons_described: [],
              additional_info: [],
              incident: {},
              time_info: {},
              new_information_found: false,
              emergency_type: undefined
            });
            setProtocolQuestions([]);

            console.log('📞 Auto-selected incoming call:', message.caller_number);
          }, 100); // Small delay to ensure calls array is updated

          return [newCall, ...prev];
        });
      } else if (message.type === 'call_ended') {
        console.log('📴 Call ended:', message.call_sid);

        // Immediately update the call in the list to show it as ended
        setCalls(prev => prev.map(call =>
          call.call_sid === message.call_sid
            ? { ...call, isLive: false }
            : call
        ));

        // Stop audio recording when call ends
        if (audioServiceRef.current) {
          audioServiceRef.current.stopRecording();
          audioServiceRef.current.stopPlayback();
        }

        // Turn off microphone
        setIsMicActive(false);

        // Clear protocol session if it's the current call
        if (message.call_sid === selectedCallSid && selectedCallerNumber) {
          if (protocolManagerRef.current) {
            // Clear the protocol session for this caller
            const state = protocolManagerRef.current.getSession(selectedCallerNumber);
            if (state) {
              // Reset the session
              protocolManagerRef.current.initializeSession(selectedCallerNumber);
            }
          }
        }

        // Stop insights streaming
        setIsStreamingInsights(false);

        // Reload call history from database to get the updated call data
        // Add a small delay to ensure DB is updated
        setTimeout(async () => {
          try {
            await loadCallHistory();
            console.log('✅ Call history reloaded after call ended');

            // If this was the selected call, reload its data from the database
            if (message.call_sid === selectedCallSid) {
              const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

              try {
                // Load transcripts
                const transcriptsRes = await fetch(`${API_BASE_URL}/api/calls/${message.call_sid}/transcripts`);
                const transcriptsData = await transcriptsRes.json();

                if (transcriptsData.status === 'success' && transcriptsData.transcripts) {
                  const loadedConversation = transcriptsData.transcripts.map((t: any) => ({
                    sender: t.speaker,
                    time: t.time,
                    message: t.message,
                  }));
                  setConversation(loadedConversation);
                  console.log(`📜 Loaded ${loadedConversation.length} transcripts after call ended`);
                }

                // Load insights
                const insightsRes = await fetch(`${API_BASE_URL}/api/calls/${message.call_sid}/insights`);
                const insightsData = await insightsRes.json();

                if (insightsData.status === 'success' && insightsData.insights) {
                  setInsights(insightsData.insights);
                  if (insightsData.insights.protocol_questions) {
                    setProtocolQuestions(insightsData.insights.protocol_questions);
                  }
                  console.log('💡 Loaded insights after call ended');
                }

                // Load location
                const locationRes = await fetch(`${API_BASE_URL}/api/calls/${message.call_sid}/location`);
                const locationData = await locationRes.json();

                if (locationData.status === 'success' && locationData.location) {
                  setLocationData(prev => ({
                    ...prev,
                    [message.call_sid]: {
                      latitude: locationData.location.latitude,
                      longitude: locationData.location.longitude,
                      address: locationData.location.address,
                      timestamp: locationData.location.timestamp
                    }
                  }));
                  console.log('📍 Loaded location after call ended');
                }
              } catch (error) {
                console.error('Error loading call data after end:', error);
              }
            }
          } catch (error) {
            console.error('❌ Failed to reload call history:', error);
          }
        }, 1500);

        // Clear selected call if it's the one that ended
        if (message.call_sid === selectedCallSid) {
          setIsLiveCall(false);
          setSelectedCallerNumber(null); // Clear caller number to stop WebSocket
        }
      }
    },
  });

  // WebSocket for transcription
  const transcriptionUrl = selectedCallerNumber
    ? apiService.getWebSocketUrl(`/client/${selectedCallerNumber}`)
    : '';

  const { isConnected: transcriptionConnected, sendMessage } = useWebSocket({
    url: transcriptionUrl,
    autoReconnect: isLiveCall, // Only auto-reconnect for live calls
    onOpen: () => {
      console.log('✅ Transcription WebSocket CONNECTED for:', selectedCallerNumber);
    },
    onClose: () => {
      console.log('❌ Transcription WebSocket DISCONNECTED');
    },
    onMessage: async (message: TranscriptionMessage) => {
      // Log all message types
      if (message.type === 'audio') {
        // Only log audio occasionally to avoid spam
        if (Math.random() < 0.001) {
          console.log('📨 Audio message (sample):', {
            audioLength: message.audio?.length,
            encoding: (message as any).encoding,
            sampleRate: (message as any).sample_rate,
          });
        }
      } else {
        console.log('📨 Received message:', message.type, message);
      }

      // Handle audio playback from phone
      if (message.type === 'audio' && message.audio) {
        // Only play audio if it matches the selected call SID
        // This prevents hearing multiple audio streams if there are multiple active calls from the same number
        if (message.call_sid && selectedCallSid && message.call_sid !== selectedCallSid) {
          return;
        }

        // Check if this is AI audio and if AI audio is disabled
        const speaker = (message as any).speaker;
        if ((speaker === 'AI Agent' || speaker === 'Dispatch (Translated)') && !isAiAudioEnabled) {
          return;
        }

        try {
          if (!audioServiceRef.current) {
            audioServiceRef.current = new AudioService();
            console.log('🎵 Created new AudioService instance');
          }
          // Check encoding type (pcm16 or ulaw)
          const encoding = (message as any).encoding || 'pcm16';
          await audioServiceRef.current.playAudio(message.audio, encoding);
        } catch (error) {
          console.error('❌ Failed to play audio:', error);
        }
        return;
      }

      // Handle AI transfer event
      if (message.type === 'ai_transfer') {
        console.log('🚨 AI Transfer event received:', message.reason);
        setIsAiActive(false);
        toast({
          title: "Call Transferred",
          description: "AI Agent has transferred the call to you.",
          variant: "default",
        });
        return;
      }

      // Handle system events (like location link sent)
      if ((message as any).type === 'system_event') {
        if ((message as any).event === 'location_link_sent') {
          console.log('🔗 Location link sent event received for:', (message as any).caller_number);
          if ((message as any).caller_number) {
            setLinkSent(prev => ({ ...prev, [(message as any).caller_number]: Date.now() }));
            toast({
              title: "✅ Tracking Link Sent (AI)",
              description: `AI Agent sent location link to ${(message as any).caller_number}`,
            });
          }
        }
        return;
      }

      if (message.type === 'transcription' && message.speaker && message.message) {
        console.log('📝 Processing transcription:', message);
        
        // Translate message based on speaker and selected language
        let translatedMessage = message.message;
        let isTranslated = false;
        const originalMessage = message.message;
        const targetLang = detectedLanguage.toLowerCase();

        try {
          if (message.speaker === 'CALLER') {
            // Translate caller's message to dispatcher's selected language
            console.log('🔄 Translating CALLER message to dispatcher language:', targetLang);

            if (targetLang === 'english' || targetLang === 'en') {
              // Dispatcher speaks English - translate caller to English
              const result = await translateCallerMessage(message.message);

              // Check if source and target are the same (both English)
              const sourceLangCode = result.sourceLanguage.toLowerCase();
              const isSameLanguage = sourceLangCode === 'en' || sourceLangCode === 'english';

              translatedMessage = result.translated;
              isTranslated = !isSameLanguage && translatedMessage.toLowerCase().trim() !== message.message.toLowerCase().trim();

              console.log('✅ CALLER Translation to English:', {
                original: message.message,
                translated: translatedMessage,
                detectedLanguage: result.sourceLanguage,
                isSameLanguage,
                isTranslated
              });
            } else {
              // Dispatcher speaks another language - translate caller to that language
              const result = await translateDispatcherMessage(message.message, targetLang);

              // Normalize language codes for comparison
              const sourceLangCode = result.sourceLanguage.toLowerCase();
              const targetLangCode = targetLang.toLowerCase();

              // Check if both languages are the same
              const isSameLanguage = sourceLangCode === targetLangCode ||
                sourceLangCode.startsWith(targetLangCode) ||
                targetLangCode.startsWith(sourceLangCode);

              translatedMessage = result.translated;
              isTranslated = !isSameLanguage && translatedMessage.toLowerCase().trim() !== message.message.toLowerCase().trim();

              console.log('✅ CALLER Translation to dispatcher language:', {
                original: message.message,
                translated: translatedMessage,
                sourceLanguage: result.sourceLanguage,
                targetLanguage: targetLang,
                isSameLanguage,
                isTranslated
              });
            }
          } else if (message.speaker === 'DISPATCH') {
            // Dispatcher message - no translation needed for display
            // (Server handles audio translation to caller's phone based on caller's detected language)
            console.log('⏭️ DISPATCH message - no translation needed (dispatcher language)');
            translatedMessage = message.message;
            isTranslated = false;
          } else if (message.speaker === 'AI Agent') {
             console.log('🤖 AI Agent message - no translation needed');
             translatedMessage = message.message;
             isTranslated = false;
          }
        } catch (error) {
          console.error('❌ Translation error:', error);
          // Keep original message if translation fails
        }

        // Determine sender label
        let senderLabel = 'Dispatch';
        if (message.speaker === 'CALLER') {
            senderLabel = 'Caller';
        } else if (message.speaker === 'AI Agent') {
            senderLabel = 'AI Agent';
        }

        const newMessage: ConversationMessage = {
          sender: senderLabel,
          time: new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }),
          message: translatedMessage, // Use translated message
          originalMessage: isTranslated ? originalMessage : undefined,
          isTranslated: isTranslated,
          is_final: message.is_final,
        };

        console.log('➕ Adding message to conversation:', newMessage);

        // Show interim results for faster feedback, replace with final
        if (message.is_final) {
          // Replace any interim message from same speaker with final version
          setConversation(prev => {
            const lastMsg = prev[prev.length - 1];
            // Check if last message is from same sender and is NOT final (interim)
            if (lastMsg && lastMsg.sender === newMessage.sender && !lastMsg.is_final) {
              // Replace interim with final
              console.log('🔄 Replacing interim message with final');
              return [...prev.slice(0, -1), newMessage];
            }
            console.log('➕ Appending final message');
            return [...prev, newMessage];
          });

          // Send CALLER messages to insights API for live analysis
          if (message.speaker === 'CALLER' && selectedCallerNumber) {
            console.log('📊 Processing CALLER message with client-side AI:', message.message);

            // Initialize insights extractor if not already done
            if (!insightsExtractorRef.current) {
              try {
                insightsExtractorRef.current = getInsightsExtractor();
                console.log('✅ Insights extractor initialized');
              } catch (error) {
                console.error('❌ Failed to initialize insights extractor:', error);
                toast({
                  title: "Insights Error",
                  description: "Failed to initialize AI. Check VITE_GOOGLE_API_KEY in .env",
                  variant: "destructive",
                });
                return;
              }
            }

            // Process the message with AI (runs in browser)
            insightsExtractorRef.current
              .processSentence(message.message, selectedCallerNumber)
              .then(async (updatedInsights) => {
                console.log('✅ Insights updated (client-side):', updatedInsights);
                setInsights(updatedInsights);

                // Save insights to database
                if (selectedCallSid) {
                  try {
                    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                    await fetch(`${API_BASE_URL}/api/calls/${selectedCallSid}/insights`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        ...updatedInsights,
                        protocol_questions: protocolQuestions
                      }),
                    });
                  } catch (error) {
                    console.error('Failed to save insights to DB:', error);
                  }
                }

                // Update map location if location information is found
                if (updatedInsights.location && updatedInsights.location.length > 0) {
                  const locationText = updatedInsights.location[0];
                  console.log('📍 Location found in insights:', locationText);

                  // Try to geocode the location (simplified - in production use a real geocoding API)
                  geocodeLocation(locationText).then(coords => {
                    if (coords) {
                      setMapLocation({
                        latitude: coords.lat,
                        longitude: coords.lng,
                        address: locationText,
                        district: updatedInsights.location[1] || mapLocation.district
                      });
                      console.log('✅ Map updated to:', coords);

                      toast({
                        title: "Location Updated",
                        description: `Map centered on ${locationText}`,
                      });
                    }
                  });
                }

                // Show toast for significant updates
                if (updatedInsights.new_information_found) {
                  toast({
                    title: "Insights Updated",
                    description: "New information extracted from caller",
                  });
                }
              })
              .catch(err => {
                console.error('❌ Failed to process insights:', err);
                toast({
                  title: "Insights Error",
                  description: "Failed to process caller message",
                  variant: "destructive",
                });
              });
          }
        } else {
          // Show interim result (will be replaced by final)
          setConversation(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.sender === newMessage.sender && !lastMsg.is_final) {
              // Update existing interim message
              return [...prev.slice(0, -1), newMessage];
            }
            return [...prev, newMessage];
          });
        }
      }
    },
  });

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, trainingConversation]);

  // Log when caller number changes
  useEffect(() => {
    if (selectedCallerNumber) {
      console.log('📞 Selected caller number:', selectedCallerNumber);
      console.log('🔗 Transcription WebSocket URL:', transcriptionUrl);
    }
  }, [selectedCallerNumber, transcriptionUrl]);

  const handleLogout = () => {
    navigate("/");
  };

  const handleClearDatabase = async () => {
    if (window.confirm('Are you sure you want to delete ALL data from the database? This will permanently remove all call history, transcripts, insights, and logs. This action cannot be undone.')) {
      try {
        await apiService.clearDatabase();
        localStorage.clear();

        // Reset all state variables immediately
        setCalls([]);
        setConversation([]);
        setInsights({
          summary: "",
          location: [],
          persons_described: [],
          additional_info: [],
          incident: {},
          time_info: {},
          new_information_found: false,
          emergency_type: undefined
        });
        setProtocolQuestions([]);
        setLocationData({});
        setSelectedCallSid(null);
        setTrainingLogs([]);
        setTrainingConversation([]);
        setActiveNavItem('calls');

        toast({
          title: "Database Cleared",
          description: "All data has been permanently deleted. The page will reload.",
        });
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to clear database",
          variant: "destructive",
        });
      }
    }
  };

  // Load settings from backend
  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const response = await fetch('http://localhost:8000/api/settings');
      const data = await response.json();

      if (data.status === 'success' && data.settings) {
        setCallForwardNumber(data.settings.call_forward_number || '');
        setDefaultLanguage(data.settings.default_translation_language || 'en');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  // Save call forwarding settings
  const saveCallForwarding = async () => {
    setSavingSettings(true);
    try {
      const response = await fetch('http://localhost:8000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_forward_number: callForwardNumber || null,
          default_translation_language: defaultLanguage,
        }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        toast({
          title: 'Success',
          description: 'Call forwarding settings saved',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save call forwarding settings',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Save emergency numbers separately
  const saveEmergencyNumbers = async () => {
    // Basic validation: allow empty (disables), else must start with '+' and contain digits
    const entries: Array<[string, string]> = [
      ['Hospital', hospitalNumber],
      ['Fire', fireNumber],
      ['Police', policeNumber]
    ];
    for (const [label, num] of entries) {
      if (num && !/^\+\d{5,}$/.test(num)) {
        toast({
          title: 'Invalid Number',
          description: `${label} number must be in +<country><digits> format`,
          variant: 'destructive'
        });
        return;
      }
    }

    setSavingSettings(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergency_hospital: hospitalNumber || null,
          emergency_fire: fireNumber || null,
          emergency_police: policeNumber || null
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setEmergencyContacts({
          hospital: hospitalNumber,
          fire: fireNumber,
          police: policeNumber
        });
        
        // Keep localStorage as backup/cache
        localStorage.setItem('hospitalEmergencyNumber', hospitalNumber);
        localStorage.setItem('fireEmergencyNumber', fireNumber);
        localStorage.setItem('policeEmergencyNumber', policeNumber);
        
        toast({
          title: 'Emergency Numbers Saved',
          description: 'Hospital, Fire, and Police contacts updated to database.'
        });
      } else {
        throw new Error(data.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving emergency numbers:', error);
      toast({
        title: 'Error',
        description: 'Failed to save emergency numbers to database',
        variant: 'destructive'
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Save language settings
  const saveLanguagePreference = async () => {
    setSavingSettings(true);
    try {
      const response = await fetch('http://localhost:8000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_forward_number: callForwardNumber || null,
          default_translation_language: defaultLanguage,
        }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        toast({
          title: 'Success',
          description: 'Language preference saved',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save language preference',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const handleNavClick = (item: string) => {
    console.log(`🔄 Navigating from ${activeNavItem} to ${item}`);
    setActiveNavItem(item);

    // DON'T reset training data when navigating away - let localStorage persist it
    // Only log the navigation
    if (item === "training") {
      console.log('📚 Entering training section');
      console.log('📊 Current training logs:', trainingLogs.length);
      console.log('💾 Training insights from storage:', trainingInsights);
    } else if (activeNavItem === "training") {
      console.log('📚 Leaving training section - data saved to localStorage');
    }
  };

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
  };

  const handleShare = () => {
    console.log("Sharing incident...");
    alert("Share functionality activated");
  };

  const handleManage = () => {
    console.log("Managing incident...");
    alert("Manage functionality activated");
  };

  const handleCopy = () => {
    console.log("Copying to clipboard...");
    navigator.clipboard.writeText("John Smith is filing a noise complaint about a large party in a neighboring apartment at 123 Main Street. The party involves approximately 100 people and has been ongoing for at least 3 hours.");
    alert("Copied to clipboard!");
  };

  const handleAnalyze = () => {
    console.log("Analyzing incident...");
    alert("Analysis started...");
  };

  const handleEmergencySMS = async (station: EmergencyStation) => {
    try {
      const configuredContact = emergencyContacts[station.type];
      if (!configuredContact) {
        toast({ title: 'Missing Contact Info', description: `Configure ${station.type} number in Settings.`, variant: 'destructive' });
        return false;
      }
      console.log('📤 [DEBUG] Starting emergency SMS send', { station: station.name, type: station.type, to: configuredContact });
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapLocation.latitude},${mapLocation.longitude}`;
      const response = await fetch(`${API_BASE_URL}/sms/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_number: configuredContact,
          insights_data: insights,
          location_address: mapLocation.address || `${mapLocation.latitude}, ${mapLocation.longitude}`,
          maps_link: mapsLink,
          emergency_type: dispatchEmergencyType,
          station_name: station.name
        })
      });
      if (!response.ok) throw new Error('Failed to send emergency SMS');
      toast({ title: 'SMS Sent', description: `Alert sent to ${station.name}` });
      console.log('✅ [DEBUG] Emergency SMS success', { station: station.name, type: station.type });
      return true;
    } catch (error) {
      console.error('❌ Error sending emergency SMS:', error);
      toast({ title: 'SMS Failed', description: 'Failed to send emergency alert', variant: 'destructive' });
      return false;
    }
  };

  const handleEmergencyCall = async (station: EmergencyStation) => {
    try {
      const configuredContact = emergencyContacts[station.type];
      if (!configuredContact) {
        toast({ title: 'Missing Contact Info', description: `Configure ${station.type} number in Settings.`, variant: 'destructive' });
        return false;
      }
      console.log('📞 [DEBUG] Starting emergency CALL', { station: station.name, type: station.type, to: configuredContact });
      const response = await fetch(`${API_BASE_URL}/call/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_number: configuredContact,
          insights_data: insights,
          location_address: mapLocation.address || `${mapLocation.latitude}, ${mapLocation.longitude}`,
          emergency_type: dispatchEmergencyType
        })
      });
      if (!response.ok) throw new Error('Failed to initiate emergency call');
      toast({ title: 'Call Initiated', description: `Emergency call placed to ${station.name}` });
      console.log('✅ [DEBUG] Emergency CALL success', { station: station.name, type: station.type });
      return true;
    } catch (error) {
      console.error('❌ Error initiating emergency call:', error);
      toast({ title: 'Call Failed', description: 'Failed to initiate emergency call', variant: 'destructive' });
      return false;
    }
  };

  const handleEmergencySMSAndCall = async (station: EmergencyStation) => {
    console.log('🔁 [DEBUG] Sequential SMS+Call triggered', { station: station.name, type: station.type });
    const smsOk = await handleEmergencySMS(station);
    if (!smsOk) return;
    setTimeout(() => { handleEmergencyCall(station); }, 500);
  };

  const handleSendMessage = () => {
    if (activeNavItem === "training" && activeTrainingSession) {
      // Handle training message
      if (messageText.trim()) {
        handleTrainingMessage(messageText.trim());
        setMessageText("");
        setIsMessageFieldVisible(false);
      }
    } else {
      // Handle regular call message
      if (messageText.trim() && selectedCallSid) {
        sendMessage(JSON.stringify({
          type: 'message',
          message: messageText.trim(),
        }));

        setConversation(prev => [...prev, {
          sender: 'Dispatch',
          time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }),
          message: messageText.trim(),
          is_final: true,
        }]);

        setMessageText("");
        setIsMessageFieldVisible(false);
      }
    }
  };

  // Training functions
  // Helper: Clear previous training-related persistence for a truly fresh session
  const clearLocalStorageForTraining = () => {
    try {
      console.log('🧹 Clearing previous training data from localStorage');
      const keysToRemove = [
        'trainingLogs',
        'trainingConversation',
        'trainingInsights',
        'trainingConfidence',
        'trainingEvaluation',
        'dispatchEmergencyType', // remove any emergency type derived from old training
        'dispatchLocation',
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (err) {
      console.error('Failed clearing training localStorage:', err);
    }
  };

  const handleStartTraining = async () => {
    try {
      // Clear all old training artifacts before starting a brand new session
      clearLocalStorageForTraining();

      // Clear previous evaluation state
      setTrainingEvaluation(null);
      setTrainingConfidence(null);
      setIsTrainingInProgress(true);
      setTrainingStartTime(Date.now());

      const sessionId = `training_${Date.now()}`;

      const response = await fetch(`${API_BASE_URL}/training/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to start training session');
      }

      const data = await response.json();

      // Create new training log
      const newTrainingLog: TrainingLog = {
        session_id: sessionId,
        scenario: data.caller_response ? data.caller_response.substring(0, 50) + "..." : "Emergency scenario training",
        date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
        time: "00:00",
        status: "active" as const,
        started_at: new Date().toISOString()
      };

      setTrainingLogs(prev => [newTrainingLog, ...prev]);
      setActiveTrainingSession(sessionId);
      setHasGeneratedTrainingAIQuestions(false);
      setSelectedIncident(0);

      // Select random voice for this training session
      elevenlabsService.selectRandomVoice();
      console.log('🎤 Random voice selected for training session');

      // Initialize protocol manager for training
      if (protocolManagerRef.current) {
        protocolManagerRef.current.initializeSession(sessionId);
        console.log('✅ Protocol questions initialized for training session');
      }

      // Initialize training conversation and insights
      if (data.caller_response) {
        setTrainingConversation([{
          sender: 'Caller',
          time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }),
          message: data.caller_response,
          is_final: true,
        }]);

        // Convert caller's initial message to speech
        elevenlabsService.textToSpeech(data.caller_response).catch(error => {
          console.error('❌ Failed to play TTS for initial message:', error);
        });

        // Initialize insights extractor for training
        try {
          if (!trainingInsightsExtractorRef.current) {
            trainingInsightsExtractorRef.current = getInsightsExtractor();
            console.log('✅ Training insights extractor initialized');
          }

          // Extract insights from initial caller message
          const initialInsights = await trainingInsightsExtractorRef.current.processSentence(
            data.caller_response,
            sessionId,
            'Training Caller'
          );
          setTrainingInsights(initialInsights);
          console.log('✅ Initial training insights extracted:', initialInsights);

          // Update map location if location information is found
          if (initialInsights.location && initialInsights.location.length > 0) {
            const locationText = initialInsights.location[0];
            console.log('📍 Initial location found:', locationText);

            geocodeLocation(locationText).then(coords => {
              if (coords) {
                setMapLocation({
                  latitude: coords.lat,
                  longitude: coords.lng,
                  address: locationText,
                  district: initialInsights.location[1] || mapLocation.district
                });
                console.log('✅ Map updated to:', coords);
              }
            });
          }
        } catch (error) {
          console.error('❌ Error initializing training insights:', error);
        }
      }

      toast({
        title: "Training Started",
        description: "New training session has begun",
      });

    } catch (error) {
      console.error('Error starting training:', error);
      setIsTrainingInProgress(false);
      toast({
        title: "Training Error",
        description: error instanceof Error ? error.message : "Failed to start training session",
        variant: "destructive",
      });
    }
  };

  const handleTrainingMessage = async (message: string) => {
    if (!activeTrainingSession) return;
    try {
      const dispatchMessage: ConversationMessage = {
        sender: 'Dispatch',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        message,
        is_final: true,
      };
      setTrainingConversation(prev => [...prev, dispatchMessage]);

      const response = await fetch(`${API_BASE_URL}/training/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeTrainingSession, message })
      });
      if (!response.ok) throw new Error('Failed to send training message');
      const data = await response.json();

      if (data.caller_response) {
        const callerMsg: ConversationMessage = {
          sender: 'Caller',
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          message: data.caller_response,
          is_final: true,
        };
        setTrainingConversation(prev => [...prev, callerMsg]);

        // TTS playback
        elevenlabsService.textToSpeech(data.caller_response).catch(err => console.error('TTS error:', err));

        // Ensure extractor
        if (!trainingInsightsExtractorRef.current) {
          trainingInsightsExtractorRef.current = getInsightsExtractor();
        }
        try {
          const updatedInsights = await trainingInsightsExtractorRef.current.processSentence(
            data.caller_response,
            activeTrainingSession,
            'Training Caller'
          );
          setTrainingInsights(updatedInsights);

          // Map update if specific location
          if (updatedInsights.location && updatedInsights.location.length > 0) {
            const locationText = updatedInsights.location[0];
            if (validateLocationText(locationText)) {
              geocodeLocation(locationText).then(coords => {
                if (coords) {
                  setMapLocation(prev => ({
                    ...prev,
                    latitude: coords.lat,
                    longitude: coords.lng,
                    address: locationText,
                    district: updatedInsights.location[1] || prev.district
                  }));
                  toast({ title: 'Location Updated', description: `Map centered on ${locationText}` });
                }
              });
            }
          }
        } catch (err) {
          console.error('Insights extraction error (training):', err);
        }
      }
    } catch (error) {
      console.error('Error sending training message:', error);
      toast({ title: 'Training Error', description: error instanceof Error ? error.message : 'Failed to send message', variant: 'destructive' });
    }
  };

  const handleStopTraining = async () => {
    if (!activeTrainingSession) return;

    // Stop any playing audio and reset voice
    elevenlabsService.resetVoice();

    try {
      const response = await fetch(`${API_BASE_URL}/training/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: activeTrainingSession }),
      });

      if (!response.ok) {
        throw new Error('Failed to end training session');
      }

      const data = await response.json();

      // Calculate duration
      const duration = trainingStartTime
        ? formatDuration(Date.now() - trainingStartTime)
        : "00:00";

      // Stop microphone if active
      if (isMicActive) {
        stopSpeechRecognition();
        setIsMicActive(false);
      }

      // Update state with evaluation results
      setTrainingEvaluation(data.evaluation);
      setTrainingConfidence(data.confidence_score);
      setIsTrainingInProgress(false);
      setTrainingStartTime(null);

      // Update the log status to completed
      setTrainingLogs(prev => prev.map(log =>
        log.session_id === activeTrainingSession
          ? {
            ...log,
            status: 'completed',
            evaluation: data.evaluation,
            confidence_score: data.confidence_score,
            ended_at: new Date().toISOString(),
            duration: duration
          }
          : log
      ));

      // Show feedback
      toast({
        title: "Training Ended",
        description: "Session completed. Check Insights for evaluation.",
      });

      // Switch to Insights tab to show results
      setActiveTab('insights');

    } catch (error) {
      console.error('Error ending training:', error);
      setIsTrainingInProgress(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to end training session properly",
        variant: "destructive",
      });
      setIsTrainingInProgress(false);
    }
  };

  const handleTrainingLogClick = (idx: number) => {
    console.log(`📋 Clicked training log #${idx + 1}`);
    setSelectedIncident(idx);
    const log = trainingLogs[idx];
    console.log('📊 Training log data:', log);

    if (log.session_id === activeTrainingSession) {
      // If it's the active session, keep current conversation
      console.log('✅ Active session - keeping current conversation');
      return;
    }

    // Load conversation from the log
    if (log.conversation && log.conversation.length > 0) {
      console.log(`💬 Loading ${log.conversation.length} messages from log`);
      setTrainingConversation(log.conversation);
    } else {
      console.log('⚠️ No conversation found in log');
      setTrainingConversation([]);
    }

    // Load insights if available (but clear emergency_type to prevent notifications)
    if (log.insights) {
      console.log('📊 Loading insights from historical training log');
      setTrainingInsights({
        ...log.insights,
        // Clear emergency_type for historical training to prevent emergency notifications
        emergency_type: undefined
      });
      console.log('✅ Loaded insights (historical training - no emergency processing)');
    } else {
      console.log('⚠️ No insights found in log');
      setTrainingInsights({
        persons_described: [],
        summary: "",
        location: [],
        incident: {},
        time_info: {},
        additional_info: [],
        new_information_found: false,
        emergency_type: undefined
      });
    }

    // Load evaluation data if available
    if (log.status === "completed") {
      console.log(`✅ Training completed - Confidence: ${log.confidence_score}%`);
      setTrainingConfidence(log.confidence_score || null);
      setTrainingEvaluation(log.evaluation || null);
    }

    // Clear active session since we're viewing a completed one
    setActiveTrainingSession(null);
    setIsTrainingInProgress(false);
  };

  // Speech recognition functions
  const initializeSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Speech Recognition Not Supported",
        description: "Your browser doesn't support speech recognition",
        variant: "destructive",
      });
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true; // Keep listening continuously
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      console.log('Speech recognition started');
    };

    recognition.onend = () => {
      console.log('🎤 Speech recognition ended');

      // Auto-restart if still in training speech mode and not intentionally stopped
      if (isTrainingSpeechActive && !recognition.stopping) {
        console.log('🔄 Restarting speech recognition...');
        setTimeout(() => {
          try {
            if (isTrainingSpeechActive && recognition) {
              recognition.start();
              setIsListening(true);
            }
          } catch (error) {
            console.error('Error restarting speech recognition:', error);
            setIsTrainingSpeechActive(false);
          }
        }, 500); // Wait 500ms before restarting
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event) => {
      // Ignore aborted errors - these are intentional stops
      if (event.error === 'aborted') {
        return;
      }

      console.error('🚫 Speech recognition error:', event.error);

      if (event.error === 'not-allowed') {
        setIsListening(false);
        setIsTrainingSpeechActive(false);
        toast({
          title: "Microphone Permission Denied",
          description: "Please allow microphone access to use speech recognition",
          variant: "destructive",
        });
      } else if (event.error === 'no-speech') {
      } else if (event.error === 'network') {
        console.log('🌐 Network error, will retry...');
      } else {
        console.error('❌ Speech recognition error:', event.error);
        setIsTrainingSpeechActive(false);
        setIsListening(false);
        toast({
          title: "Speech Recognition Error",
          description: `Error: ${event.error}. Please try again.`,
          variant: "destructive",
        });
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      console.log('🗣️ Speech recognition result:', transcript);

      if (transcript && activeNavItem === "training" && activeTrainingSession) {
        // Send the transcribed text as training message
        handleTrainingMessage(transcript);

        // Show feedback to user
        toast({
          title: "Message Sent",
          description: `"${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}"`,
        });
      }
    };

    return recognition;
  }, [activeNavItem, activeTrainingSession, isTrainingSpeechActive]);

  const startSpeechRecognition = useCallback(async () => {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const recognition = initializeSpeechRecognition();
      if (!recognition) return;

      setSpeechRecognition(recognition);
      setIsTrainingSpeechActive(true);
      recognition.start();

      toast({
        title: "Speech Recognition Active",
        description: "Microphone is now listening. Speak anytime to respond.",
      });

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Microphone Access Denied",
        description: "Please allow microphone access to use speech recognition",
        variant: "destructive",
      });
    }
  }, [initializeSpeechRecognition]);

  const stopSpeechRecognition = useCallback(() => {
    setIsTrainingSpeechActive(false); // Set this first to prevent restart
    setIsListening(false);

    if (speechRecognition) {
      try {
        speechRecognition.stopping = true; // Mark as intentional stop
        speechRecognition.stop(); // Use stop for clean shutdown
      } catch (error) {
        // Silently handle - recognition may already be stopped
      }
      setSpeechRecognition(null);
    }
  }, [speechRecognition]);

  // Handle microphone toggle
  const toggleMicrophone = useCallback(async () => {
    if (activeNavItem === 'training') {
      if (isMicActive) {
        stopSpeechRecognition();
        setIsMicActive(false);
      } else {
        await startSpeechRecognition();
        setIsMicActive(true);
      }
      return;
    }

    if (!isMicActive) {
      try {
        if (!audioServiceRef.current) {
          audioServiceRef.current = new AudioService();
        }

        // Request both microphone and speaker permissions
        await audioServiceRef.current.initPlayback();

        await audioServiceRef.current.startRecording(async (audioData) => {
          // Simple gain boost - browser's built-in noise suppression handles noise
          const boostedAudio = new Float32Array(audioData.length);
          const GAIN = 3.5; // 3.5x boost for phone audio

          // Apply gain boost only
          for (let i = 0; i < audioData.length; i++) {
            boostedAudio[i] = Math.max(-1, Math.min(1, audioData[i] * GAIN));
          }

          // Convert audio data to base64
          const pcm16 = audioServiceRef.current!.floatTo16BitPCM(boostedAudio);
          const base64Audio = audioServiceRef.current!.arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

          // Send audio to server via HTTP POST (for transcription and phone)
          if (selectedCallerNumber) {
            try {
              await apiService.streamAudio(base64Audio, selectedCallerNumber);
              // Log every 50 packets to avoid spam
              if (Math.random() < 0.02) {
                console.log('📤 Sending audio to server:', base64Audio.length, 'bytes');
              }
            } catch (error) {
              console.error('❌ Failed to stream audio:', error);
            }
          } else {
            // Only warn if we are NOT in training mode (already handled above)
            if (activeNavItem !== 'training') {
              console.warn('⚠️ No caller number selected, audio not sent');
            }
          }

          // Calculate audio level for visualization
          const sum = audioData.reduce((acc, val) => acc + Math.abs(val), 0);
          const avg = sum / audioData.length;
          setAudioLevel(Math.min(100, avg * 500));
        });

        setIsMicActive(true);
        toast({
          title: "Microphone Active",
          description: "You can now speak to the caller",
        });
      } catch (error) {
        console.error('Failed to start microphone:', error);
        toast({
          title: "Microphone Error",
          description: "Failed to access microphone",
          variant: "destructive",
        });
      }
    } else {
      audioServiceRef.current?.stopRecording();
      setIsMicActive(false);
      setAudioLevel(0);
    }
  }, [isMicActive, selectedCallerNumber, toast, activeNavItem, startSpeechRecognition, stopSpeechRecognition]);

  // Simulate audio level for visualization
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevel(Math.random() * 100);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut for message field (Ctrl+Shift)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.repeat) {
        e.preventDefault();
        setIsMessageFieldVisible(prev => !prev);
        setTimeout(() => messageInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && isMessageFieldVisible) {
        setIsMessageFieldVisible(false);
      }
      if (e.key === 'Enter' && isMessageFieldVisible && messageText.trim()) {
        handleSendMessage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMessageFieldVisible, messageText]);

  const handleMouseMoveLeft = useCallback((e: MouseEvent) => {
    if (!isResizingLeft || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    // Minimum 280px (matches default) - can only expand, not reduce
    // Maximum 450px to keep reasonable space for center panel
    if (newWidth >= 280 && newWidth <= 450) {
      setLeftWidth(newWidth);
    }
  }, [isResizingLeft]);

  const handleMouseMoveRight = useCallback((e: MouseEvent) => {
    if (!isResizingRight || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    // Minimum 376px to prevent horizontal scrolling in insights panel (matches default)
    // Maximum 1200px to allow significant extension
    if (newWidth >= 376 && newWidth <= 1200) {
      setRightWidth(newWidth);
    }
  }, [isResizingRight]);

  const handleMouseMoveTabs = useCallback((e: MouseEvent) => {
    if (!isResizingTabs) return;
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) return;
    const panelRect = rightPanel.getBoundingClientRect();
    const locationSection = document.getElementById('location-section');
    if (!locationSection) return;
    const locationRect = locationSection.getBoundingClientRect();

    // Calculate new height for tabs section
    const newHeight = e.clientY - locationRect.bottom;

    // Minimum 200px, maximum 800px
    if (newHeight >= 200 && newHeight <= 800) {
      setTabsHeight(newHeight);
    }
  }, [isResizingTabs]);

  const handleMouseMoveSplit = useCallback((e: MouseEvent) => {
    if (!isResizingSplit) return;
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) return;
    const panelRect = rightPanel.getBoundingClientRect();
    const newHeight = ((e.clientY - panelRect.top) / panelRect.height) * 100;
    // Keep between 20% and 80%
    if (newHeight >= 20 && newHeight <= 80) {
      setSplitHeight(newHeight);
    }
  }, [isResizingSplit]);

  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
    setIsResizingSplit(false);
    setIsResizingTabs(false);
  }, []);

  useEffect(() => {
    if (isResizingLeft) {
      document.addEventListener('mousemove', handleMouseMoveLeft);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveLeft);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingLeft, handleMouseMoveLeft, handleMouseUp]);

  useEffect(() => {
    if (isResizingRight) {
      document.addEventListener('mousemove', handleMouseMoveRight);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveRight);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingRight, handleMouseMoveRight, handleMouseUp]);

  useEffect(() => {
    if (isResizingTabs) {
      document.addEventListener('mousemove', handleMouseMoveTabs);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveTabs);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingTabs, handleMouseMoveTabs, handleMouseUp]);

  useEffect(() => {
    if (isResizingSplit) {
      document.addEventListener('mousemove', handleMouseMoveSplit);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveSplit);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingSplit, handleMouseMoveSplit, handleMouseUp]);

  const swapPanels = () => {
    const temp = topPanelTab;
    setTopPanelTab(bottomPanelTab);
    setBottomPanelTab(temp);
  };

  const renderProtocolContent = () => {
    const completion = protocolManagerRef.current && selectedCallerNumber
      ? protocolManagerRef.current.getCompletionPercentage(selectedCallerNumber)
      : 0;

    return (
      <div className="bg-[#1e1e1e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-400">
            Protocol questions tracking conversation:
          </p>
          <span className="text-xs text-gray-500">
            {completion}% Complete
          </span>
        </div>

        {protocolQuestions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Initializing protocol questions...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {protocolQuestions.map((question) => (
              <div key={question.id} className="flex items-start gap-3 py-3 px-4">
                {question.isAsked ? (
                  <CheckCircle className="w-5 h-5 text-[#4caf50] flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-[#f44336] flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="text-base text-white block">
                    {question.question}
                  </span>
                  {!question.isPredefined && (
                    <span className="text-xs text-purple-400 mt-1 block">
                      AI-generated question
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderInsightsContent = () => (
    <>
      {/* Streaming Status Indicator */}
      {isLiveCall && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isStreamingInsights
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
          }`}>
          <div className={`w-2 h-2 rounded-full ${isStreamingInsights ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
          <span className="font-medium">
            {isStreamingInsights ? 'Live Insights Streaming' : 'Connecting to insights...'}
          </span>
        </div>
      )}

      {/* Summary Section */}
      {insights.summary && (
        <div className="bg-[#262626] rounded-lg p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#3b82f6] flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-[#b5b5b5]">Summary</p>
                <h4 className="font-semibold text-sm">Incident Description</h4>
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(insights.summary || '');
                toast({ title: "Copied!", description: "Summary copied to clipboard" });
              }}
              className="p-1.5 rounded-lg hover:bg-[#2a2a2a] hover-orange"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-white leading-relaxed" style={{ lineHeight: '1.6' }}>
            {insights.summary}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!insights.summary && (
        <div className="bg-[#262626] rounded-lg p-6 text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-[#b5b5b5]" />
          <p className="text-sm text-[#b5b5b5] italic">
            {isStreamingInsights
              ? 'Processing caller information. Insights will appear as data is extracted.'
              : 'Awaiting call connection to begin analysis.'}
          </p>
        </div>
      )}

      {/* Persons Described */}
      {insights.persons_described && insights.persons_described.length > 0 && (
        <div className="bg-[#262626] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-[#fb923c]" />
            Persons Described
          </h4>
          <ul className="text-sm text-white space-y-1">
            {insights.persons_described.map((person: any, idx: number) => {
              const displayText = typeof person === 'string'
                ? person
                : person.name
                  ? `${person.name}${person.role ? ` - ${person.role}` : ''}`
                  : JSON.stringify(person);

              return (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#fb923c] mt-1">•</span>
                  <span>{displayText}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Location */}
      {insights.location && insights.location.length > 0 && (
        <div className="bg-[#262626] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#fb923c]" />
            Location
          </h4>
          <div className="space-y-3">
            {insights.location.map((loc: any, idx: number) => {
              const displayText = typeof loc === 'string' ? loc : JSON.stringify(loc);
              return (
                <div key={idx} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#fb923c] mt-2 flex-shrink-0"></div>
                    <span className="text-sm text-white flex-1">{displayText}</span>
                  </div>


                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incident Details */}
      {insights.incident && Object.keys(insights.incident).length > 0 && (
        <div className="bg-[#262626] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#fb923c]" />
            Incident Details
          </h4>
          <div className="space-y-2">
            {Object.entries(insights.incident).map(([key, value]: [string, any]) => (
              value && (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs text-[#b5b5b5] capitalize min-w-[80px]">
                    {key.replace(/_/g, ' ')}:
                  </span>
                  <span className="text-sm text-white flex-1">{String(value)}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Time Information */}
      {insights.time_info && Object.keys(insights.time_info).length > 0 && (
        <div className="bg-[#262626] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#fb923c]" />
            Time Information
          </h4>
          <div className="space-y-2">
            {Object.entries(insights.time_info).map(([key, value]: [string, any]) => (
              value && (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs text-[#b5b5b5] capitalize min-w-[80px]">
                    {key.replace(/_/g, ' ')}:
                  </span>
                  <span className="text-sm text-white flex-1">{String(value)}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Additional Information */}
      {insights.additional_info && insights.additional_info.length > 0 && (
        <div className="bg-[#262626] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#fb923c]" />
            Additional Information
          </h4>
          <ul className="text-sm text-white space-y-1">
            {insights.additional_info.map((info: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#fb923c] mt-1">•</span>
                <span>{info}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );



  const handleIncidentClick = async (idx: number) => {
    // Toggle: if clicking the same call, deselect it and show map
    if (selectedIncident === idx && activeNavItem === "calls") {
      setSelectedIncident(0);
      setSelectedCallSid(null);
      setSelectedCallerNumber(null);
      setConversation([]);
      setIsLiveCall(false);
      setHasBeenTransferred(false); // Reset transfer flag when deselecting
      console.log('Call deselected, showing map view');
      return;
    }

    setSelectedIncident(idx);
    const call = calls[idx];
    setDetectedLanguage(call.language);
    setIsLiveCall(call.isLive);

    // Reset AI state for new calls
    if (call.isLive) {
      setIsAiActive(true); // AI starts active for new live calls
      setHasBeenTransferred(false); // Reset transfer flag for new calls
    }

    if (call.call_sid) {
      setSelectedCallSid(call.call_sid);

      // Only set selected caller number for live calls (for WebSocket)
      if (call.isLive) {
        setSelectedCallerNumber(call.phone);
      } else {
        setSelectedCallerNumber(null);
      }

      console.log('Selected call:', call.phone, 'SID:', call.call_sid);


      // Load historical data if call is not live
      if (!call.isLive) {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

        try {
          // Clear previous data first (but keep location data for other calls)
          setConversation([]);
          setProtocolQuestions([]); // Clear protocol questions
          setInsights({
            summary: "",
            location: [],
            persons_described: [],
            additional_info: [],
            incident: {},
            time_info: {},
            new_information_found: false,
            emergency_type: undefined
          });

          // Load transcripts
          const transcriptsRes = await fetch(`${API_BASE_URL}/api/calls/${call.call_sid}/transcripts`);
          const transcriptsData = await transcriptsRes.json();

          if (transcriptsData.status === 'success' && transcriptsData.transcripts) {
            const loadedConversation = transcriptsData.transcripts.map((t: any) => ({
              sender: t.speaker,
              time: t.time,
              message: t.message,
            }));
            setConversation(loadedConversation);
            console.log(`📜 Loaded ${loadedConversation.length} transcripts`);
          }

          // Load insights (for historical calls - do NOT trigger geocoding or emergency services)
          const insightsRes = await fetch(`${API_BASE_URL}/api/calls/${call.call_sid}/insights`);
          const insightsData = await insightsRes.json();

          if (insightsData.status === 'success' && insightsData.insights) {
            // Load insights but mark as historical to prevent auto-dispatch
            setInsights({
              ...insightsData.insights,
              // Clear emergency type for historical calls to prevent auto-processing
              emergency_type: undefined
            });
            if (insightsData.insights.protocol_questions) {
              setProtocolQuestions(insightsData.insights.protocol_questions);
            }
            console.log('💡 Loaded insights (historical call - no emergency processing)');
          }

          // Load location (display only - no emergency service search)
          const locationRes = await fetch(`${API_BASE_URL}/api/calls/${call.call_sid}/location`);
          const locationData = await locationRes.json();

          if (locationData.status === 'success' && locationData.location) {
            setLocationData(prev => ({
              ...prev,
              [call.call_sid]: {
                latitude: locationData.location.latitude,
                longitude: locationData.location.longitude,
                address: locationData.location.address,
                timestamp: locationData.location.timestamp
              }
            }));
            console.log('📍 Loaded location for', call.phone, '(historical - no emergency services search)');
          } else {
            console.log('📍 No location data for this call');
          }
        } catch (error) {
          console.error('Error loading call history:', error);
        }
      } else {
        // For live calls, we don't want to clear the conversation if we are just re-selecting the same call
        // But if we are switching to a NEW live call, we should clear it.
        // Since we already checked `selectedIncident === idx` at the top, we know this is a NEW selection (or re-selection after deselect).
        
        // However, if the call was auto-selected, `selectedIncident` might already be set.
        // Let's only clear if the call SID is different from what we have in memory?
        // But `conversation` is local state. If we switch calls, we lose it.
        
        // The issue is that `handleIncidentClick` might be called when the user clicks the call in the list.
        // If the user clicks the call while it's live, we don't want to wipe the chat.
        
        // If we are here, it means we clicked a live call.
        // If `selectedCallSid` was already this call, we shouldn't clear.
        if (selectedCallSid !== call.call_sid) {
             console.log('🔄 Switching to new live call - clearing conversation (keeping location data)');
             setConversation([]);
             // Don't clear location data - it's keyed by call_sid so won't interfere
        } else {
             console.log('🔄 Re-selected current live call - keeping conversation');
        }
      }
    }
  };

  // Reset insights and SMS state when call changes
  useEffect(() => {
    if (selectedCallerNumber && isLiveCall) {
      console.log('🔄 Resetting insights for new call:', selectedCallerNumber);
      setInsights({
        summary: "",
        location: [],
        persons_described: [],
        additional_info: [],
        incident: {},
        time_info: {},
        new_information_found: false,
        emergency_type: undefined
      });
      setIsStreamingInsights(true);

      // Initialize protocol session
      if (protocolManagerRef.current) {
        const protocolState = protocolManagerRef.current.initializeSession(selectedCallerNumber);
        setProtocolQuestions([...protocolState.questions]);
        setHasGeneratedAIQuestions(false);
      }
    } else {
      setIsStreamingInsights(false);
    }
  }, [selectedCallerNumber, isLiveCall]);

  // Message Functions
  const handleSendTrackingLink = async (phoneNumber: string) => {
    // Validate phone number
    if (!phoneNumber || phoneNumber === 'Unknown Caller' || phoneNumber === 'Unknown') {
      toast({
        title: "Invalid Phone Number",
        description: "Cannot send SMS to unknown caller.",
        variant: "destructive",
      });
      return;
    }

    const targetNumber = phoneNumber;

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Send location tracking link to ${targetNumber}?\n\nThis will send an SMS with a link to share their location.`
    );

    if (!confirmed) {
      return;
    }

    // Show loading toast
    toast({
      title: "Sending SMS...",
      description: `Sending tracking link to ${targetNumber}`,
    });

    try {
      console.log(`📤 Initiating tracking link SMS to ${targetNumber}`);

      // Send SMS via Twilio
      const result = await twilioService.sendTrackingLink(targetNumber);

      if (result.success) {
        // Mark as sent
        setLinkSent(prev => ({ ...prev, [phoneNumber]: Date.now() }));

        toast({
          title: "✅ Tracking Link Sent",
          description: `SMS successfully sent to ${targetNumber}. Awaiting location data.`,
        });

        console.log('📱 SMS sent successfully. Message SID:', result.messageSid);
      } else {
        console.error('❌ Failed to send SMS:', result.error);

        toast({
          title: "❌ Failed to Send SMS",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error in handleSendTrackingLink:', error);

      toast({
        title: "Error",
        description: "Failed to send tracking link. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioServiceRef.current?.stopRecording();
      audioServiceRef.current?.stopPlayback();
    };
  }, []);

  // Training evaluation popup component
  const TrainingEvaluationPopup = () => {
    if (!trainingConfidence || !trainingEvaluation) return null;

    // Parse evaluation to extract meaningful points
    const evaluationLines = trainingEvaluation.split('\n').filter(line => line.trim());
    const scoreMatch = evaluationLines.find(line => line.includes('%'));
    const evaluationPoints = evaluationLines.filter(line =>
      !line.includes('%') &&
      !line.toLowerCase().includes('percentage') &&
      !line.toLowerCase().includes('score') &&
      line.length > 10 &&
      (line.includes('.') || line.includes('-') || line.includes('•'))
    );

    const getScoreColor = (score: number) => {
      if (score >= 85) return { color: 'text-emerald-400', border: 'border-emerald-400', bg: 'bg-emerald-500/10' };
      if (score >= 70) return { color: 'text-green-400', border: 'border-green-400', bg: 'bg-green-500/10' };
      if (score >= 60) return { color: 'text-yellow-400', border: 'border-yellow-400', bg: 'bg-yellow-500/10' };
      return { color: 'text-red-400', border: 'border-red-400', bg: 'bg-red-500/10' };
    };

    const getPerformanceLevel = (score: number) => {
      if (score >= 85) return "Excellent";
      if (score >= 70) return "Good";
      if (score >= 60) return "Satisfactory";
      return "Needs Improvement";
    };

    const scoreColors = getScoreColor(trainingConfidence);

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gradient-to-b from-[#1f1f1f] to-[#1a1a1a] border border-[#333333] rounded-2xl p-8 max-w-lg w-full mx-4 relative shadow-2xl">
          {/* Close button */}
          <button
            onClick={() => {
              setTrainingConfidence(null);
              setTrainingEvaluation(null);
            }}
            className="absolute top-4 right-4 text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            ✕
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-[#fb923c] mr-3" />
              <h2 className="text-2xl font-bold text-white">Training Assessment</h2>
            </div>
            <p className="text-gray-400">Emergency Response Simulation</p>
          </div>

          {/* Score display */}
          <div className={`${scoreColors.bg} border ${scoreColors.border} rounded-xl p-6 mb-6`}>
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full border-4 ${scoreColors.border} mb-4 relative`}>
                <span className={`text-3xl font-bold ${scoreColors.color}`}>{trainingConfidence}%</span>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-current animate-spin opacity-20"></div>
              </div>
              <h3 className={`text-xl font-semibold ${scoreColors.color} mb-2`}>
                {getPerformanceLevel(trainingConfidence)}
              </h3>
              <p className="text-gray-300 text-sm">Overall Performance Score</p>
            </div>
          </div>

          {/* Evaluation breakdown */}
          {evaluationPoints.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Sparkles className="w-5 h-5 text-[#fb923c] mr-2" />
                Performance Highlights
              </h4>
              <div className="space-y-3 max-h-32 overflow-y-auto custom-scrollbar">
                {evaluationPoints.slice(0, 5).map((point, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-[#262626] rounded-lg">
                    <div className="w-2 h-2 bg-[#fb923c] rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-300 leading-relaxed">{point.trim().replace(/^[-•]\s*/, '')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setTrainingConfidence(null);
                setTrainingEvaluation(null);
              }}
              variant="outline"
              className="flex-1 bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-white"
            >
              Review Session
            </Button>
            <Button
              onClick={() => {
                setTrainingConfidence(null);
                setTrainingEvaluation(null);
                // Start new training
                handleStartTraining();
              }}
              className="flex-1 bg-[#fb923c] hover:bg-[#ea7b1a] text-white"
            >
              New Training
            </Button>
          </div>
        </div>
      </div>
    );
  };


  const handleTakeover = async () => {
    if (!selectedCallSid) return;

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/api/calls/${selectedCallSid}/takeover`, {
        method: 'POST',
      });

      if (response.ok) {
        setIsAiActive(false);
        setHasBeenTransferred(true); // Mark as transferred - AI cannot be re-enabled
        toast({
          title: "Call Taken Over",
          description: "AI Agent stopped. You can now speak to the caller.",
        });
        // Automatically enable microphone
        if (!isMicActive) {
          toggleMicrophone();
        }
      } else {
        throw new Error('Failed to take over call');
      }
    } catch (error) {
      console.error('Error taking over call:', error);
      toast({
        title: "Error",
        description: "Failed to take over call",
        variant: "destructive",
      });
    }
  };

  // Sync mute state with AudioService
  useEffect(() => {
    if (audioServiceRef.current) {
      audioServiceRef.current.setMute(isCallerMuted);
    }
  }, [isCallerMuted]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <style dangerouslySetInnerHTML={{
        __html: `
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #2a2a2a; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #404040; border-radius: 3px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #505050; }
        `
      }} />

      {/* Top Navigation */}
      <header className="h-14 border-b border-[#2a2a2a] flex items-center justify-between px-4 bg-[#0a0a0a] shrink-0">
        <div className="flex items-center gap-6">
          <div className="h-[50px] w-[50px] flex items-center justify-center">
            <img src="/apple-touch-icon-removebg-preview.png" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div className={`flex items-center gap-2 cursor-pointer h-14 border-b-2 ${activeNavItem === 'dashboard' ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => handleNavClick('dashboard')}>
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </div>
          <div className={`flex items-center gap-2 cursor-pointer h-14 border-b-2 ${activeNavItem === 'dispatch' ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => handleNavClick('dispatch')}>
            <Compass className="w-4 h-4" />
            <span className="text-sm font-medium">Dispatch</span>
          </div>
          <div className={`flex items-center gap-2 cursor-pointer h-14 border-b-2 ${activeNavItem === 'training' ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => handleNavClick('training')}>
            <GraduationCap className="w-4 h-4" />
            <span className="text-sm font-medium">Training</span>
          </div>
          <div className={`flex items-center gap-2 cursor-pointer h-14 border-b-2 ${activeNavItem === 'analytics' ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => handleNavClick('analytics')}>
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm font-medium">Analytics</span>
          </div>
          <div className={`flex items-center gap-2 cursor-pointer h-14 border-b-2 ${activeNavItem === 'settings' ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => handleNavClick('settings')}>
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Settings</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${notificationsConnected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
            <span className={notificationsConnected ? 'text-green-400' : 'text-red-400'}>
              {notificationsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <Button variant="ghost" className="text-sm text-gray-400 font-normal hover:text-white hover:bg-[#1a1a1a]">
            Bangalore 112 Service <ChevronDown className="ml-2 w-4 h-4" />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowNotificationsPanel(v => !v);
                // Mark all as viewed when opening the panel
                if (!showNotificationsPanel) {
                  setNotificationHistory(prev => prev.map(n => ({ ...n, viewed: true })));
                }
              }}
              className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
            >
              <Bell className="w-5 h-5" />
              {notificationHistory.filter(n => !n.viewed).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#5B5FED] text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                  {notificationHistory.filter(n => !n.viewed).length}
                </span>
              )}
            </Button>
            {showNotificationsPanel && (
              <div className="absolute right-0 mt-2 w-80 bg-[#121212] border border-[#2a2a2a] rounded-xl shadow-xl z-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Notifications</span>
                  <button className="text-xs text-gray-400 hover:text-white" onClick={() => setShowNotificationsPanel(false)}>Close</button>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
                  {notificationHistory.length === 0 && (
                    <div className="text-xs text-gray-500">No notifications yet.</div>
                  )}
                  {notificationHistory.slice().reverse().map(n => (
                    <div key={n.id} className="text-xs border border-[#222] rounded-md p-2 bg-[#1a1a1a]">
                      <div className="flex justify-between">
                        <span className="font-semibold">{n.title}</span>
                        <span className={`capitalize ${n.status === 'approved' ? 'text-green-400' : n.status === 'denied' ? 'text-red-400' : n.status === 'sent' ? 'text-green-500' : 'text-yellow-400'}`}>{n.status}</span>
                      </div>
                      <div className="mt-1 text-gray-400">{n.emergencyType} • {n.location}</div>
                      <div className="mt-1 space-y-0.5">
                        {n.stations.slice(0, 3).map(s => (
                          <div key={s.id} className="flex justify-between text-gray-300">
                            <span className="truncate max-w-[140px]" title={s.name}>{s.name}</span>
                            <span className="text-gray-500">{s.distance.toFixed(2)} mi</span>
                          </div>
                        ))}
                      </div>

                      {/* Show emergency contact number */}
                      {emergencyContacts[n.emergencyType] && (
                        <div className="mt-2 p-2 bg-[#0a0a0a] rounded border border-[#333]">
                          <div className="text-[10px] text-gray-500">Emergency Contact:</div>
                          <div className="text-xs text-white font-mono">{emergencyContacts[n.emergencyType]}</div>
                        </div>
                      )}

                      {n.status === 'pending' && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => {
                              setDispatchEmergencyType(n.emergencyType as any);
                              setDispatchStations(n.stations);
                              setNotificationHistory(prev => prev.map(x => x.id === n.id ? { ...x, status: 'approved' } : x));
                            }}
                            className="px-2 py-1 rounded-md bg-[#1f1f1f] border border-[#333] hover:bg-[#2a2a2a] text-[10px]">Approve</button>
                          <button
                            onClick={() => {
                              if (n.stations[0]) {
                                setDispatchEmergencyType(n.emergencyType as any);
                                setDispatchStations(n.stations);
                                setMapLocation(prev => ({ ...prev, latitude: n.stations[0].latitude, longitude: n.stations[0].longitude, address: n.location || '', district: prev.district }));
                                handleEmergencySMSAndCall(n.stations[0]).then(() => {
                                  setNotificationHistory(prev => prev.map(x => x.id === n.id ? { ...x, status: 'sent' } : x));
                                });
                              }
                            }}
                            className="px-2 py-1 rounded-md bg-[#1f1f1f] border border-[#333] hover:bg-[#2a2a2a] text-white text-[10px]">SMS + Call</button>
                          <button
                            onClick={() => {
                              setNotificationHistory(prev => prev.map(x => x.id === n.id ? { ...x, status: 'denied' } : x));
                            }}
                            className="px-2 py-1 rounded-md bg-[#1f1f1f] border border-[#333] hover:bg-[#2a2a2a] text-white text-[10px]">Deny</button>
                        </div>
                      )}
                      {n.status === 'approved' && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => {
                              if (n.stations[0]) {
                                handleEmergencySMSAndCall(n.stations[0]).then(() => {
                                  setNotificationHistory(prev => prev.map(x => x.id === n.id ? { ...x, status: 'sent' } : x));
                                });
                              }
                            }}
                            className="px-2 py-1 rounded-md bg-[#1f1f1f] border border-[#333] hover:bg-[#2a2a2a] text-white text-[10px]">SMS + Call</button>
                        </div>
                      )}
                      {n.status === 'sent' && (
                        <div className="mt-2 text-[10px] font-medium text-green-400 transition-colors duration-500">
                          ✅ Successfully sent
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-gray-600">{new Date(n.timestamp).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center cursor-pointer">
            <User className="w-4 h-4" />
          </div>
        </div>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* View: Calls / Dashboard (The 3-column layout) */}
        {(activeNavItem === 'calls' || activeNavItem === 'dashboard') && (
          <>
            {/* Left Sidebar */}
            <aside className="w-80 border-r border-[#2a2a2a] flex flex-col bg-[#0a0a0a]">
              <div className="p-4 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-400 flex items-center gap-1">Incidents</div>
                  <Button size="icon" className="h-8 w-8 bg-[#5B5FED] hover:bg-[#4a4ec0] rounded-md">
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input placeholder="Search Incidents" className="pl-9 bg-[#1a1a1a] border-[#333] text-sm h-9 text-white placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-[#5B5FED]" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                    All Calls <ChevronDown className="w-3 h-3" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-white">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {calls.map((call, idx) => (
                  <div key={idx}
                    className={`p-3 border-b border-[#1a1a2a] cursor-pointer hover:bg-[#1a1a1a] transition-colors relative ${idx === selectedIncident ? 'bg-gradient-to-r from-[#1a1a1a] to-[#1e1e2e]' : ''}`}
                    onClick={() => handleIncidentClick(idx)}>
                    {idx === selectedIncident && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5B5FED]"></div>}
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${call.isLive ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                        <Phone className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-medium ${idx === selectedIncident ? 'text-white' : 'text-gray-300'}`}>{call.phone}</span>
                          <div className="text-xs text-gray-500 flex flex-col items-end">
                            <span>{call.date}</span>
                            <span className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-[10px] mt-1 border border-[#333]">{call.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-[#2a2a2a]">
                {/* Button removed as requested */}
              </div>
            </aside>

            {/* Center Panel */}
            <main className="flex-1 flex flex-col bg-[#0a0a0a] relative min-w-0">
              <div className="h-14 border-b border-[#2a2a2a] flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">{calls[selectedIncident]?.phone || "Select a Call"}</h2>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span>{isLiveCall ? "Incoming Call" : "Past Call"}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                      <div className="flex items-center gap-1 text-gray-400 bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#333]">
                        Uncategorized <ChevronDown className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="bg-[#1a1a1a] border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white h-8 text-xs px-3">
                    <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
                  </Button>
                  <Button variant="outline" size="sm" className="bg-[#1a1a1a] border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white h-8 text-xs px-3">
                    Manage <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>

              <div className="px-6 py-2.5 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-[#333]">
                      <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-gray-500 tracking-wider">DEVICE INFO</div>
                      <div className="text-[11px] text-gray-400">iOS 16.1.1 (iPhone)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select value={detectedLanguage.toLowerCase()} onValueChange={(value) => {
                      const langMap: Record<string, string> = {
                        // Major world languages
                        'english': 'English',
                        'spanish': 'Spanish',
                        'french': 'French',
                        'german': 'German',
                        'italian': 'Italian',
                        'portuguese': 'Portuguese',
                        'russian': 'Russian',
                        'japanese': 'Japanese',
                        'korean': 'Korean',
                        'chinese': 'Chinese',
                        'arabic': 'Arabic',

                        // 11 Major Indian Languages
                        'hindi': 'Hindi',
                        'bengali': 'Bengali',
                        'telugu': 'Telugu',
                        'marathi': 'Marathi',
                        'tamil': 'Tamil',
                        'urdu': 'Urdu',
                        'gujarati': 'Gujarati',
                        'kannada': 'Kannada',
                        'odia': 'Odia',
                        'malayalam': 'Malayalam',
                        'punjabi': 'Punjabi'
                      };
                      setDetectedLanguage(langMap[value] || 'English');
                      console.log('🌐 Dispatcher language changed to:', langMap[value]);
                    }}>
                      <SelectTrigger className="w-[140px] h-8 bg-[#1a1a1a] border-[#333] text-xs text-gray-300">
                        <SelectValue placeholder="Set Language" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-[#333] text-gray-300 max-h-[400px] overflow-y-auto">
                        {/* Common Languages */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Common</div>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="french">French</SelectItem>
                        <SelectItem value="chinese">Chinese</SelectItem>
                        <SelectItem value="arabic">Arabic</SelectItem>

                        {/* Indian Languages - 11 Major */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-[#fb923c] uppercase tracking-wider mt-2">🇮🇳 Indian Languages</div>
                        <SelectItem value="hindi">Hindi (हिन्दी)</SelectItem>
                        <SelectItem value="bengali">Bengali (বাংলা)</SelectItem>
                        <SelectItem value="telugu">Telugu (తెలుగు)</SelectItem>
                        <SelectItem value="marathi">Marathi (मराठी)</SelectItem>
                        <SelectItem value="tamil">Tamil (தமிழ்)</SelectItem>
                        <SelectItem value="urdu">Urdu (اردو)</SelectItem>
                        <SelectItem value="gujarati">Gujarati (ગુજરાતી)</SelectItem>
                        <SelectItem value="kannada">Kannada (ಕನ್ನಡ)</SelectItem>
                        <SelectItem value="odia">Odia (ଓଡ଼ିଆ)</SelectItem>
                        <SelectItem value="malayalam">Malayalam (മലയാളം)</SelectItem>
                        <SelectItem value="punjabi">Punjabi (ਪੰਜਾਬੀ)</SelectItem>

                        {/* Other Languages */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2">Other</div>
                        <SelectItem value="german">German</SelectItem>
                        <SelectItem value="italian">Italian</SelectItem>
                        <SelectItem value="portuguese">Portuguese</SelectItem>
                        <SelectItem value="russian">Russian</SelectItem>
                        <SelectItem value="japanese">Japanese</SelectItem>
                        <SelectItem value="korean">Korean</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 bg-[#5B5FED] hover:bg-[#4a4ec0] text-white">Media <ChevronDown className="w-3 h-3 ml-1" /></Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-8 w-8 p-0 ${isAiAudioEnabled ? 'text-[#5B5FED]' : 'text-gray-400'}`}
                      onClick={() => setIsAiAudioEnabled(!isAiAudioEnabled)}
                      title={isAiAudioEnabled ? "Mute AI Audio" : "Unmute AI Audio"}
                    >
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isLiveCall ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
                    <span className="text-xs font-bold text-white">{isLiveCall ? 'LIVE' : 'RECORDED'}</span>
                  </div>
                  <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className={`h-full bg-[#5B5FED] transition-all duration-300 ${isLiveCall ? 'w-full' : 'w-1/3'
                      }`}></div>
                  </div>
                  <Volume2 className="w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar min-h-0">
                <div className="text-center text-xs text-gray-500 mb-8">
                  {calls[selectedIncident]?.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} | {calls[selectedIncident]?.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
                <div className="flex justify-center mb-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone className="w-3 h-3" /> Call started
                  </div>
                </div>

                {conversation && conversation.length > 0 ? (
                  conversation.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === 'Dispatch' || msg.sender === 'AI Agent' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%]">
                      <div className={`text-[10px] text-gray-500 mb-1 flex items-center gap-2 ${msg.sender === 'Dispatch' || msg.sender === 'AI Agent' ? 'justify-end' : 'justify-start'
                        }`}>
                        <span>{msg.sender} | {msg.time}</span>
                        {msg.isTranslated && (
                          <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-medium">
                            <span>🌐</span> Translated
                          </span>
                        )}
                      </div>
                      <div className={`rounded-2xl text-sm ${msg.sender === 'Dispatch' || msg.sender === 'AI Agent'
                        ? 'bg-[#1a1a1a] border border-[#333] rounded-tr-sm'
                        : 'bg-[#1a1a1a] border border-[#333] rounded-tl-sm'
                        }`}>
                        {msg.isTranslated && msg.originalMessage ? (
                          <>
                            {/* Original message */}
                            <div className="p-3 border-b border-[#333]/50">
                              <div className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">Original</div>
                              <div className="text-gray-400 italic">{msg.originalMessage}</div>
                            </div>
                            {/* Translated message */}
                            <div className="p-3">
                              <div className="text-[9px] text-blue-400 mb-1 uppercase tracking-wide">Translated</div>
                              <div className="text-white font-medium">{msg.message}</div>
                            </div>
                          </>
                        ) : (
                          <div className={`p-3 ${msg.sender === 'Dispatch' ? 'text-gray-300' :
                            msg.sender === 'AI Agent' ? 'text-gray-400 italic' : 'text-white'
                            }`}>
                            {msg.message}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 space-y-2">
                    <MessageSquare className="w-8 h-8 opacity-20" />
                    <p className="text-xs">No transcription yet...</p>
                    <p className="text-[10px] opacity-50">Waiting for speech</p>
                  </div>
                )}

                <div ref={conversationEndRef} />
              </div>

              {/* Suggested Question - Shows one at a time above Talk button */}
              {isLiveCall && protocolQuestions.filter(q => !q.isAsked).length > 0 && (
                <div className="px-6 py-3 border-t border-[#2a2a2a]/50 bg-[#0a0a0a]">
                  <div className="bg-gradient-to-r from-[#5B5FED]/10 to-[#5B5FED]/5 border border-[#5B5FED]/30 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      {/* Animated Loader */}
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <div className="relative w-5 h-5">
                          <div className="absolute inset-0 border-2 border-[#5B5FED]/20 rounded-full"></div>
                          <div className="absolute inset-0 border-2 border-[#5B5FED] rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <span className="text-[8px] text-[#5B5FED] font-medium uppercase tracking-wide">Waiting</span>
                      </div>

                      {/* Question Content */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-gray-400 uppercase tracking-wide">Suggested Question</span>
                          {protocolQuestions.filter(q => !q.isAsked)[0]?.isPredefined ? (
                            <span className="text-[8px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded uppercase font-medium">Essential</span>
                          ) : (
                            <span className="text-[8px] bg-[#5B5FED]/20 text-[#5B5FED] px-1.5 py-0.5 rounded uppercase font-medium">AI</span>
                          )}
                        </div>
                        <p className="text-sm text-white font-medium leading-relaxed">
                          {protocolQuestions.filter(q => !q.isAsked)[0]?.question}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-gray-500 capitalize">
                            {protocolQuestions.filter(q => !q.isAsked)[0]?.category}
                          </span>
                          <span className="text-[10px] text-gray-600">•</span>
                          <button
                            onClick={() => setActiveTab('guidance')}
                            className="text-[10px] text-[#5B5FED] hover:text-[#7b7ff0] transition-colors"
                          >
                            {protocolQuestions.filter(q => !q.isAsked).length - 1} more questions →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Controls for Live Calls */}
              {isLiveCall && (
                <div className="px-6 py-2.5 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
                  <div className="mt-3 flex items-center gap-2">
                    {/* Mute/Unmute Caller Button */}
                    <button
                      onClick={() => setIsCallerMuted(!isCallerMuted)}
                      className="p-2 rounded-lg transition-all border border-[#333] hover:bg-[#252525]"
                      title={isCallerMuted ? "Unmute Caller" : "Mute Caller"}
                    >
                      {isCallerMuted ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-gray-300" />
                      )}
                    </button>

                    {/* Take Over Call Button (when AI is active) */}
                    {isAiActive ? (
                      <Button
                        onClick={handleTakeover}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium transition-all bg-orange-500/10 border-orange-500 text-orange-400 hover:bg-orange-500/20 flex-1"
                      >
                        Take Over Call
                        <ArrowRight className="w-4 h-4 ml-1.5" style={{ transform: 'rotate(15deg)' }} />
                      </Button>
                    ) : (
                      /* Talk Button (when human has control) */
                      <Button
                        onClick={toggleMicrophone}
                        disabled={!isLiveCall}
                        variant="outline"
                        size="sm"
                        className={`h-8 text-xs font-medium transition-all px-3 ${isMicActive
                          ? 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20'
                          : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white'
                          }`}
                      >
                        {isMicActive ? (
                          <>
                            <MicOff className="w-4 h-4 mr-1.5" />
                            Mute
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 mr-1.5" />
                            Talk
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </main>

            {/* Right Panel */}
            <aside
              id="right-panel"
              style={{ width: rightWidth }}
              className="border-l border-[#2a2a2a] flex flex-col bg-[#0a0a0a] relative"
            >
              {/* Resize Handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#5B5FED]/50 z-50 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingRight(true);
                }}
              />
              <div
                id="location-section"
                key={`location-${calls[selectedIncident]?.call_sid}-${locationData[calls[selectedIncident]?.call_sid || '']?.timestamp || 'none'}`}
                className={`border-b border-[#2a2a2a] flex flex-col flex-1 min-h-[300px] ${calls[selectedIncident]?.call_sid && locationData[calls[selectedIncident].call_sid]
                  ? 'p-0'
                  : 'p-6 items-center justify-center text-center'
                  }`}
              >
                {(() => {
                  const currentCall = calls[selectedIncident];
                  
                  // Try to find location data in multiple ways:
                  // 1. Exact match by current call's call_sid
                  // 2. Match by selectedCallSid (which tracks the currently active call)
                  // 3. Match by any call with the same phone number
                  let locationForCall = currentCall?.call_sid ? locationData[currentCall.call_sid] : null;
                  let matchedCallSid = currentCall?.call_sid;
                  
                  // Fallback 1: Check selectedCallSid
                  if (!locationForCall && selectedCallSid && locationData[selectedCallSid]) {
                    locationForCall = locationData[selectedCallSid];
                    matchedCallSid = selectedCallSid;
                    console.log('📍 Using location from selectedCallSid:', selectedCallSid);
                  }
                  
                  // Fallback 2: Find any call with the same phone number that has location data
                  if (!locationForCall && currentCall?.phone) {
                    const normalizedCurrentPhone = currentCall.phone.replace(/\D/g, '');
                    
                    for (const callSid of Object.keys(locationData)) {
                      const matchingCall = calls.find(c => c.call_sid === callSid);
                      if (matchingCall) {
                        const normalizedMatchPhone = matchingCall.phone.replace(/\D/g, '');
                        if (normalizedCurrentPhone === normalizedMatchPhone ||
                            normalizedCurrentPhone.endsWith(normalizedMatchPhone.slice(-10)) ||
                            normalizedMatchPhone.endsWith(normalizedCurrentPhone.slice(-10))) {
                          locationForCall = locationData[callSid];
                          matchedCallSid = callSid;
                          console.log('📍 Using location from matching phone:', matchingCall.phone, 'call_sid:', callSid);
                          break;
                        }
                      }
                    }
                  }
                  
                  // Fallback 3: If there's only one location entry and one call, use it
                  if (!locationForCall && Object.keys(locationData).length === 1 && calls.length <= 2) {
                    const [onlyCallSid] = Object.keys(locationData);
                    locationForCall = locationData[onlyCallSid];
                    matchedCallSid = onlyCallSid;
                    console.log('📍 Using only available location data:', onlyCallSid);
                  }
                  
                  const hasLocation = !!locationForCall;
                  
                  // Debug logging
                  console.log('🗺️ Map Section Debug:', {
                    selectedIncident,
                    currentCallSid: currentCall?.call_sid,
                    selectedCallSid,
                    currentCallPhone: currentCall?.phone,
                    hasLocation,
                    matchedCallSid,
                    locationDataKeys: Object.keys(locationData),
                    locationForCall
                  });

                  return hasLocation && locationForCall ? (
                    // Show map when location data is available
                    <div className="h-full w-full bg-[#1a1a1a] overflow-hidden relative flex-1 flex flex-col">
                      <div className="flex-1 relative min-h-0">
                        <MapView
                          latitude={locationForCall.latitude}
                          longitude={locationForCall.longitude}
                          address={locationForCall.address}
                        />
                      </div>
                    </div>
                  ) : (
                    // Show request button when no location data
                    <>
                      <div className="text-sm text-gray-400 mb-4">Send a link via SMS to receive live GPS location</div>
                      {currentCall?.phone && linkSent[currentCall.phone] ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-[#5B5FED] font-medium flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            Link Sent
                          </div>
                          <div className="text-xs text-gray-500">Waiting for location data...</div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => {
                            if (currentCall?.phone) {
                              handleSendTrackingLink(currentCall.phone);
                            } else {
                              toast({
                                title: "Error",
                                description: "No phone number available for this call",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="bg-[#5B5FED] hover:bg-[#4a4ec0] text-white px-6 h-10 rounded-md font-medium"
                        >
                          Request Live Location
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Tabs Section with Resize Handle */}
              <div
                style={{ height: `${tabsHeight}px` }}
                className="flex flex-col min-h-0 overflow-hidden relative border-t-2 border-[#2a2a2a]"
              >
                {/* Vertical Resize Handle */}
                <div
                  className="absolute left-0 right-0 top-0 h-1 cursor-row-resize hover:bg-[#5B5FED]/50 z-50 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizingTabs(true);
                  }}
                />
                <div className="flex border-b border-[#2a2a2a]">
                  {['Overview', 'Media', 'Guidance'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab.toLowerCase())}
                      className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.toLowerCase() ? 'border-[#5B5FED] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar min-h-0">
                  {/* Tab Content */}
                  {activeTab === 'media' && (
                    <div className="text-center text-gray-500 text-sm mt-10">
                      Media content will appear here
                    </div>
                  )}
                  {activeTab === 'guidance' && (
                    isAiActive ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-6">
                        <div className="w-12 h-12 rounded-full bg-[#5B5FED]/10 flex items-center justify-center mb-4">
                          <Sparkles className="w-6 h-6 text-[#5B5FED]" />
                        </div>
                        <h3 className="text-sm font-medium text-white mb-2">AI Agent Active</h3>
                        <p className="text-xs text-gray-500 max-w-[200px]">
                          Protocol suggestions are hidden while the AI agent is handling the call. Take over to view guidance.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Protocol Questions</h3>
                            {isGeneratingQuestions && (
                              <span className="text-xs text-[#5B5FED] flex items-center gap-1">
                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating AI questions...
                              </span>
                            )}
                          </div>
                          {protocolQuestions.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">
                              {isGeneratingQuestions
                                ? "AI is analyzing the conversation to generate relevant questions..."
                                : "Questions will appear as the conversation progresses."}
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {protocolQuestions.map((question, idx) => (
                                <div
                                  key={question.id}
                                  className={`bg-[#0a0a0a] p-3 rounded-lg border transition-colors ${question.isAsked
                                    ? 'border-green-500/30 bg-green-500/5'
                                    : 'border-[#2a2a2a] hover:border-[#5B5FED]/30'
                                    }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#5B5FED] font-bold text-sm mt-0.5">{idx + 1}.</span>
                                    <div className="flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm text-white leading-relaxed flex-1">{question.question}</p>
                                        {question.isAsked && (
                                          <span className="text-xs text-green-400 font-medium">✓ Asked</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-gray-500 capitalize">{question.category}</span>
                                        {question.isPredefined ? (
                                          <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Essential</span>
                                        ) : (
                                          <span className="text-xs bg-[#5B5FED]/20 text-[#5B5FED] px-1.5 py-0.5 rounded">AI Generated</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      {/* Summary Section */}
                      <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                        <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Summary</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {insights.summary || "No summary available yet. Information will appear as the conversation progresses."}
                        </p>
                      </div>

                      {/* Incident Information */}
                      {insights.incident && Object.keys(insights.incident).length > 0 && (
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">Incident Details</h3>
                          <div className="space-y-2">
                            {insights.incident.incident_type && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Type:</span>
                                <span className="text-sm text-white font-medium capitalize">{insights.incident.incident_type}</span>
                              </div>
                            )}
                            {insights.incident.severity && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Severity:</span>
                                <span className={`text-sm font-medium capitalize ${insights.incident.severity === 'critical' ? 'text-red-400' :
                                  insights.incident.severity === 'high' ? 'text-orange-400' :
                                    insights.incident.severity === 'medium' ? 'text-yellow-400' :
                                      'text-green-400'
                                  }`}>{insights.incident.severity}</span>
                              </div>
                            )}
                            {insights.incident.description && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Description:</span>
                                <span className="text-sm text-gray-300">{insights.incident.description}</span>
                              </div>
                            )}
                            {insights.incident.current_state && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Status:</span>
                                <span className="text-sm text-gray-300 capitalize">{insights.incident.current_state}</span>
                              </div>
                            )}
                            {insights.incident.source && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Source:</span>
                                <span className="text-sm text-gray-300">{insights.incident.source}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Location Information */}
                      {insights.location && insights.location.length > 0 && (
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Location</h3>
                          <ul className="space-y-1.5">
                            {insights.location.map((loc, idx) => (
                              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                <span className="text-[#5B5FED] mt-1">•</span>
                                <span>{loc}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Time Information */}
                      {insights.time_info && Object.keys(insights.time_info).length > 0 && (
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">Timeline</h3>
                          <div className="space-y-2">
                            {insights.time_info.start_time && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Started:</span>
                                <span className="text-sm text-gray-300">{insights.time_info.start_time}</span>
                              </div>
                            )}
                            {insights.time_info.duration && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Duration:</span>
                                <span className="text-sm text-gray-300">{insights.time_info.duration}</span>
                              </div>
                            )}
                            {insights.time_info.frequency && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">Frequency:</span>
                                <span className="text-sm text-gray-300">{insights.time_info.frequency}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Persons Involved */}
                      {insights.persons_described && insights.persons_described.length > 0 && (
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Persons Involved</h3>
                          <ul className="space-y-2">
                            {insights.persons_described.map((person, idx) => (
                              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                <User className="w-4 h-4 mt-0.5 text-[#5B5FED] shrink-0" />
                                <span>{typeof person === 'string' ? person : `${person.name}${person.role ? ` (${person.role})` : ''}`}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Additional Information */}
                      {insights.additional_info && insights.additional_info.length > 0 && (
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                          <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Additional Information</h3>
                          <ul className="space-y-1.5">
                            {insights.additional_info.map((info, idx) => (
                              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                <span className="text-[#5B5FED] mt-1">•</span>
                                <span>{info}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}

        {/* View: Dispatch (Map) */}
        {activeNavItem === 'dispatch' && (
          <div className="flex-1 relative flex">
            <div className="flex-1 relative">
              <DispatchMap
                ref={dispatchMapRef}
                callerLatitude={mapLocation.latitude}
                callerLongitude={mapLocation.longitude}
                callerAddress={mapLocation.address}
                selectedType={dispatchEmergencyType}
                onStationsFound={(stations) => setDispatchStations(stations)}
              />
            </div>

            {/* Stations List Panel */}
            {dispatchStations.length > 0 && (
              <aside className="w-96 border-l border-[#2a2a2a] bg-[#0a0a0a] flex flex-col">
                <div className="p-4 border-b border-[#2a2a2a]">
                  <h3 className="text-white font-semibold mb-1">Nearest Stations</h3>
                  <p className="text-xs text-gray-400">{dispatchStations.length} stations found</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {dispatchStations.map((station, idx) => (
                    <div
                      key={station.id}
                      className="p-4 border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                      onClick={() => dispatchMapRef.current?.flyToStation(station)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2 h-2 rounded-full ${station.type === 'hospital' ? 'bg-[#3b82f6]' :
                              station.type === 'police' ? 'bg-[#22c55e]' :
                                'bg-[#ef4444]'
                              }`}></div>
                            <h4 className="text-white font-medium text-sm">{station.name}</h4>
                          </div>
                          <p className="text-xs text-gray-400 mb-1">{station.address}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>📍 {station.distance.toFixed(2)} km</span>
                            {station.duration && <span>🕐 {station.duration}</span>}
                          </div>
                        </div>
                        <div className="text-lg font-bold text-gray-600">#{idx + 1}</div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmergencySMS(station);
                          }}
                          className="flex-1 bg-[#5B5FED] hover:bg-[#4a4ec0] text-white text-xs"
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          SMS
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmergencyCall(station);
                          }}
                          className="flex-1 bg-[#5B5FED] hover:bg-[#4a4ec0] text-white text-xs"
                        >
                          <Phone className="w-3 h-3 mr-1" />
                          Call
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}

        {/* View: Analytics */}
        {activeNavItem === 'analytics' && (
          <div className="flex h-full w-full bg-[#0f1117] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 flex flex-col border-r border-gray-800 bg-[#0f1117] p-4">
              <div className="mb-8">
                {/* Sidebar Header if needed */}
              </div>

              <nav className="space-y-2">
                <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800 bg-gray-800/50 text-white">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Ask RudraOne
                </Button>
                <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboards
                </Button>
                <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800">
                  <Flame className="mr-2 h-4 w-4" />
                  Incidents
                </Button>
                <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Usage
                </Button>
                <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800">
                  <History className="mr-2 h-4 w-4" />
                  Audit Logs
                </Button>
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full relative bg-[#0f1117]">
              {/* Chat History */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32 scroll-smooth">
                {analyticsMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <img
                      src="/image-removebg-preview (10).png"
                      alt="RudraOne Logo"
                      className="h-32 w-auto mb-6 opacity-80"
                    />
                    <p className="text-lg font-medium">Ask RudraOne Analytics</p>
                    <p className="text-sm mt-2">Try asking: "Show me call volume by type"</p>
                  </div>
                )}
                
                {analyticsMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full animate-in fade-in slide-in-from-bottom-4 duration-300`}>
                    <div className={`${msg.type === 'html' ? 'w-full' : 'max-w-[70%]'} rounded-2xl ${msg.type === 'html' ? 'bg-transparent p-0' : 'p-5 shadow-lg bg-[#1e293b] border border-gray-700/50'} break-words ${msg.role === 'user' ? 'bg-blue-600 text-white border-none' : ''}`}>
                      {msg.type === 'text' ? (
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-base text-gray-100">{msg.content}</p>
                      ) : (
                        <div className="w-full bg-transparent rounded-xl overflow-hidden">
                           <iframe 
                             srcDoc={msg.content} 
                             className="w-full border-none"
                             title="Analytics Artifact"
                             style={{ minHeight: '100px' }}
                             onLoad={(e) => {
                               const iframe = e.target as HTMLIFrameElement;
                               if (iframe.contentWindow) {
                                 const updateHeight = () => {
                                   if (iframe.contentWindow?.document?.body) {
                                     const height = iframe.contentWindow.document.documentElement.scrollHeight;
                                     iframe.style.height = `${height}px`;
                                   }
                                 };
                                 
                                 // Initial update
                                 updateHeight();
                                 
                                 // Update after delays to catch chart rendering
                                 setTimeout(updateHeight, 100);
                                 setTimeout(updateHeight, 500);
                                 setTimeout(updateHeight, 1000);
                               }
                             }}
                           />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isAnalyticsLoading && (
                  <div className="flex justify-start w-full">
                    <div className="bg-[#1e293b] border border-gray-700/50 rounded-2xl p-4 flex items-center gap-3 shadow-lg">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                      <span className="text-gray-300 text-sm font-medium">RudraOne is analyzing your data...</span>
                    </div>
                  </div>
                )}
                <div ref={analyticsEndRef} />
              </div>

              {/* Floating Input Area */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0f1117] via-[#0f1117] to-transparent z-10">
                <div className="relative flex items-end bg-[#1a1d24]/90 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-2 shadow-2xl max-w-5xl mx-auto ring-1 ring-white/5 transition-all focus-within:ring-blue-500/50 focus-within:border-blue-500/50">
                  <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700/50 mb-0.5">
                    <Plus className="h-5 w-5" />
                  </Button>

                  <textarea
                    value={analyticsInput}
                    onChange={(e) => setAnalyticsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAnalyticsSubmit();
                      }
                    }}
                    placeholder="Ask a question about your data..."
                    className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-500 text-base min-h-[44px] max-h-[160px] py-2.5 px-2 resize-none"
                    disabled={isAnalyticsLoading}
                    rows={1}
                  />

                  <Button 
                    size="icon" 
                    className={`h-10 w-10 rounded-xl mb-0.5 transition-all ${analyticsInput.trim() ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    onClick={handleAnalyticsSubmit}
                    disabled={isAnalyticsLoading || !analyticsInput.trim()}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
                <div className="text-center mt-2">
                    <p className="text-xs text-gray-600">RudraOne Analytics can make mistakes. Please verify important information.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View: Training */}
        {activeNavItem === 'training' && (
          <>
            {/* Left Sidebar: Training Sessions */}
            <aside className="w-80 border-r border-[#2a2a2a] flex flex-col bg-[#0a0a0a]">
              <div className="p-4 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-400 flex items-center gap-1">Training Sessions</div>
                  <Button
                    size="icon"
                    className="h-8 w-8 bg-[#5B5FED] hover:bg-[#4a4ec0] rounded-md"
                    onClick={handleStartTraining}
                    disabled={isTrainingInProgress}
                  >
                    {isTrainingInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                  </Button>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input placeholder="Search Sessions" className="pl-9 bg-[#1a1a1a] border-[#333] text-sm h-9 text-white placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-[#5B5FED]" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {trainingLogs.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    No training sessions yet. Start a new scenario to begin.
                  </div>
                ) : (
                  trainingLogs.map((log, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setActiveTrainingSession(log.session_id);
                        if (log.conversation) setTrainingConversation(log.conversation);
                        setHasGeneratedTrainingAIQuestions(false);
                        // Initialize protocol session if missing
                        if (protocolManagerRef.current && !protocolManagerRef.current.getSession(log.session_id)) {
                          protocolManagerRef.current.initializeSession(log.session_id);
                        }
                      }}
                      className={`p-3 border-b border-[#1a1a2a] cursor-pointer hover:bg-[#1a1a1a] transition-colors relative ${activeTrainingSession === log.session_id ? 'bg-gradient-to-r from-[#1a1a1a] to-[#1e1e2e]' : ''
                        }`}
                    >
                      {activeTrainingSession === log.session_id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5B5FED]"></div>}
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                          log.status === 'error' ? 'bg-red-900/30 text-red-400' :
                            'bg-blue-900/30 text-blue-400'
                          }`}>
                          <GraduationCap className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-medium truncate ${activeTrainingSession === log.session_id ? 'text-white' : 'text-gray-300'}`}>{log.scenario}</span>
                            <div className="text-xs text-gray-500 flex flex-col items-end">
                              <span>{log.duration || log.time}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${log.status === 'active' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-gray-800/50 border-gray-700 text-gray-400'
                              }`}>
                              {log.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>

            {/* Center Panel: Training Chat */}
            <main className="flex-1 flex flex-col bg-[#0a0a0a] relative min-w-0">
              {activeTrainingSession ? (
                <>
                  <div className="h-16 border-b border-[#2a2a2a] flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Training Simulation</h2>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className={`${isTrainingInProgress ? 'text-[#5B5FED]' : 'text-gray-500'
                            }`}>
                            {isTrainingInProgress ? 'Active Scenario' : 'Scenario Ended'}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                          <div className="flex items-center gap-1 text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#333]">
                            {trainingLogs.find(l => l.session_id === activeTrainingSession)?.scenario || "Unknown Scenario"}
                          </div>
                          {isTrainingInProgress && trainingStartTime && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                              <span className="text-gray-400 font-mono">
                                <Clock className="w-3 h-3 inline mr-1" />
                                <TrainingTimer startTime={trainingStartTime} />
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={isTrainingInProgress ? "destructive" : "secondary"}
                        size="sm"
                        className={`${isTrainingInProgress
                          ? "bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50"
                          : "bg-gray-800 text-gray-400 border border-gray-700 cursor-not-allowed"
                          }`}
                        onClick={handleStopTraining}
                        disabled={!isTrainingInProgress}
                      >
                        {isTrainingInProgress ? "Stop Training" : "Session Ended"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="flex justify-center mb-6">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Play className="w-3 h-3" /> Simulation Started
                      </div>
                    </div>

                    {trainingConversation.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === 'Dispatch' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] ${msg.sender === 'Dispatch' ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-400">{msg.sender}</span>
                            <span className="text-[10px] text-gray-600">{msg.time}</span>
                          </div>
                          <div className={`p-3 text-sm ${msg.sender === 'Dispatch'
                            ? 'bg-[#1a1a1a] border border-[#333] rounded-tr-sm text-gray-300'
                            : 'bg-[#1a1a1a] border border-[#333] rounded-tl-sm text-white'
                            }`}>
                            {msg.message}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={conversationEndRef} />
                  </div>

                  {/* Input Area */}
                  {isTrainingInProgress ? (
                    <div className="p-4 border-t border-[#2a2a2a] bg-[#0a0a0a]">
                      {/* Suggested Question Display */}
                      {activeTrainingSession && protocolManagerRef.current?.getSession(activeTrainingSession) && (
                        (() => {
                          const unansweredQuestions = protocolManagerRef.current!.getUnansweredQuestions(activeTrainingSession);
                          const nextQuestion = unansweredQuestions[0];

                          return nextQuestion && !messageText ? (
                            <div className="mb-3 p-3 bg-[#1a1a1a] border border-[#333] rounded-lg">
                              <div className="flex items-start gap-2">
                                <Sparkles className="w-4 h-4 text-[#5B5FED] mt-0.5 shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs text-gray-400 mb-1">Suggested Question:</p>
                                  <button
                                    onClick={() => setMessageText(nextQuestion.question)}
                                    className="text-sm text-gray-300 hover:text-white text-left w-full transition-colors"
                                  >
                                    {nextQuestion.question}
                                  </button>
                                </div>
                                <button
                                  onClick={() => setMessageText(nextQuestion.question)}
                                  className="text-xs text-[#5B5FED] hover:text-[#7b7ff0] transition-colors"
                                >
                                  Use this →
                                </button>
                              </div>
                            </div>
                          ) : null;
                        })()
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-10 w-10 rounded-full transition-all ${isMicActive
                            ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                            : 'bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
                            }`}
                          onClick={toggleMicrophone}
                        >
                          {isMicActive ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </Button>
                        <div className="flex-1 relative">
                          <Input
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder={isMicActive ? "Listening... Speak now" : "Type your response..."}
                            className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 focus-visible:ring-[#5B5FED]"
                          />
                          {isMicActive && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <div className="flex items-center gap-1">
                                <div className="w-1 h-3 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-1 h-3 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={handleSendMessage}
                          disabled={!messageText.trim()}
                          className="bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 border-t border-[#2a2a2a] bg-[#0a0a0a]">
                      <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333] text-center">
                        <p className="text-sm text-gray-500">Training session has ended. View the Evaluation tab for your performance review.</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                  <GraduationCap className="w-16 h-16 mb-4 opacity-20" />
                  <p className="mb-4">Select a session or start a new scenario</p>
                  <Button
                    onClick={handleStartTraining}
                    disabled={isTrainingInProgress}
                    className="bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
                  >
                    {isTrainingInProgress ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Start New Scenario
                      </>
                    )}
                  </Button>
                </div>
              )}
            </main>

            {/* Right Panel: Training Insights */}
            <aside
              style={{ width: rightWidth }}
              className="border-l border-[#2a2a2a] flex flex-col bg-[#0a0a0a] relative overflow-hidden"
            >
              {/* Resize Handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#5B5FED]/50 z-50 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingRight(true);
                }}
              />

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex border-b border-[#2a2a2a] shrink-0">
                  {['Insights', 'Evaluation', 'Location', 'Guidance'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab.toLowerCase())}
                      className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.toLowerCase() ? 'border-[#5B5FED] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                  <div className="p-4">
                    {/* Tab Content */}
                    {activeTab === 'guidance' && (
                      <div className="space-y-4">
                        {activeTrainingSession ? (
                          <>
                            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Suggested Questions</h3>
                              <p className="text-xs text-gray-500 mb-3">AI-generated questions based on the conversation</p>
                              {protocolManagerRef.current?.getSession(activeTrainingSession) ? (
                                <div className="space-y-3">
                                  {/* Loading State */}
                                  {isGeneratingQuestions && (
                                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                      <Loader2 className="w-4 h-4 animate-spin text-[#5B5FED]" />
                                      <span>Analyzing conversation and generating suggestions...</span>
                                    </div>
                                  )}

                                  {/* Unanswered Questions */}
                                  {protocolManagerRef.current.getUnansweredQuestions(activeTrainingSession).length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-semibold text-[#5B5FED] mb-2">Questions to Ask:</h4>
                                      <ul className="space-y-2">
                                        {protocolManagerRef.current.getUnansweredQuestions(activeTrainingSession).map((q) => (
                                          <li key={q.id} className="flex items-start gap-2 text-sm">
                                            <span className="text-yellow-500 mt-0.5">❓</span>
                                            <span className="text-gray-300">{q.question}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Answered Questions */}
                                  {protocolManagerRef.current.getAnsweredQuestions(activeTrainingSession).length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-semibold text-green-400 mb-2">Questions Covered:</h4>
                                      <ul className="space-y-2">
                                        {protocolManagerRef.current.getAnsweredQuestions(activeTrainingSession).map((q) => (
                                          <li key={q.id} className="flex items-start gap-2 text-sm">
                                            <span className="text-green-500 mt-0.5">✓</span>
                                            <span className="text-gray-500 line-through">{q.question}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Empty State */}
                                  {!isGeneratingQuestions &&
                                    protocolManagerRef.current.getUnansweredQuestions(activeTrainingSession).length === 0 &&
                                    protocolManagerRef.current.getAnsweredQuestions(activeTrainingSession).length === 0 && (
                                      <p className="text-sm text-gray-500 text-center py-4">Start the conversation to see AI-generated suggestions</p>
                                    )}

                                  {/* Completion Progress */}
                                  {(protocolManagerRef.current.getUnansweredQuestions(activeTrainingSession).length > 0 ||
                                    protocolManagerRef.current.getAnsweredQuestions(activeTrainingSession).length > 0) && (
                                      <div className="pt-3 border-t border-[#333]">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs text-gray-400">Protocol Completion</span>
                                          <span className="text-xs font-bold text-[#5B5FED]">
                                            {protocolManagerRef.current.getCompletionPercentage(activeTrainingSession)}%
                                          </span>
                                        </div>
                                        <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-gradient-to-r from-[#5B5FED] to-[#7b7ff0] transition-all duration-500"
                                            style={{ width: `${protocolManagerRef.current.getCompletionPercentage(activeTrainingSession)}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-[#5B5FED]" />
                                  <span>Initializing protocol assistant...</span>
                                </div>
                              )}
                            </div>

                            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Best Practices</h3>
                              <ul className="space-y-2 text-sm text-gray-300">
                                <li className="flex items-start gap-2">
                                  <span className="text-[#5B5FED]">•</span>
                                  <span>Listen actively and acknowledge what the caller says</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-[#5B5FED]">•</span>
                                  <span>Ask follow-up questions based on their responses</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-[#5B5FED]">•</span>
                                  <span>Verify exact location and cross-streets if possible</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <span className="text-[#5B5FED]">•</span>
                                  <span>Stay calm, speak clearly, and reassure the caller</span>
                                </li>
                              </ul>
                            </div>
                          </>
                        ) : (
                          <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333] text-center">
                            <p className="text-sm text-gray-500">Start a training session to receive AI-powered guidance.</p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab === 'location' && (
                      <div className="h-[600px] w-full bg-[#1a1a1a] rounded-lg overflow-hidden relative">
                        <MapView
                          latitude={mapLocation.latitude}
                          longitude={mapLocation.longitude}
                          address={mapLocation.address}
                        />
                      </div>
                    )}
                    {activeTab === 'insights' && (
                      <div className="space-y-4">
                        {/* Training Insights - Extracted Information */}
                        {activeTrainingSession && trainingInsights && (
                          <>
                            {trainingInsights.summary && (
                              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                                <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Call Summary</h3>
                                <p className="text-sm text-gray-300">{trainingInsights.summary}</p>
                              </div>
                            )}

                            {trainingInsights.persons_described && trainingInsights.persons_described.length > 0 && (
                              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                                <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Persons Involved</h3>
                                <ul className="space-y-1">
                                  {trainingInsights.persons_described.map((person, idx) => (
                                    <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                      <span className="text-[#5B5FED] mt-1">•</span>
                                      <span>{typeof person === 'string' ? person : `${person.name} (${person.role})`}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {trainingInsights.location && trainingInsights.location.length > 0 && (
                              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                                <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Location Details</h3>
                                <p className="text-sm text-gray-300">{trainingInsights.location.join(', ')}</p>
                              </div>
                            )}

                            {trainingInsights.incident && Object.keys(trainingInsights.incident).length > 0 && (
                              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                                <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Incident Details</h3>
                                <div className="space-y-2">
                                  {Object.entries(trainingInsights.incident).map(([key, value]) => (
                                    <div key={key} className="text-sm">
                                      <span className="text-gray-500">{key}:</span>
                                      <span className="text-gray-300 ml-2">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {activeTab === 'evaluation' && (
                      <div className="space-y-4">
                        {trainingEvaluation ? (
                          <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-xs font-bold text-[#5B5FED] uppercase">Performance Evaluation</h3>
                              {trainingConfidence && (
                                <span className={`text-xs font-bold px-2 py-1 rounded ${trainingConfidence > 80 ? 'bg-green-900/30 text-green-400' :
                                  trainingConfidence > 60 ? 'bg-yellow-900/30 text-yellow-400' :
                                    'bg-red-900/30 text-red-400'
                                  }`}>
                                  Score: {trainingConfidence}%
                                </span>
                              )}
                            </div>
                            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white prose-p:text-gray-300">
                              <ReactMarkdown>{trainingEvaluation}</ReactMarkdown>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333] text-center">
                            <p className="text-sm text-gray-500">Complete a training session to view your evaluation.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </>
        )}

        {/* View: Settings */}
        {activeNavItem === 'settings' && (
          <div className="flex-1 flex bg-[#0a0a0a] overflow-hidden">
            {/* Settings Sidebar */}
            <div className={`${isSettingsSidebarOpen ? 'w-64' : 'w-0'} bg-[#1a1a1a] border-r border-gray-800 transition-all duration-300 overflow-hidden flex flex-col`}>
              <div className="p-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">Settings Menu</h3>
              </div>
              <nav className="flex-1 p-4 space-y-2">
                <button
                  onClick={() => setActiveSettingsSection('call-forwarding')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeSettingsSection === 'call-forwarding'
                    ? 'bg-[#5B5FED]/10 text-[#5B5FED]'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                    }`}
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-medium">Call Forwarding</span>
                </button>
                <button
                  onClick={() => setActiveSettingsSection('language')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeSettingsSection === 'language'
                    ? 'bg-[#5B5FED]/10 text-[#5B5FED]'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                    }`}
                >
                  <Languages className="w-4 h-4" />
                  <span className="text-sm font-medium">Default Language</span>
                </button>
                <button
                  onClick={() => setActiveSettingsSection('database')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeSettingsSection === 'database'
                    ? 'bg-[#5B5FED]/10 text-[#5B5FED]'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                    }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Clear Database</span>
                </button>
              </nav>
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Toggle Sidebar Button */}
              <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-gray-800">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsSettingsSidebarOpen(!isSettingsSidebarOpen)}
                      className="p-2 rounded-lg bg-[#1a1a1a] border border-gray-800 hover:bg-[#2a2a2a] transition-colors"
                    >
                      {isSettingsSidebarOpen ? (
                        <ChevronLeft className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    <h2 className="text-xl font-semibold text-white">
                      {activeSettingsSection === 'call-forwarding' && 'Call Forwarding'}
                      {activeSettingsSection === 'language' && 'Language Settings'}
                      {activeSettingsSection === 'database' && 'Database Management'}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-6 max-w-4xl mx-auto">
                <div className="space-y-6">
                  {/* Call Forwarding Section */}
                  {activeSettingsSection === 'call-forwarding' && (
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-[#5B5FED]/10 flex items-center justify-center">
                          <Phone className="w-5 h-5 text-[#5B5FED]" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Call Forwarding</h3>
                          <p className="text-sm text-gray-400">Manage call forwarding settings for your agency</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-gray-300">Forwarding Number</label>
                          <Input
                            value={callForwardNumber}
                            onChange={(e) => setCallForwardNumber(e.target.value)}
                            placeholder="+1234567890"
                            className="bg-[#0a0a0a] border-gray-800 text-white"
                          />
                          <p className="text-xs text-gray-500">Enter the phone number to forward calls to (e.g., +1234567890)</p>
                        </div>

                        <div className="flex items-center justify-between bg-[#0a0a0a] p-4 rounded-lg border border-gray-800">
                          <div className="space-y-0.5">
                            <label className="text-sm font-medium text-white">Enable Forwarding</label>
                            <p className="text-xs text-gray-500">Automatically forward incoming calls</p>
                          </div>
                          <div
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${isForwardingEnabled ? 'bg-[#5B5FED]' : 'bg-gray-700'}`}
                            onClick={() => setIsForwardingEnabled(!isForwardingEnabled)}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isForwardingEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                          </div>
                        </div>

                        <Button
                          onClick={saveCallForwarding}
                          disabled={savingSettings}
                          className="w-full bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
                        >
                          {savingSettings ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Settings
                            </>
                          )}
                        </Button>
                        {/* Emergency Numbers Section */}
                        <div className="mt-10 pt-6 border-t border-gray-800">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-[#5B5FED]/10 flex items-center justify-center">
                              <Ambulance className="w-5 h-5 text-[#5B5FED]" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-white">Emergency Service Numbers</h3>
                              <p className="text-sm text-gray-400">Configure local Hospital, Fire & Police contacts</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">Hospital</label>
                              <input
                                type="tel"
                                placeholder="+1800123456"
                                value={hospitalNumber}
                                onChange={(e) => setHospitalNumber(e.target.value)}
                                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#5B5FED] focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">Fire</label>
                              <input
                                type="tel"
                                placeholder="+1800123457"
                                value={fireNumber}
                                onChange={(e) => setFireNumber(e.target.value)}
                                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#5B5FED] focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">Police</label>
                              <input
                                type="tel"
                                placeholder="+1800123458"
                                value={policeNumber}
                                onChange={(e) => setPoliceNumber(e.target.value)}
                                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#5B5FED] focus:border-transparent"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">Numbers can be left blank to disable a service.</p>
                          <Button
                            type="button"
                            onClick={saveEmergencyNumbers}
                            className="mt-4 w-full bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
                          >
                            <Save className="w-4 h-4 mr-2" /> Save Emergency Numbers
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Language Settings Section */}
                  {activeSettingsSection === 'language' && (
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-[#5B5FED]/10 flex items-center justify-center">
                          <Languages className="w-5 h-5 text-[#5B5FED]" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Language Preferences</h3>
                          <p className="text-sm text-gray-400">Set the default language for the dashboard</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-gray-300">Default Language</label>
                          <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                            <SelectTrigger className="bg-[#0a0a0a] border-gray-800 text-white">
                              <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-gray-800 text-white">
                              <SelectItem value="english">English</SelectItem>
                              <SelectItem value="spanish">Spanish</SelectItem>
                              <SelectItem value="french">French</SelectItem>
                              <SelectItem value="german">German</SelectItem>
                              <SelectItem value="hindi">Hindi</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500">
                            This language will be selected by default when the dashboard loads.
                          </p>
                        </div>

                        <Button
                          onClick={saveLanguagePreference}
                          disabled={savingSettings}
                          className="w-full bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
                        >
                          {savingSettings ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Language Preference
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Clear Database Section */}
                  {activeSettingsSection === 'database' && (
                    <div className="bg-[#1a1a1a] border border-red-900/30 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Factory Reset</h3>
                          <p className="text-sm text-red-400/70">Permanently delete all data from the database</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                          <p className="text-sm text-gray-300 mb-3">
                            This will permanently delete from PostgreSQL database:
                          </p>
                          <ul className="text-sm text-gray-400 space-y-1 ml-4">
                            <li>• All call records and metadata</li>
                            <li>• All transcripts and translations</li>
                            <li>• All insights and protocol questions</li>
                            <li>• All location data</li>
                            <li>• All login logs</li>
                            <li>• All local browser storage</li>
                          </ul>
                          <p className="text-xs text-red-400 mt-3">
                            ⚠️ WARNING: This action is IRREVERSIBLE. All data will be permanently deleted from the server.
                          </p>
                        </div>

                        <Button
                          onClick={handleClearDatabase}
                          variant="destructive"
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Factory Reset (Delete All Data)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
