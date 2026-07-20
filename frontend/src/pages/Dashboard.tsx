import { useNavigate } from "react-router-dom";
import { Phone, Plus, Search, Bell, User, ChevronDown, Share2, Sparkles, Copy, Volume2, MapPin, FileText, Play, GripVertical, Radio, BarChart3, GraduationCap, Compass, Settings, Send, Mic, MicOff, CheckCircle, XCircle, AlertCircle, Info, MessageSquare, Ambulance, Shield, Flame, Loader2 } from "lucide-react";
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
  status: "active" | "completed" | "error";
  confidence_score?: number;
  evaluation?: string;
  started_at: string;
  ended_at?: string;
  conversation?: ConversationMessage[];  // Store the conversation history
  insights?: InsightsData;  // Store extracted insights
}

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

export const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("insights");
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
  
  // Map location state
  const [mapLocation, setMapLocation] = useState({
    latitude: 40.7128,
    longitude: -74.0060,
    address: "123 Main Street, New York, NY",
    district: "Manhattan, New York"
  });
  
  // Emergency services state
  const [nearestServices, setNearestServices] = useState<{
    hospital?: { name: string; distance: number };
    police?: { name: string; distance: number };
    fire?: { name: string; distance: number };
  }>({});
  const [audioLevel, setAudioLevel] = useState(0);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [selectedIncident, setSelectedIncident] = useState(0);
  const [isLiveCall, setIsLiveCall] = useState(false);

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
  const [isMicActive, setIsMicActive] = useState(false);
  const audioServiceRef = useRef<AudioService | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const [selectedCallSid, setSelectedCallSid] = useState<string | null>(null);
  const [selectedCallerNumber, setSelectedCallerNumber] = useState<string | null>(null);
  const [pendingToast, setPendingToast] = useState<{ title: string; description: string } | null>(null);

  // Insights state - Start with empty state for live calls
  const [insights, setInsights] = useState<InsightsData>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('callInsights');
    if (saved) {
      try {
        return JSON.parse(saved);
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
      new_information_found: false
    };
  });
  const [isStreamingInsights, setIsStreamingInsights] = useState(false);
  const insightsExtractorRef = useRef<ReturnType<typeof getInsightsExtractor> | null>(null);

  // Protocol questions state
  const [protocolQuestions, setProtocolQuestions] = useState<ProtocolQuestion[]>([]);
  const [hasGeneratedAIQuestions, setHasGeneratedAIQuestions] = useState(false);
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
        return JSON.parse(saved);
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
      new_information_found: false
    };
  });
  const trainingInsightsExtractorRef = useRef<ReturnType<typeof getInsightsExtractor> | null>(null);

  // Messages state
  const [activeMessages, setActiveMessages] = useState<Array<{number: string, timestamp: string}>>([
    { number: '+917795075436', timestamp: new Date().toISOString() }
  ]);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState<{[key: string]: boolean}>({});
  const [locationData, setLocationData] = useState<{[key: string]: {latitude: number, longitude: number, address?: string, timestamp: string}}>({});

  // Dispatch state
  const [dispatchEmergencyType, setDispatchEmergencyType] = useState<'hospital' | 'police' | 'fire'>('hospital');
  const [dispatchStations, setDispatchStations] = useState<EmergencyStation[]>([]);
  const [isSearchingStations, setIsSearchingStations] = useState(false);
  const [selectedStationIndex, setSelectedStationIndex] = useState<number | null>(null);
  const dispatchMapRef = useRef<DispatchMapRef>(null);

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

  // Save emergency contacts to localStorage whenever they change
  useEffect(() => {
    console.log('💾 Saving emergency contacts to localStorage');
    localStorage.setItem('emergencyContacts', JSON.stringify(emergencyContacts));
  }, [emergencyContacts]);

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
    if (!protocolManagerRef.current || !selectedCallerNumber) return;

    const conversationText = conversation.map(msg => msg.message).join(' ');

    // Check and mark questions
    const result = protocolManagerRef.current.checkAndMarkQuestion(
      selectedCallerNumber,
      conversationText
    );

    if (result.updated) {
      // Update state with latest questions
      const state = protocolManagerRef.current.getSession(selectedCallerNumber);
      if (state) {
        setProtocolQuestions([...state.questions]);
      }
    }

    // Generate AI questions after predefined questions are mostly answered
    if (!hasGeneratedAIQuestions && conversation.length >= 6) {
      const completion = protocolManagerRef.current.getCompletionPercentage(selectedCallerNumber);
      if (completion >= 50) {
        setHasGeneratedAIQuestions(true);
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
        });
      }
    }
  }, [conversation, selectedCallerNumber, hasGeneratedAIQuestions]);

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
  const { isConnected: notificationsConnected } = useWebSocket({
    url: apiService.getWebSocketUrl('/client/notifications'),
    autoReconnect: false, // Disable auto-reconnect to prevent spam
    onMessage: (message: TranscriptionMessage) => {
      if (message.type === 'location_update' && message.location) {
        // Handle location data received from backend
        const { latitude, longitude, caller_number } = message.location;
        console.log('📍 Location received via WebSocket:', message.location);
        console.log('📍 Caller number from location:', caller_number);
        console.log('📍 Active messages:', activeMessages);
        
        if (latitude && longitude) {
          // Reverse geocode to get address
          reverseGeocode(latitude, longitude).then(address => {
            const locationInfo = {
              latitude,
              longitude,
              address,
              timestamp: new Date().toISOString()
            };
            
            // Store location data for both the caller number and the test number
            setLocationData(prev => {
              const updated = {
                ...prev,
                [caller_number || 'unknown']: locationInfo
              };
              
              // Also store for test number if caller is unknown
              if (caller_number === 'unknown' || !caller_number) {
                updated['+917795075436'] = locationInfo;
              }
              
              console.log('✅ Location data updated:', updated);
              return updated;
            });
            
            // Show toast notification
            toast({
              title: "📍 Location Received",
              description: address,
            });
            
            console.log('✅ Location stored for:', caller_number || 'unknown', 'and +917795075436');
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
            phone: message.caller_number || 'Unknown',
            preview: 'Incoming call...',
            time: '00:00',
            date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
            language: 'English',
            isLive: true,
            call_sid: message.call_sid,
          };

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

          return [newCall, ...prev];
        });
      } else if (message.type === 'call_ended') {
        setCalls(prev => prev.map(call =>
          call.call_sid === message.call_sid
            ? { ...call, isLive: false }
            : call
        ));
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
        if (Math.random() < 0.05) {
          console.log('📨 Audio message:', {
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

      if (message.type === 'transcription' && message.speaker && message.message) {
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
              translatedMessage = result.translated;
              isTranslated = result.sourceLanguage !== 'en' && translatedMessage.toLowerCase().trim() !== message.message.toLowerCase().trim();

              console.log('✅ CALLER Translation to English:', {
                original: message.message,
                translated: translatedMessage,
                detectedLanguage: result.sourceLanguage,
                isTranslated
              });
            } else {
              // Dispatcher speaks another language - translate caller to that language
              const result = await translateDispatcherMessage(message.message, targetLang);
              translatedMessage = result.translated;
              isTranslated = translatedMessage.toLowerCase().trim() !== message.message.toLowerCase().trim();

              console.log('✅ CALLER Translation to dispatcher language:', {
                original: message.message,
                translated: translatedMessage,
                targetLanguage: targetLang,
                isTranslated
              });
            }
          } else if (message.speaker === 'DISPATCH') {
            // Dispatcher message - no translation needed for display
            // (Server handles audio translation to caller's phone based on caller's detected language)
            console.log('⏭️ DISPATCH message - no translation needed (dispatcher language)');
            translatedMessage = message.message;
            isTranslated = false;
          }
        } catch (error) {
          console.error('❌ Translation error:', error);
          // Keep original message if translation fails
        }

        const newMessage: ConversationMessage = {
          sender: message.speaker === 'CALLER' ? 'Caller' : 'Dispatch',
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
            if (lastMsg && lastMsg.sender === newMessage.sender && !lastMsg.is_final) {
              // Replace interim with final
              return [...prev.slice(0, -1), newMessage];
            }
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
              .then(updatedInsights => {
                console.log('✅ Insights updated (client-side):', updatedInsights);
                setInsights(updatedInsights);

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
  const handleStartTraining = async () => {
    try {
      setIsTrainingInProgress(true);
      const sessionId = `training_${Date.now()}`;

      const response = await fetch('http://localhost:8000/training/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to start training session');
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
      setSelectedIncident(0);

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
      toast({
        title: "Training Error",
        description: "Failed to start training session",
        variant: "destructive",
      });
    } finally {
      setIsTrainingInProgress(false);
    }
  };

  const handleTrainingMessage = async (message: string) => {
    if (!activeTrainingSession) return;

    try {
      // Add dispatcher message to conversation immediately
      const dispatchMessage = {
        sender: 'Dispatch',
        time: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }),
        message: message,
        is_final: true,
      };

      setTrainingConversation(prev => [...prev, dispatchMessage]);

      const response = await fetch('http://localhost:8000/training/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: activeTrainingSession,
          message: message
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send training message');
      }

      const data = await response.json();

      // Add caller response
      if (data.caller_response) {
        const callerMessage = {
          sender: 'Caller',
          time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }),
          message: data.caller_response,
          is_final: true,
        };
        
        setTrainingConversation(prev => [...prev, callerMessage]);

        // Extract insights from caller message
        if (trainingInsightsExtractorRef.current) {
          try {
            console.log('📊 Extracting insights from training caller message:', data.caller_response);
            const updatedInsights = await trainingInsightsExtractorRef.current.processSentence(
              data.caller_response,
              activeTrainingSession,
              'Training Caller'
            );
            setTrainingInsights(updatedInsights);
            console.log('✅ Training insights updated:', updatedInsights);

            // Update map location if location information is found in training
            if (updatedInsights.location && updatedInsights.location.length > 0) {
              const locationText = updatedInsights.location[0];
              console.log('📍 Location found in training insights:', locationText);
              
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
          } catch (error) {
            console.error('❌ Error extracting training insights:', error);
          }
        }
      }

    } catch (error) {
      console.error('Error sending training message:', error);
      toast({
        title: "Training Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleEndTraining = async () => {
    if (!activeTrainingSession) return;

    try {
      const response = await fetch('http://localhost:8000/training/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: activeTrainingSession
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to end training session');
      }

      const data = await response.json();

      // Update training log
      setTrainingLogs(prev => prev.map(log =>
        log.session_id === activeTrainingSession
          ? {
            ...log,
            status: "completed",
            confidence_score: data.confidence_score,
            evaluation: data.evaluation,
            ended_at: new Date().toISOString(),
            conversation: [...trainingConversation] // Store the conversation
          }
          : log
      ));

      setTrainingConfidence(data.confidence_score);
      setTrainingEvaluation(data.evaluation);
      
      // Store insights in the training log
      setTrainingLogs(prev => prev.map(log =>
        log.session_id === activeTrainingSession
          ? { ...log, insights: trainingInsights }
          : log
      ));
      
      setActiveTrainingSession(null);

      // Automatically switch to Results tab to show evaluation
      setActiveTab("results");

      toast({
        title: "Training Completed",
        description: `Session ended with ${data.confidence_score}% confidence. View results in the Results tab.`,
      });

    } catch (error) {
      console.error('Error ending training:', error);
      toast({
        title: "Training Error",
        description: "Failed to end training session",
        variant: "destructive",
      });
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

    // Load insights if available
    if (log.insights) {
      console.log('📊 Loading insights from log:', log.insights);
      setTrainingInsights(log.insights);
    } else {
      console.log('⚠️ No insights found in log');
      setTrainingInsights({
        persons_described: [],
        summary: "",
        location: [],
        incident: {},
        time_info: {},
        additional_info: [],
        new_information_found: false
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
      setIsListening(false);
      console.log('🎤 Speech recognition ended');

      // Auto-restart if still in training speech mode
      if (isTrainingSpeechActive) {
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
      }
    };

    recognition.onerror = (event) => {
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
        // Don't show error for no-speech, just log it
        console.log('⏳ No speech detected, will restart automatically...');
        // Let onend handle the restart
      } else if (event.error === 'aborted') {
        // Recognition was intentionally stopped
        console.log('🛑 Speech recognition aborted');
        setIsListening(false);
      } else if (event.error === 'network') {
        console.log('🌐 Network error, will retry...');
        // Let onend handle the restart
      } else {
        console.error('❌ Speech recognition error:', event.error);
        // For severe errors, stop the recognition
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
    console.log('🛑 Stopping speech recognition...');
    setIsTrainingSpeechActive(false); // Set this first to prevent restart
    setIsListening(false);

    if (speechRecognition) {
      try {
        speechRecognition.abort(); // Use abort instead of stop for immediate termination
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
      setSpeechRecognition(null);
    }

    toast({
      title: "Speech Recognition Stopped",
      description: "Microphone is no longer listening",
    });
  }, [speechRecognition]);

  // Handle microphone toggle
  const toggleMicrophone = useCallback(async () => {
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
            console.warn('⚠️ No caller number selected, audio not sent');
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
  }, [isMicActive, selectedCallerNumber, toast]);

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
    // Maximum 550px to keep reasonable space for center panel
    if (newWidth >= 376 && newWidth <= 550) {
      setRightWidth(newWidth);
    }
  }, [isResizingRight]);

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



  const handleIncidentClick = (idx: number) => {
    // Toggle: if clicking the same call, deselect it and show map
    if (selectedIncident === idx && activeNavItem === "calls") {
      setSelectedIncident(0);
      setSelectedCallSid(null);
      setSelectedCallerNumber(null);
      setConversation([]);
      setIsLiveCall(false);
      console.log('Call deselected, showing map view');
      return;
    }

    setSelectedIncident(idx);
    const call = calls[idx];
    setDetectedLanguage(call.language);
    setIsLiveCall(call.isLive);

    // Clear conversation when switching calls
    setConversation([]);

    if (call.call_sid) {
      setSelectedCallSid(call.call_sid);
      setSelectedCallerNumber(call.phone);
      console.log('Selected call:', call.phone, 'SID:', call.call_sid);
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
        new_information_found: false
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
      // Send SMS via Twilio
      const result = await twilioService.sendTrackingLink(targetNumber);

      if (result.success) {
        // Mark as sent
        setLinkSent(prev => ({ ...prev, [phoneNumber]: true }));
        
        toast({
          title: "✅ Tracking Link Sent",
          description: `SMS successfully sent to ${targetNumber}. Awaiting location data.`,
        });

        console.log('📱 SMS sent successfully. Message SID:', result.messageSid);
      } else {
        toast({
          title: "❌ Failed to Send SMS",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });

        console.error('Failed to send SMS:', result.error);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send tracking link. Please try again.",
        variant: "destructive",
      });
      
      console.error('Error in handleSendTrackingLink:', error);
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
                  <div key={index} className="flex items-start gap-3 p-3 bg-[#262626] rounded-lg">
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
              className="flex-1 bg-transparent border-[#333333] hover:bg-white/5 text-white"
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

  return (
    <div className="h-screen bg-[#1a1a1a] text-white flex flex-col overflow-hidden">
      {/* Training Evaluation Popup - Disabled, use Results tab instead */}
      {/* <TrainingEvaluationPopup /> */}

      <style dangerouslySetInnerHTML={{
        __html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #2a2a2a;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #404040;
            border-radius: 3px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #505050;
          }
          .resize-handle {
            transition: background-color 0.2s ease;
          }
          .resize-handle:hover {
            background-color: rgba(59, 130, 246, 0.5) !important;
          }
          .resize-handle:active {
            background-color: rgba(59, 130, 246, 0.8) !important;
          }
          .hover-orange:hover {
            color: #fb923c !important;
            transition: color 0.2s ease;
          }
          .hover-orange-border:hover {
            border-color: #fb923c !important;
            color: #fb923c !important;
            transition: all 0.2s ease;
          }
          .search-glow:focus {
            outline: none;
            border-color: #fb923c !important;
            box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.2) !important;
            transition: all 0.2s ease;
          }
          .search-glow:focus-within {
            border-color: #fb923c !important;
            box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.2) !important;
          }
          [data-state="checked"] {
            color: #fb923c !important;
          }
          [aria-selected="true"] {
            color: #fb923c !important;
            background-color: rgba(251, 146, 60, 0.1) !important;
          }
        `
      }} />
      {/* Top Navigation */}
      <header className="border-b border-[#333333] bg-[#1f1f1f] flex-shrink-0" style={{ height: '64px' }}>
        <div className="flex items-center justify-between px-4 h-full relative">
          <div className="w-14 h-14 flex items-center justify-center flex-shrink-0">
            <img
              src="/apple-touch-icon-removebg-preview.png"
              alt="Logo"
              className="w-14 h-14 object-contain"
            />
          </div>
          <nav className="flex items-center gap-2 overflow-x-auto absolute left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleNavClick("calls")}
              className={`flex items-center gap-1.5 px-3 py-4 whitespace-nowrap text-sm hover-orange border-b-2 transition-colors ${activeNavItem === "calls" ? "text-white font-medium border-[#fb923c]" : "text-[#b5b5b5] border-transparent"
                }`}
            >
              <Phone className="w-4 h-4" />
              <span>Calls</span>
            </button>
            <button
              onClick={() => handleNavClick("dispatch")}
              className={`flex items-center gap-1.5 px-3 py-4 whitespace-nowrap text-sm hover-orange border-b-2 transition-colors ${activeNavItem === "dispatch" ? "text-white font-medium border-[#fb923c]" : "text-[#b5b5b5] border-transparent"
                }`}
            >
              <Radio className="w-4 h-4" />
              <span>Dispatch</span>
            </button>
            <button
              onClick={() => handleNavClick("analytics")}
              className={`flex items-center gap-1.5 px-3 py-4 whitespace-nowrap text-sm hover-orange border-b-2 transition-colors ${activeNavItem === "analytics" ? "text-white font-medium border-[#fb923c]" : "text-[#b5b5b5] border-transparent"
                }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>
            <button
              onClick={() => handleNavClick("training")}
              className={`flex items-center gap-1.5 px-3 py-4 whitespace-nowrap text-sm hover-orange border-b-2 transition-colors ${activeNavItem === "training" ? "text-white font-medium border-[#fb923c]" : "text-[#b5b5b5] border-transparent"
                }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Training</span>
            </button>
            <button
              onClick={() => handleNavClick("admin")}
              className={`flex items-center gap-1.5 px-3 py-4 whitespace-nowrap text-sm hover-orange border-b-2 transition-colors ${activeNavItem === "admin" ? "text-white font-medium border-[#fb923c]" : "text-[#b5b5b5] border-transparent"
                }`}
            >
              <Settings className="w-4 h-4" />
              <span>Admin</span>
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-[#2a2a2a] hover-orange">
              <Bell className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center hover:bg-[#333333] hover-orange">
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      < div ref={containerRef} className="flex flex-1 overflow-hidden" >
        {/* Left Sidebar - Incidents or Training Logs - Hide for admin and analytics */}
        {!(activeNavItem === "admin" || activeNavItem === "analytics") && (
        < div style={{ width: `${leftWidth}px` }} className="border-r border-[#333333] bg-[#1f1f1f] flex flex-col flex-shrink-0" >
          <div className="p-4 border-b border-[#333333]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">
                {activeNavItem === "training" ? "Training Logs" : "Incidents"}
              </h2>
              {activeNavItem === "training" ? (
                <button
                  onClick={handleStartTraining}
                  className="px-3 py-1.5 text-xs bg-[#fb923c] hover:bg-[#ea7b1a] text-white rounded-lg transition-colors"
                  disabled={isTrainingInProgress}
                >
                  {isTrainingInProgress ? "Training..." : "Start Training"}
                </button>
              ) : (
                <button className="p-1.5 rounded-lg hover:bg-[#2a2a2a] hover-orange">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b5b5b5] pointer-events-none" />
              <Input
                placeholder={activeNavItem === "training" ? "Search Training Sessions" : "Search Incidents"}
                className="pl-9 h-9 text-sm bg-[#2a2a2a] border-[#333333] text-white placeholder:text-[#b5b5b5] rounded-lg search-glow"
              />
            </div>
          </div>
          <div className="p-4">
            <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#262626] hover:bg-[#2d2d2d] text-sm hover-orange">
              <span>{activeNavItem === "training" ? "All Training Sessions" : "All Calls"}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
            {activeNavItem === "training" ? (
              // Training logs display
              trainingLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <GraduationCap className="w-12 h-12 text-[#6b6b6b] mb-3" />
                  <p className="text-sm text-[#9e9e9e] mb-2">No training sessions yet</p>
                  <p className="text-xs text-[#6b6b6b]">Click "Start Training" to begin</p>
                </div>
              ) : (
                trainingLogs.map((log, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleTrainingLogClick(idx)}
                    className={`flex items-start gap-3 p-3 mb-2 cursor-pointer rounded-lg hover-orange ${idx === selectedIncident ? "bg-[#262626] border-2 border-[#fb923c]" : "bg-[#262626] hover:bg-[#2d2d2d]"
                      }`}
                    style={{ minHeight: '60px' }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0 relative">
                      <GraduationCap className="w-4 h-4" />
                      {log.status === "active" && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse border-2 border-[#1f1f1f]"></div>
                      )}
                      {log.status === "completed" && log.confidence_score && (
                        <div className="absolute -top-1 -right-1 w-5 h-3 bg-green-500 rounded-full flex items-center justify-center border-2 border-[#1f1f1f]">
                          <span className="text-[8px] font-bold text-white">{log.confidence_score}%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">Training #{idx + 1}</span>
                        <span className="text-xs text-[#9e9e9e]">{log.date}</span>
                      </div>
                      <p className="text-xs text-[#9e9e9e] truncate">{log.scenario || "Emergency scenario training"}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${log.status === "active" ? "bg-yellow-500/20 text-yellow-400" :
                            log.status === "completed" ? "bg-green-500/20 text-green-400" :
                              "bg-gray-500/20 text-gray-400"
                          }`}>
                          {log.status === "active" ? "In Progress" :
                            log.status === "completed" ? "Completed" : "Unknown"}
                        </span>
                        <span className="text-xs text-[#9e9e9e]">{log.time}</span>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              // Regular calls display
              calls.map((call, idx) => (
                <div
                  key={idx}
                  onClick={() => handleIncidentClick(idx)}
                  className={`flex items-start gap-3 p-3 mb-2 cursor-pointer rounded-lg hover-orange ${idx === selectedIncident ? "bg-[#262626] border-2 border-[#fb923c]" : "bg-[#262626] hover:bg-[#2d2d2d]"
                    }`}
                  style={{ minHeight: '60px' }}
                >
                  <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0 relative">
                    <Phone className="w-4 h-4" />
                    {call.isLive && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse border-2 border-[#1f1f1f]"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{call.phone}</span>
                      <span className="text-xs text-[#9e9e9e]">{call.date}</span>
                    </div>
                    <p className="text-xs text-[#9e9e9e] truncate">{call.preview}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-[#9e9e9e]">{call.time}</span>
                      {call.isLive && (
                        <span className="text-xs text-green-500 font-medium">LIVE</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {calls.length === 0 && activeNavItem !== "training" && (
              <div className="p-8 text-center text-[#9e9e9e]">
                <Phone className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No calls yet</p>
                <p className="text-xs mt-1">
                  {notificationsConnected ? 'Waiting for incoming calls...' : 'Connecting...'}
                </p>
              </div>
            )}
          </div>
        </div >
        )}

        {/* Left Resize Handle - Hide for admin and analytics */}
        {!(activeNavItem === "admin" || activeNavItem === "analytics") && (
        < div
          className="w-1 bg-white/5 cursor-col-resize flex items-center justify-center group relative resize-handle"
          onMouseDown={() => setIsResizingLeft(true)}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <GripVertical className="w-3 h-3 text-gray-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div >
        )}

        {/* Center Panel - Conversation OR Full Map View OR Dispatch Map OR Analytics OR Admin */}
        {activeNavItem === "analytics" ? (
          // Analytics Dashboard - Full Page
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0f0f0f] p-8">
            <div className="max-w-[1600px] mx-auto">
              {/* Header with Date Range */}
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                    <BarChart3 className="w-10 h-10 text-[#fb923c]" />
                    Analytics Dashboard
                  </h1>
                  <p className="text-gray-400 text-lg">Real-time call statistics and performance metrics • Updated live</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-[#1f1f1f] border border-[#333333] rounded-lg px-4 py-2">
                    <span className="text-xs text-gray-400">Period: </span>
                    <span className="text-sm font-semibold text-white">Last 30 Days</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-gray-400">Live</span>
                </div>
              </div>

              {/* Key Performance Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <div className="bg-gradient-to-br from-[#2a2a2a] via-[#1f1f1f] to-[#1a1a1a] rounded-2xl p-6 border border-[#333333] hover:border-[#fb923c] transition-all duration-300 shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <Phone className="w-9 h-9 text-[#fb923c]" />
                    <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2.5 py-1.5 rounded-full border border-green-400/20">+12%</span>
                  </div>
                  <h3 className="text-4xl font-extrabold text-white mb-2">2,847</h3>
                  <p className="text-sm text-gray-400 mb-3">Total Calls This Month</p>
                  <div className="pt-3 border-t border-[#333333]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Prev Month</span>
                      <span className="text-gray-300">2,541</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#2a2a2a] via-[#1f1f1f] to-[#1a1a1a] rounded-2xl p-6 border border-[#333333] hover:border-blue-400 transition-all duration-300 shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <Radio className="w-9 h-9 text-blue-400" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs font-bold text-green-400">Live</span>
                    </div>
                  </div>
                  <h3 className="text-4xl font-extrabold text-white mb-2">47</h3>
                  <p className="text-sm text-gray-400 mb-3">Active Calls Now</p>
                  <div className="pt-3 border-t border-[#333333]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Peak Today</span>
                      <span className="text-gray-300">89 calls</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#2a2a2a] via-[#1f1f1f] to-[#1a1a1a] rounded-2xl p-6 border border-[#333333] hover:border-red-400 transition-all duration-300 shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <AlertCircle className="w-9 h-9 text-red-400" />
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2.5 py-1.5 rounded-full border border-yellow-400/20">-8%</span>
                  </div>
                  <h3 className="text-4xl font-extrabold text-white mb-2">342</h3>
                  <p className="text-sm text-gray-400 mb-3">High Priority Calls</p>
                  <div className="pt-3 border-t border-[#333333]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Critical</span>
                      <span className="text-red-400 font-semibold">89</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#2a2a2a] via-[#1f1f1f] to-[#1a1a1a] rounded-2xl p-6 border border-[#333333] hover:border-purple-400 transition-all duration-300 shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <User className="w-9 h-9 text-purple-400" />
                    <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2.5 py-1.5 rounded-full border border-green-400/20">+5%</span>
                  </div>
                  <h3 className="text-4xl font-extrabold text-white mb-2">28</h3>
                  <p className="text-sm text-gray-400 mb-3">Active Dispatchers</p>
                  <div className="pt-3 border-t border-[#333333]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Total Staff</span>
                      <span className="text-gray-300">142</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <div className="bg-[#1f1f1f] rounded-xl p-5 border border-[#333333]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Avg Call Duration</p>
                      <h4 className="text-2xl font-bold text-white">8m 34s</h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#fb923c]/10 flex items-center justify-center">
                      <Phone className="w-6 h-6 text-[#fb923c]" />
                    </div>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] rounded-xl p-5 border border-[#333333]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Resolution Rate</p>
                      <h4 className="text-2xl font-bold text-green-400">94.7%</h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    </div>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] rounded-xl p-5 border border-[#333333]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Callback Rate</p>
                      <h4 className="text-2xl font-bold text-blue-400">12.3%</h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-400/10 flex items-center justify-center">
                      <Phone className="w-6 h-6 text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Call Traffic & Language Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-gradient-to-br from-[#2a2a2a] to-[#1f1f1f] rounded-2xl p-7 border border-[#333333] shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-[#fb923c]" />
                      Call Traffic Analysis
                    </h3>
                    <span className="text-xs text-gray-400">Last 7 Days</span>
                  </div>
                  <div className="space-y-3">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => {
                      const values = [420, 385, 445, 398, 512, 289, 324];
                      const maxVal = 512;
                      const percentage = (values[idx] / maxVal) * 100;
                      return (
                        <div key={day}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-400">{day}</span>
                            <span className="text-sm font-semibold text-white">{values[idx]} calls</span>
                          </div>
                          <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] h-2 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#2a2a2a] to-[#1f1f1f] rounded-2xl p-7 border border-[#333333] shadow-xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-10 h-10 rounded-full bg-[#fb923c]/10 flex items-center justify-center">
                      <span className="text-lg">🌐</span>
                    </div>
                    <h3 className="text-xl font-bold text-white">Language Distribution</h3>
                  </div>
                  <div className="space-y-5">
                    {[
                      { lang: 'English', percentage: 68, color: 'bg-blue-500' },
                      { lang: 'Spanish', percentage: 18, color: 'bg-green-500' },
                      { lang: 'Mandarin', percentage: 7, color: 'bg-purple-500' },
                      { lang: 'French', percentage: 4, color: 'bg-pink-500' },
                      { lang: 'Other', percentage: 3, color: 'bg-gray-500' }
                    ].map(item => (
                      <div key={item.lang}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${item.color}`} />
                            <span className="text-sm text-gray-300">{item.lang}</span>
                          </div>
                          <span className="text-sm font-semibold text-white">{item.percentage}%</span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                          <div 
                            className={`${item.color} h-2 rounded-full transition-all`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Response Times & Peak Hours */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#333333]">
                  <h3 className="text-lg font-semibold text-white mb-4">Average Response Times</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#1f1f1f] rounded-lg">
                      <div className="flex items-center gap-3">
                        <Ambulance className="w-6 h-6 text-blue-400" />
                        <span className="text-sm text-gray-300">Medical Emergency</span>
                      </div>
                      <span className="text-lg font-bold text-blue-400">4.2 min</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[#1f1f1f] rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="w-6 h-6 text-green-400" />
                        <span className="text-sm text-gray-300">Police Emergency</span>
                      </div>
                      <span className="text-lg font-bold text-green-400">5.8 min</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[#1f1f1f] rounded-lg">
                      <div className="flex items-center gap-3">
                        <Flame className="w-6 h-6 text-red-400" />
                        <span className="text-sm text-gray-300">Fire Emergency</span>
                      </div>
                      <span className="text-lg font-bold text-red-400">3.9 min</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#333333]">
                  <h3 className="text-lg font-semibold text-white mb-4">Peak Call Hours</h3>
                  <div className="space-y-3">
                    {[
                      { time: '8:00 AM - 10:00 AM', calls: 145, percentage: 62 },
                      { time: '12:00 PM - 2:00 PM', calls: 189, percentage: 81 },
                      { time: '4:00 PM - 6:00 PM', calls: 234, percentage: 100 },
                      { time: '8:00 PM - 10:00 PM', calls: 167, percentage: 71 },
                      { time: '12:00 AM - 2:00 AM', calls: 98, percentage: 42 }
                    ].map(item => (
                      <div key={item.time}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-400">{item.time}</span>
                          <span className="text-sm font-semibold text-white">{item.calls} calls</span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] h-2 rounded-full"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeNavItem === "admin" ? (
          // Admin Panel - Full Screen Simple Layout
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0f0f0f] p-8">
            <div className="max-w-7xl mx-auto">
              {/* Admin Header */}
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea7b1a] flex items-center justify-center text-white text-3xl font-bold shadow-xl">
                  AS
                </div>
                <div className="flex-1">
                  <h1 className="text-4xl font-bold text-white mb-2">Administrator Control Panel</h1>
                  <p className="text-gray-400 text-lg">Manage emergency services and system configuration</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm font-semibold text-green-400">System Online</span>
                  </div>
                </div>
              </div>

              {/* Main Content - Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Emergency Contacts */}
                <div>
                  <div className="bg-gradient-to-br from-[#2a2a2a] to-[#1f1f1f] rounded-2xl p-7 border border-[#333333] shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-[#fb923c]/10 flex items-center justify-center">
                        <Phone className="w-6 h-6 text-[#fb923c]" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">Emergency Contact Numbers</h2>
                        <p className="text-sm text-gray-400">Configure direct dispatch routing</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Hospital/Medical */}
                      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333333] hover:border-blue-400/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Ambulance className="w-6 h-6 text-blue-400" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">Hospital / Medical Emergency</h3>
                            <p className="text-xs text-gray-400">Ambulance services</p>
                          </div>
                        </div>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={emergencyContacts.hospital}
                          onChange={(e) => setEmergencyContacts({...emergencyContacts, hospital: e.target.value})}
                          className="bg-[#0f0f0f] border-[#333333] text-white placeholder:text-gray-500 focus:border-blue-400 h-11"
                        />
                      </div>

                      {/* Police */}
                      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333333] hover:border-green-400/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-green-400" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">Police Emergency</h3>
                            <p className="text-xs text-gray-400">Law enforcement services</p>
                          </div>
                        </div>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={emergencyContacts.police}
                          onChange={(e) => setEmergencyContacts({...emergencyContacts, police: e.target.value})}
                          className="bg-[#0f0f0f] border-[#333333] text-white placeholder:text-gray-500 focus:border-green-400 h-11"
                        />
                      </div>

                      {/* Fire */}
                      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333333] hover:border-red-400/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <Flame className="w-6 h-6 text-red-400" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">Fire Emergency</h3>
                            <p className="text-xs text-gray-400">Fire department services</p>
                          </div>
                        </div>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={emergencyContacts.fire}
                          onChange={(e) => setEmergencyContacts({...emergencyContacts, fire: e.target.value})}
                          className="bg-[#0f0f0f] border-[#333333] text-white placeholder:text-gray-500 focus:border-red-400 h-11"
                        />
                      </div>
                    </div>

                    <Button className="w-full mt-6 bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] hover:from-[#ea7b1a] hover:to-[#fb923c] text-white font-bold h-12">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Save Emergency Contacts
                    </Button>
                  </div>
                </div>

                {/* Right Column - System Status */}
                <div>
                  <div className="bg-gradient-to-br from-[#2a2a2a] to-[#1f1f1f] rounded-2xl p-7 border border-[#333333] shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                        <Radio className="w-6 h-6 text-green-400" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">System Health</h2>
                        <p className="text-sm text-gray-400">Service monitoring</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-sm font-medium text-white">API Server</span>
                        </div>
                        <span className="text-xs font-bold text-green-400">Online</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-sm font-medium text-white">Database</span>
                        </div>
                        <span className="text-xs font-bold text-green-400">Connected</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-sm font-medium text-white">WebSocket</span>
                        </div>
                        <span className="text-xs font-bold text-green-400">Active</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-sm font-medium text-white">AI Services</span>
                        </div>
                        <span className="text-xs font-bold text-green-400">Operational</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <User className="w-5 h-5 text-blue-400" />
                          <span className="text-sm font-medium text-white">Active Dispatchers</span>
                        </div>
                        <span className="text-xs font-bold text-white">28</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                        <div className="flex items-center gap-3">
                          <Info className="w-5 h-5 text-[#fb923c]" />
                          <span className="text-sm font-medium text-white">System Uptime</span>
                        </div>
                        <span className="text-xs font-bold text-green-400">99.97%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeNavItem === "dispatch" ? (
          // Dispatch Emergency Routing Map - Full Screen
          Object.keys(locationData).length > 0 ? (
            <DispatchMap
              ref={dispatchMapRef}
              callerLatitude={Object.values(locationData)[0].latitude}
              callerLongitude={Object.values(locationData)[0].longitude}
              callerAddress={Object.values(locationData)[0].address}
              selectedType={dispatchEmergencyType}
              onStationsFound={(stations) => setDispatchStations(stations)}
            />
          ) : (
            // Show message when no location data
            <div className="flex-1 flex items-center justify-center bg-[#1a1a1a]">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-white mb-2">No Caller Location Available</h3>
                <p className="text-sm text-gray-400 max-w-md">
                  Send a location tracking link from the Messages tab to receive the caller's GPS coordinates,<br />
                  then return here to dispatch emergency services.
                </p>
              </div>
            </div>
          )
        ) : activeNavItem === "calls" && conversation.length === 0 && !selectedCallerNumber ? (
          // Full-width map view when no active calls
          <div className="flex-1 flex flex-col bg-[#1a1a1a] min-w-0">
            <div className="flex-1 p-4">
              <div className="w-full h-full bg-[#2a2a2a] rounded-lg overflow-hidden border border-[#333333]">
                <MapView
                  latitude={mapLocation.latitude}
                  longitude={mapLocation.longitude}
                  zoom={11}
                  isFullScreen={true}
                  onLocationUpdate={(lat, lng) => {
                    setMapLocation(prev => ({
                      ...prev,
                      latitude: lat,
                      longitude: lng
                    }));
                  }}
                  onServicesUpdate={(services) => {
                    const servicesMap: any = {};
                    services.forEach(service => {
                      servicesMap[service.type] = {
                        name: service.name,
                        distance: service.distance
                      };
                    });
                    setNearestServices(servicesMap);
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          // Normal conversation view
          <div className="flex-1 flex flex-col bg-[#1a1a1a] min-w-0">
          <div className="border-b border-[#333333] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">
                  {activeNavItem === "training"
                    ? (trainingLogs[selectedIncident] ? `Training #${selectedIncident + 1}` : "Training Session")
                    : calls[selectedIncident].phone
                  }
                </h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[#b5b5b5]">
                    {activeNavItem === "training"
                      ? (activeTrainingSession ? "Active Training Session" : "Training Session")
                      : (isLiveCall ? "Live Call" : "Incoming Call")
                    }
                  </p>
                  {activeNavItem === "training" && activeTrainingSession && (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                        ✓ Training Active
                      </span>
                      {isTrainingSpeechActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          Listening
                        </span>
                      )}
                    </>
                  )}
                  {activeNavItem !== "training" && selectedCallerNumber && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${transcriptionConnected
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                      {transcriptionConnected ? '✓ Connected' : '⟳ Connecting...'}
                    </span>
                  )}
                </div>
              </div>
              {activeNavItem === "training" ? (
                // Training action buttons
                <div className="flex items-center gap-2">
                  {activeTrainingSession && (
                    <>
                      <Button
                        onClick={isTrainingSpeechActive ? stopSpeechRecognition : startSpeechRecognition}
                        variant={isTrainingSpeechActive ? "default" : "outline"}
                        className={`text-sm px-3 py-2 h-9 flex items-center gap-2 ${isTrainingSpeechActive
                            ? "bg-green-600 hover:bg-green-700 border-green-600 text-white"
                            : "bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-white"
                          }`}
                      >
                        {isTrainingSpeechActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {isTrainingSpeechActive ? "Stop Voice" : "Voice Mode"}
                      </Button>
                      <Button
                        onClick={handleEndTraining}
                        variant="outline"
                        className="bg-red-600 hover:bg-red-700 border-red-600 text-white text-sm px-3 py-2 h-9"
                      >
                        End Training
                      </Button>
                    </>
                  )}
                  {trainingConfidence && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#262626] rounded-lg border border-[#333333]">
                        <GraduationCap className="w-4 h-4 text-[#fb923c]" />
                        <div className="text-sm">
                          <span className="text-[#b5b5b5]">Assessment: </span>
                          <span className={`font-semibold ${trainingConfidence >= 85 ? 'text-emerald-400' :
                              trainingConfidence >= 70 ? 'text-green-400' :
                                trainingConfidence >= 60 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {trainingConfidence}% {
                              trainingConfidence >= 85 ? '• Excellent' :
                                trainingConfidence >= 70 ? '• Good' :
                                  trainingConfidence >= 60 ? '• Satisfactory' : '• Needs Improvement'
                            }
                          </span>
                        </div>
                      </div>
                      {trainingEvaluation && (
                        <Button
                          onClick={() => {
                            // Find the current training log to show its evaluation
                            const currentLog = trainingLogs[selectedIncident];
                            if (currentLog && currentLog.confidence_score && currentLog.evaluation) {
                              setTrainingConfidence(currentLog.confidence_score);
                              setTrainingEvaluation(currentLog.evaluation);
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="bg-[#fb923c] hover:bg-[#ea7b1a] border-[#fb923c] text-white text-xs px-3 py-1 h-8"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          View Results
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // Regular call action buttons
                !isLiveCall && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select defaultValue="noise">
                      <SelectTrigger className="w-[160px] bg-[#2d2d2d] border-[#333333] text-sm text-white hover:bg-[#333333] focus:ring-1 focus:ring-[#3b82f6] h-9 rounded-md hover-orange">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2d2d2d] border-[#333333] text-white">
                        <SelectItem value="noise" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Noise Complaint</SelectItem>
                        <SelectItem value="fire" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Fire Emergency</SelectItem>
                        <SelectItem value="medical" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Medical</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleShare}
                      variant="outline"
                      className="bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-sm px-3 py-2 h-9 hover-orange"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      <span>Share</span>
                    </Button>
                    <Button
                      onClick={handleManage}
                      variant="outline"
                      className="bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-sm px-3 py-2 h-9 hover-orange"
                    >
                      <span>Manage</span>
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap mt-2">
              {/* Device Info Section */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#3a3a3a] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 18h3v2H2v-2zm0-4h3v6H2v-6zm4 0h3v6H6v-6zm4-4h3v10h-3V10zm4-4h3v14h-3V6zm4-4h3v18h-3V2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] text-[#888888] uppercase tracking-wider font-medium">DEVICE INFO</div>
                  <div className="text-xs text-[#b5b5b5]">Android Device</div>
                </div>
              </div>

              {/* Emergency Data Section */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                    <circle cx="9" cy="10" r="2" />
                    <path d="M15 11h4v1h-4z" />
                    <path d="M15 13h4v1h-4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] text-[#888888] uppercase tracking-wider font-medium">EMERGENCY DATA</div>
                  <div className="text-xs text-[#b5b5b5]">View</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={detectedLanguage.toLowerCase()}
                  onValueChange={(val) => {
                    const langMap: Record<string, string> = {
                      // Major world languages
                      spanish: "Spanish",
                      english: "English",
                      french: "French",
                      german: "German",
                      italian: "Italian",
                      portuguese: "Portuguese",
                      russian: "Russian",
                      japanese: "Japanese",
                      korean: "Korean",
                      chinese: "Chinese",
                      arabic: "Arabic",
                      // 22 Official Languages of India
                      hindi: "Hindi",
                      bengali: "Bengali",
                      telugu: "Telugu",
                      marathi: "Marathi",
                      tamil: "Tamil",
                      urdu: "Urdu",
                      gujarati: "Gujarati",
                      kannada: "Kannada",
                      odia: "Odia",
                      malayalam: "Malayalam",
                      punjabi: "Punjabi",
                      assamese: "Assamese",
                      maithili: "Maithili",
                      santali: "Santali",
                      kashmiri: "Kashmiri",
                      nepali: "Nepali",
                      sindhi: "Sindhi",
                      konkani: "Konkani",
                      dogri: "Dogri",
                      manipuri: "Manipuri",
                      bodo: "Bodo",
                      sanskrit: "Sanskrit",
                      mandarin: "Chinese"
                    };
                    setDetectedLanguage(langMap[val] || "English");
                  }}
                >
                  <SelectTrigger className="w-[140px] bg-[#2d2d2d] border-[#333333] text-sm text-white hover:bg-[#333333] focus:ring-1 focus:ring-[#3b82f6] h-9 rounded-md hover-orange">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2d2d2d] border-[#333333] text-white max-h-[400px] overflow-y-auto">
                    {/* Common Languages */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-[#888888] uppercase tracking-wider">Common</div>
                    <SelectItem value="english" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">English</SelectItem>
                    <SelectItem value="spanish" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Spanish</SelectItem>
                    <SelectItem value="french" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">French</SelectItem>
                    <SelectItem value="chinese" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Chinese</SelectItem>
                    <SelectItem value="arabic" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Arabic</SelectItem>

                    {/* Indian Languages - 22 Official */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-[#fb923c] uppercase tracking-wider mt-2">🇮🇳 Indian Languages</div>
                    <SelectItem value="hindi" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Hindi (हिन्दी)</SelectItem>
                    <SelectItem value="bengali" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Bengali (বাংলা)</SelectItem>
                    <SelectItem value="telugu" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Telugu (తెలుగు)</SelectItem>
                    <SelectItem value="marathi" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Marathi (मराठी)</SelectItem>
                    <SelectItem value="tamil" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Tamil (தமிழ்)</SelectItem>
                    <SelectItem value="urdu" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Urdu (اردو)</SelectItem>
                    <SelectItem value="gujarati" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Gujarati (ગુજરાતી)</SelectItem>
                    <SelectItem value="kannada" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Kannada (ಕನ್ನಡ)</SelectItem>
                    <SelectItem value="odia" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Odia (ଓଡ଼ିଆ)</SelectItem>
                    <SelectItem value="malayalam" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Malayalam (മലയാളം)</SelectItem>
                    <SelectItem value="punjabi" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Punjabi (ਪੰਜਾਬੀ)</SelectItem>
                    <SelectItem value="assamese" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Assamese (অসমীয়া)</SelectItem>
                    <SelectItem value="maithili" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Maithili (मैथिली)</SelectItem>
                    <SelectItem value="santali" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Santali (ᱥᱟᱱᱛᱟᱲᱤ)</SelectItem>
                    <SelectItem value="kashmiri" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Kashmiri (कॉशुर)</SelectItem>
                    <SelectItem value="nepali" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Nepali (नेपाली)</SelectItem>
                    <SelectItem value="sindhi" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Sindhi (سنڌي)</SelectItem>
                    <SelectItem value="konkani" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Konkani (कोंकणी)</SelectItem>
                    <SelectItem value="dogri" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Dogri (डोगरी)</SelectItem>
                    <SelectItem value="manipuri" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Manipuri (মৈতৈলোন্)</SelectItem>
                    <SelectItem value="bodo" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Bodo (बड़ो)</SelectItem>
                    <SelectItem value="sanskrit" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Sanskrit (संस्कृतम्)</SelectItem>

                    {/* Other Languages */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-[#888888] uppercase tracking-wider mt-2">Other</div>
                    <SelectItem value="german" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">German</SelectItem>
                    <SelectItem value="italian" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Italian</SelectItem>
                    <SelectItem value="portuguese" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Portuguese</SelectItem>
                    <SelectItem value="russian" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Russian</SelectItem>
                    <SelectItem value="japanese" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Japanese</SelectItem>
                    <SelectItem value="korean" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Korean</SelectItem>
                  </SelectContent>
                </Select>
                {isTranslating && (
                  <div className="flex items-center gap-1 text-xs text-blue-400">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                    <span>Translating...</span>
                  </div>
                )}
              </div>
              {!isLiveCall && (
                <Select defaultValue="media">
                  <SelectTrigger className="w-[120px] bg-[#2d2d2d] border-[#333333] text-sm text-white hover:bg-[#333333] focus:ring-1 focus:ring-[#3b82f6] h-9 rounded-md hover-orange">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2d2d2d] border-[#333333] text-white">
                    <SelectItem value="media" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Media</SelectItem>
                    <SelectItem value="audio" className="text-white hover:bg-[#333333] focus:bg-[#333333] hover-orange cursor-pointer data-[state=checked]:text-[#fb923c] data-[state=checked]:bg-[#fb923c]/10">Audio Only</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Live Audio Stream Visualization - Only show for live calls */}
            {isLiveCall && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#fb923c] rounded-full animate-pulse"></div>
                  <span className="text-xs text-[#fb923c] font-semibold">LIVE</span>
                </div>
                <div className="flex-1 relative h-8 flex items-center">
                  <div
                    className="w-full h-[2px] bg-[#fb923c] rounded-full transition-all duration-1000 ease-in-out"
                    style={{
                      boxShadow: `0 0 ${8 + Math.sin(audioLevel * 0.05) * 6}px #fb923c, 0 0 ${16 + Math.sin(audioLevel * 0.05) * 10}px #fb923c`,
                      opacity: 0.5 + Math.sin(audioLevel * 0.05) * 0.3
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {/* Show conversation messages */}
            {(activeNavItem === "training" ? trainingConversation : conversation).map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'Caller' ? 'justify-start' : 'justify-end'}`}>
                <div className="max-w-[70%] space-y-1">
                  <div className={`flex items-center gap-2 text-xs text-[#8a8a8a] ${msg.sender === 'Caller' ? 'justify-start' : 'justify-end'}`}>
                    <span className={msg.sender === 'Caller' ? 'font-medium' : ''}>{msg.sender}</span>
                    <span>|</span>
                    <span>{msg.time}</span>
                  </div>
                  <div className={`flex items-start gap-2 ${msg.sender === 'Caller' ? 'flex-row' : 'flex-row-reverse'}`}>
                    {msg.sender === 'Caller' && (
                      <div className="flex items-center gap-0.5 mt-1">
                        <Volume2 className="w-4 h-4 text-[#8a8a8a]" />
                      </div>
                    )}
                    <div className={`rounded-lg px-4 py-2.5 bg-[#262626] ${!msg.is_final ? 'opacity-60' : ''}`}>
                      {msg.isTranslated && msg.originalMessage ? (
                        <div className="space-y-2">
                          {/* Original Message */}
                          <div className="pb-2 border-b border-[#3a3a3a]">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px] text-[#888888] uppercase tracking-wider font-medium">Original</span>
                            </div>
                            <p className={`text-sm leading-relaxed ${msg.sender === 'Caller' ? 'text-[#b5b5b5]' : 'text-[#888888]'}`} style={{ lineHeight: '1.5' }}>
                              {msg.originalMessage}
                            </p>
                          </div>
                          {/* Translated Message */}
                          <div className="relative">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[10px] text-[#fb923c] uppercase tracking-wider font-medium">Translated</span>
                              <svg className="w-3.5 h-3.5 text-[#fb923c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                              </svg>
                            </div>
                            <p className={`text-sm leading-relaxed ${msg.sender === 'Caller' ? 'text-white font-medium' : 'text-[#b5b5b5]'}`} style={{ lineHeight: '1.5' }}>
                              {msg.message}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-sm leading-relaxed ${msg.sender === 'Caller' ? 'text-white font-medium' : 'text-[#b5b5b5]'}`} style={{ lineHeight: '1.5' }}>
                          {msg.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={conversationEndRef} />

            {/* Debug Info - Only show for live calls, not in training mode */}
            {conversation.length === 0 && selectedCallerNumber && activeNavItem !== "training" && !activeTrainingSession && (
              <div className="text-center p-8">
                <div className="bg-[#262626] rounded-lg p-4 text-left text-xs space-y-2">
                  <p className="text-[#fb923c] font-semibold">🔍 Debug Info:</p>
                  <p className="text-[#b5b5b5]">Selected Number: <span className="text-white">{selectedCallerNumber}</span></p>
                  <p className="text-[#b5b5b5]">Call SID: <span className="text-white">{selectedCallSid || 'None'}</span></p>
                  <p className="text-[#b5b5b5]">WebSocket Status: <span className={transcriptionConnected ? 'text-green-400' : 'text-yellow-400'}>{transcriptionConnected ? 'Connected ✓' : 'Connecting...'}</span></p>
                  <p className="text-[#b5b5b5]">Notifications WS: <span className={notificationsConnected ? 'text-green-400' : 'text-red-400'}>{notificationsConnected ? 'Connected ✓' : 'Disconnected ✗'}</span></p>
                  <p className="text-[#9e9e9e] mt-2">Waiting for transcriptions...</p>
                  <p className="text-[#9e9e9e] text-xs">Check browser console (F12) for detailed logs</p>
                </div>
              </div>
            )}
          </div>

          {/* Microphone and Message Controls */}
          {isLiveCall && selectedCallSid && (
            <div className="border-t border-[#333333] p-3 bg-[#1f1f1f]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={toggleMicrophone}
                    variant={isMicActive ? "default" : "outline"}
                    size="sm"
                    className={isMicActive ? "bg-red-600 hover:bg-red-700 border-red-600" : "bg-transparent border-[#333333] hover:bg-[#2a2a2a]"}
                  >
                    {isMicActive ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                    {isMicActive ? "Stop" : "Speak"}
                  </Button>
                  {isMicActive && (
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-[#fb923c]" />
                      <div className="w-24 h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#fb923c] transition-all duration-100"
                          style={{ width: `${audioLevel}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Message Field (Ctrl+Shift to activate) */}
          {isMessageFieldVisible && (
            <div className="border-t border-[#333333] p-3 bg-[#1f1f1f]">
              <div className="flex items-center gap-2">
                <Input
                  ref={messageInputRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message... (Press Enter to send, Esc to close)"
                  className="flex-1 h-8 text-sm bg-[#2a2a2a] border-[#333333] text-white placeholder:text-[#b5b5b5] focus:border-[#fb923c] focus:ring-2 focus:ring-[#fb923c]/50 transition-all"
                  style={{
                    boxShadow: messageText ? '0 0 8px rgba(251, 146, 60, 0.3)' : 'none'
                  }}
                />
                {/* Speech button only for training */}
                {activeNavItem === "training" && (
                  <Button
                    onClick={isTrainingSpeechActive ? stopSpeechRecognition : startSpeechRecognition}
                    variant={isTrainingSpeechActive ? "default" : "outline"}
                    className={`h-8 px-3 ${isTrainingSpeechActive ?
                      "bg-red-600 hover:bg-red-700 border-red-600" :
                      "bg-transparent border-[#333333] hover:bg-[#2a2a2a]"
                      }`}
                  >
                    {isTrainingSpeechActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  onClick={handleSendMessage}
                  className="h-8 px-3 bg-[#fb923c] hover:bg-[#fb923c]/80 text-white"
                  disabled={!messageText.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-[#8a8a8a] mt-2">
                {activeNavItem === "training"
                  ? "Press Ctrl+Shift to toggle message field | Click mic to speak or type to respond"
                  : "Press Ctrl+Shift to toggle message field"
                }
              </p>
            </div>
          )}

          {!isMessageFieldVisible && !isLiveCall && (
            <div className="border-t border-[#333333] p-2 bg-[#1f1f1f] text-center">
              <p className="text-xs text-[#8a8a8a]">Press <span className="text-[#fb923c] font-medium">Ctrl+Shift</span> to send a message</p>
            </div>
          )}
        </div >
        )}

        {/* Right Resize Handle - Hidden when showing full map */}
        {!(activeNavItem === "calls" && conversation.length === 0 && !selectedCallerNumber) && (
          <div
            className="w-1 bg-white/5 cursor-col-resize flex items-center justify-center group relative resize-handle"
            onMouseDown={() => setIsResizingRight(true)}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <GripVertical className="w-3 h-3 text-gray-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
        )}

        {/* Right Panel - Insights OR Dispatch Controls - Show for calls and training, hide for admin and analytics */}
        {!(activeNavItem === "dispatch" || activeNavItem === "admin" || activeNavItem === "analytics") && (
          <div id="right-panel" style={{ width: `${rightWidth}px` }} className="border-l border-[#333333] bg-[#1f1f1f] flex flex-col flex-shrink-0">
          <div className="border-b border-[#333333]">
            <nav className="flex items-center px-2 overflow-x-auto justify-between">
              <div className="flex items-center">
                  {activeNavItem === "calls" && (
                    <button
                      onClick={() => handleTabClick("messages")}
                      className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "messages" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        <span>Messages</span>
                        {activeMessages.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 bg-[#fb923c] text-white text-xs rounded-full">
                            {activeMessages.length}
                          </span>
                        )}
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => handleTabClick("insights")}
                    className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "insights" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Insights</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleTabClick("protocol")}
                    className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "protocol" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                      }`}
                  >
                    Protocol
                  </button>
                  <button
                    onClick={() => handleTabClick("location")}
                    className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "location" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                      }`}
                  >
                    Location
                  </button>
                  <button
                    onClick={() => handleTabClick("media")}
                    className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "media" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                      }`}
                  >
                    Media
                  </button>
                {activeNavItem === "training" && (
                  <button
                    onClick={() => handleTabClick("results")}
                    className={`px-3 py-3 whitespace-nowrap text-sm hover-orange ${activeTab === "results" ? "text-white border-b-2 border-white font-medium" : "text-[#b5b5b5]"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      <span>Results</span>
                    </div>
                  </button>
                )}
                </div>
                <button
                  onClick={() => setIsSplitView(!isSplitView)}
                  className="px-3 py-2 text-sm text-[#b5b5b5] hover:text-white transition-colors"
                  title={isSplitView ? "Exit split view" : "Split view"}
                >
                  <GripVertical className={`w-4 h-4 ${isSplitView ? 'rotate-90' : ''}`} />
                </button>
            </nav>
          </div>

          {!isSplitView ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {activeTab === "messages" && (
                <div className="space-y-3">
                  {activeMessages.length === 0 ? (
                    <div className="bg-[#2a2a2a] rounded-lg p-8 text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-500" />
                      <h4 className="text-base font-semibold text-white mb-2">No Active Messages</h4>
                      <p className="text-sm text-gray-400">
                        Messages will appear here when callers need location tracking links.
                      </p>
                    </div>
                  ) : (
                    activeMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`bg-[#2a2a2a] rounded-lg p-4 border transition-colors ${
                          selectedMessage === msg.number
                            ? "border-[#fb923c]"
                            : "border-[#333333] hover:border-[#444444]"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                              <Phone className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{msg.number}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(msg.timestamp).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          {linkSent[msg.number] ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#fb923c]/20 text-[#fb923c] rounded text-xs">
                              <CheckCircle className="w-3 h-3" />
                              <span>Link Sent</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">
                              <MapPin className="w-3 h-3" />
                              <span>Pending</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {locationData[msg.number] ? (
                            // Show location details when received
                            <div className="bg-[#1e1e1e] border border-[#333333] rounded-lg p-3 space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center flex-shrink-0">
                                  <MapPin className="w-4 h-4 text-[#fb923c]" />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <div>
                                    <p className="text-xs text-[#9e9e9e] mb-1">Location Details</p>
                                    <p className="text-sm text-white font-medium leading-snug">
                                      {locationData[msg.number].address}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <p className="text-[#6b6b6b] mb-0.5">Latitude</p>
                                      <p className="text-[#b5b5b5] font-mono">{locationData[msg.number].latitude.toFixed(6)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[#6b6b6b] mb-0.5">Longitude</p>
                                      <p className="text-[#b5b5b5] font-mono">{locationData[msg.number].longitude.toFixed(6)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
                                    <span>Received:</span>
                                    <span className="text-[#9e9e9e]">
                                      {new Date(locationData[msg.number].timestamp).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const loc = locationData[msg.number];
                                  setMapLocation({
                                    latitude: loc.latitude,
                                    longitude: loc.longitude,
                                    address: loc.address || 'Unknown',
                                    district: 'Caller Location'
                                  });
                                  toast({
                                    title: "Map Updated",
                                    description: "Centered on caller's location"
                                  });
                                }}
                                className="w-full px-3 py-2 bg-[#fb923c] hover:bg-[#ea7b1a] text-white text-xs rounded transition-colors flex items-center justify-center gap-2 font-medium"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                View on Map
                              </button>
                            </div>
                          ) : (
                            // Show send link UI when no location
                            <>
                              <p className="text-xs text-gray-400">
                                {linkSent[msg.number] 
                                  ? "Location tracking link has been sent to this caller. Awaiting their location data."
                                  : "Caller needs location tracking. Send an SMS with a tracking link to receive their real-time location."}
                              </p>
                              
                              {!linkSent[msg.number] && (
                                <button
                                  onClick={() => handleSendTrackingLink(msg.number)}
                                  className="w-full px-4 py-2 bg-[#fb923c] hover:bg-[#ea7b1a] text-white text-sm rounded transition-colors flex items-center justify-center gap-2"
                                >
                                  <Send className="w-4 h-4" />
                                  Send Location Tracking Link
                                </button>
                              )}

                              {linkSent[msg.number] && (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <Info className="w-3 h-3" />
                                  <span>Location data will appear here when received</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              
              {activeTab === "insights" && (
                <>
                  {activeNavItem === "training" ? (
                    // Training insights - use trainingInsights state
                    <>
                      {trainingInsights.summary ? (
                        <>
                          {trainingInsights.summary && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-blue-400" />
                                <h4 className="font-semibold text-sm">Summary</h4>
                              </div>
                              <p className="text-sm text-gray-300 leading-relaxed">{trainingInsights.summary}</p>
                            </div>
                          )}

                          {trainingInsights.location && trainingInsights.location.length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-green-400" />
                                <h4 className="font-semibold text-sm">Location</h4>
                              </div>
                              <ul className="space-y-1">
                                {trainingInsights.location.map((loc, idx) => (
                                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-green-400 mt-1">•</span>
                                    <span>{loc}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {trainingInsights.incident && Object.keys(trainingInsights.incident).length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <h4 className="font-semibold text-sm">Incident Details</h4>
                              </div>
                              <div className="space-y-2">
                                {trainingInsights.incident.incident_type && (
                                  <div>
                                    <span className="text-xs text-gray-400">Type: </span>
                                    <span className="text-sm text-white capitalize">{trainingInsights.incident.incident_type}</span>
                                  </div>
                                )}
                                {trainingInsights.incident.severity && (
                                  <div>
                                    <span className="text-xs text-gray-400">Severity: </span>
                                    <span className={`text-sm font-medium ${
                                      trainingInsights.incident.severity === 'critical' ? 'text-red-400' :
                                      trainingInsights.incident.severity === 'high' ? 'text-orange-400' :
                                      trainingInsights.incident.severity === 'medium' ? 'text-yellow-400' : 'text-green-400'
                                    }`}>{trainingInsights.incident.severity}</span>
                                  </div>
                                )}
                                {trainingInsights.incident.description && (
                                  <div>
                                    <span className="text-xs text-gray-400">Description: </span>
                                    <span className="text-sm text-gray-300">{trainingInsights.incident.description}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {trainingInsights.additional_info && trainingInsights.additional_info.length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4 text-purple-400" />
                                <h4 className="font-semibold text-sm">Additional Information</h4>
                              </div>
                              <ul className="space-y-1">
                                {trainingInsights.additional_info.map((info, idx) => (
                                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-purple-400 mt-1">•</span>
                                    <span>{info}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="bg-[#2a2a2a] rounded-lg p-6 text-center">
                          <Sparkles className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Start a training session to see insights</p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Live call insights - use insights state
                    <>
                      {renderInsightsContent()}

                      {/* Analyze Button - Only show if we have data */}
                      {insights.summary && (
                        <Button
                          onClick={handleAnalyze}
                          variant="outline"
                          className="w-full bg-transparent border-2 border-white/20 hover:bg-white/5 text-white font-semibold text-sm rounded-lg h-10 hover-orange-border"
                        >
                          Analyze
                        </Button>
                      )}
                    </>
                  )}
                    </>
                  )}

                  {activeTab === "protocol" && (
                    <div className="space-y-3">
                      {renderProtocolContent()}
                    </div>
                  )}

                  {activeTab === "location" && (
                <div className="space-y-3">
                  {/* Map View */}
                  <div className="bg-[#2a2a2a] rounded-lg overflow-hidden border border-[#333333]" style={{ height: '350px' }}>
                    <MapView
                      latitude={mapLocation.latitude}
                      longitude={mapLocation.longitude}
                      zoom={13}
                      onLocationUpdate={(lat, lng) => {
                        setMapLocation(prev => ({
                          ...prev,
                          latitude: lat,
                          longitude: lng
                        }));
                      }}
                      onServicesUpdate={(services) => {
                        const servicesMap: any = {};
                        services.forEach(service => {
                          servicesMap[service.type] = {
                            name: service.name,
                            distance: service.distance
                          };
                        });
                        setNearestServices(servicesMap);
                      }}
                    />
                  </div>

                  {/* Location Insights Section */}
                  <div className="bg-[#2a2a2a] rounded-lg p-3 border border-[#333333]">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-green-400" />
                      <h4 className="font-semibold text-sm">Location Insights</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Address</p>
                        <p className="text-xs text-white">{mapLocation.address}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Coordinates</p>
                        <p className="text-xs text-gray-300">
                          {mapLocation.latitude.toFixed(4)}° N, {Math.abs(mapLocation.longitude).toFixed(4)}° {mapLocation.longitude < 0 ? 'W' : 'E'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">District</p>
                        <p className="text-xs text-gray-300">{mapLocation.district}</p>
                      </div>
                      
                      {/* Surrounding Area Details */}
                      <div className="pt-2 border-t border-[#333333]">
                        <p className="text-xs text-gray-400 mb-2">Surrounding Area</p>
                        <div className="space-y-1.5">
                          {nearestServices.hospital && (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                                <p className="text-xs text-gray-300">{nearestServices.hospital.name}</p>
                              </div>
                              <span className="text-xs text-blue-400 font-medium">{nearestServices.hospital.distance.toFixed(2)} mi</span>
                            </div>
                          )}
                          {nearestServices.fire && (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                                <p className="text-xs text-gray-300">{nearestServices.fire.name}</p>
                              </div>
                              <span className="text-xs text-red-400 font-medium">{nearestServices.fire.distance.toFixed(2)} mi</span>
                            </div>
                          )}
                          {nearestServices.police && (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                <p className="text-xs text-gray-300">{nearestServices.police.name}</p>
                              </div>
                              <span className="text-xs text-green-400 font-medium">{nearestServices.police.distance.toFixed(2)} mi</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Situational Data */}
                      <div className="pt-2 border-t border-[#333333]">
                        <p className="text-xs text-gray-400 mb-2">Situational Data</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-300">Traffic Conditions</span>
                            <span className="text-xs text-green-400">Light</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-300">Weather</span>
                            <span className="text-xs text-blue-400">Clear, 72°F</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-300">Response Time Est.</span>
                            <span className="text-xs text-orange-400">4-6 minutes</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                  )}

                  {activeTab === "media" && (
                    <div className="space-y-3">
                  <div className="bg-[#2a2a2a] rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-2">
                      <Play className="w-4 h-4 text-purple-400" />
                      <h4 className="font-semibold text-xs">Media Files</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-1.5 bg-[#1a1a1a] rounded">
                        <Volume2 className="w-3 h-3 text-blue-400" />
                        <div className="flex-1">
                          <p className="text-xs text-white">Call Recording</p>
                          <p className="text-xs text-gray-400">Duration: 4:32</p>
                        </div>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 px-2 py-1">
                          <Play className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 p-1.5 bg-[#1a1a1a] rounded">
                        <FileText className="w-3 h-3 text-green-400" />
                        <div className="flex-1">
                          <p className="text-xs text-white">Transcript</p>
                          <p className="text-xs text-gray-400">Auto-generated</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-white/20 px-2 py-1 text-xs">
                          View
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400">
                        All media files are automatically processed and stored securely.
                      </p>
                      </div>
                    </div>
                  </div>
                  )}

                  {activeTab === "results" && activeNavItem === "training" && (
                    <div className="space-y-3">
                  {trainingConfidence !== null || trainingEvaluation ? (
                    <>
                      {/* Confidence Score Card */}
                      {trainingConfidence !== null && (
                        <div className="bg-gradient-to-br from-[#2a2a2a] to-[#1f1f1f] rounded-lg p-4 border border-[#333333]">
                          <div className="flex items-center gap-2 mb-3">
                            <GraduationCap className="w-5 h-5 text-[#fb923c]" />
                            <h4 className="font-semibold text-base">Performance Score</h4>
                          </div>
                          <div className="flex items-center justify-center py-6">
                            <div className="relative">
                              <div className="text-6xl font-bold bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] bg-clip-text text-transparent">
                                {trainingConfidence}%
                              </div>
                              <div className={`text-center mt-2 text-sm font-medium ${
                                trainingConfidence >= 85 ? 'text-emerald-400' :
                                trainingConfidence >= 70 ? 'text-green-400' :
                                trainingConfidence >= 60 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {trainingConfidence >= 85 ? '🌟 Excellent Performance' :
                                 trainingConfidence >= 70 ? '✅ Good Performance' :
                                 trainingConfidence >= 60 ? '⚠️ Satisfactory' : '❌ Needs Improvement'}
                              </div>
                            </div>
                          </div>
                          {/* Progress Bar */}
                          <div className="w-full bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                trainingConfidence >= 85 ? 'bg-gradient-to-r from-emerald-500 to-green-500' :
                                trainingConfidence >= 70 ? 'bg-gradient-to-r from-green-500 to-lime-500' :
                                trainingConfidence >= 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 
                                'bg-gradient-to-r from-red-500 to-orange-500'
                              }`}
                              style={{ width: `${trainingConfidence}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Detailed Evaluation */}
                      {trainingEvaluation && (
                        <div className="bg-[#2a2a2a] rounded-lg p-4 border border-[#333333]">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-5 h-5 text-blue-400" />
                            <h4 className="font-semibold text-base">Detailed Evaluation</h4>
                          </div>
                          <div className="prose prose-invert prose-sm max-w-none text-sm text-gray-300 leading-relaxed">
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold text-white mt-4 mb-2" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-semibold text-white mt-3 mb-2" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-semibold text-white mt-2 mb-1" {...props} />,
                                p: ({node, ...props}) => <p className="mb-3 text-gray-300" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-300" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-300" {...props} />,
                                li: ({node, ...props}) => <li className="text-gray-300" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                                em: ({node, ...props}) => <em className="italic text-gray-200" {...props} />,
                                code: ({node, ...props}) => <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-[#fb923c] text-xs" {...props} />,
                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-[#fb923c] pl-4 italic text-gray-400 my-3" {...props} />,
                                a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline" {...props} />,
                              }}
                            >
                              {trainingEvaluation}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Key Metrics */}
                      {trainingConfidence !== null && (
                        <div className="bg-[#2a2a2a] rounded-lg p-4 border border-[#333333]">
                          <div className="flex items-center gap-2 mb-3">
                            <BarChart3 className="w-5 h-5 text-purple-400" />
                            <h4 className="font-semibold text-base">Key Metrics</h4>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">Information Gathering</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-[#1a1a1a] rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(trainingConfidence + 5, 100)}%` }} />
                                </div>
                                <span className="text-xs text-white w-10 text-right">{Math.min(trainingConfidence + 5, 100)}%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">Communication Clarity</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-[#1a1a1a] rounded-full h-2">
                                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${trainingConfidence}%` }} />
                                </div>
                                <span className="text-xs text-white w-10 text-right">{trainingConfidence}%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">Calmness & Composure</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-[#1a1a1a] rounded-full h-2">
                                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.max(trainingConfidence - 5, 0)}%` }} />
                                </div>
                                <span className="text-xs text-white w-10 text-right">{Math.max(trainingConfidence - 5, 0)}%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">Protocol Adherence</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-[#1a1a1a] rounded-full h-2">
                                  <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${trainingConfidence}%` }} />
                                </div>
                                <span className="text-xs text-white w-10 text-right">{trainingConfidence}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            // Copy evaluation to clipboard
                            if (trainingEvaluation) {
                              navigator.clipboard.writeText(trainingEvaluation);
                              toast({
                                title: "Copied to Clipboard",
                                description: "Evaluation copied successfully",
                              });
                            }
                          }}
                          variant="outline"
                          className="flex-1 bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-sm"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Results
                        </Button>
                        <Button
                          onClick={() => {
                            // Export as PDF or download
                            toast({
                              title: "Export Feature",
                              description: "Export functionality coming soon",
                            });
                          }}
                          variant="outline"
                          className="flex-1 bg-transparent border-[#333333] hover:bg-[#2a2a2a] text-sm"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Export PDF
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="bg-[#2a2a2a] rounded-lg p-8 text-center border border-[#333333]">
                      <GraduationCap className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                      <h4 className="text-base font-semibold text-white mb-2">No Results Yet</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Complete a training session to see your performance evaluation and detailed results.
                      </p>
                      {activeTrainingSession && (
                        <Button
                          onClick={handleEndTraining}
                          className="bg-[#fb923c] hover:bg-[#ea7b1a] text-white"
                        >
                          End Session & Get Results
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Top Panel */}
              <div style={{ height: `${splitHeight}%` }} className="flex flex-col border-b border-[#333333] min-h-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#333333] bg-[#1a1a1a] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-4 h-4 ${topPanelTab === 'insights' ? 'text-blue-400' : 'text-purple-400'}`} />
                    <h4 className="font-semibold text-sm">{topPanelTab === 'insights' ? 'Insights' : 'Protocol'}</h4>
                  </div>
                  <button
                    onClick={swapPanels}
                    className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
                    title="Swap panels"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-400 hover:text-white" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 min-h-0">
                  {topPanelTab === 'insights' ? (
                    activeNavItem === "training" ? (
                      // Training insights in split view
                      trainingInsights.summary ? (
                        <>
                          {trainingInsights.summary && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-blue-400" />
                                <h4 className="font-semibold text-sm">Summary</h4>
                              </div>
                              <p className="text-sm text-gray-300 leading-relaxed">{trainingInsights.summary}</p>
                            </div>
                          )}
                          {trainingInsights.location && trainingInsights.location.length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-green-400" />
                                <h4 className="font-semibold text-sm">Location</h4>
                              </div>
                              <ul className="space-y-1">
                                {trainingInsights.location.map((loc, idx) => (
                                  <li key={idx} className="text-sm text-gray-300">{loc}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center text-gray-400 text-sm">No insights yet</div>
                      )
                    ) : (
                      renderInsightsContent()
                    )
                  ) : (
                    renderProtocolContent()
                  )}
                </div>
              </div>

              {/* Resize Handle */}
              <div
                className="h-2 bg-[#2a2a2a] hover:bg-orange-500 cursor-row-resize transition-colors flex items-center justify-center group relative flex-shrink-0"
                onMouseDown={() => setIsResizingSplit(true)}
              >
                <div className="w-12 h-1 bg-[#555555] group-hover:bg-orange-500 rounded-full transition-colors"></div>
              </div>

              {/* Bottom Panel */}
              <div style={{ height: `${100 - splitHeight}%` }} className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#333333] bg-[#1a1a1a] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-4 h-4 ${bottomPanelTab === 'insights' ? 'text-blue-400' : 'text-purple-400'}`} />
                    <h4 className="font-semibold text-sm">{bottomPanelTab === 'insights' ? 'Insights' : 'Protocol'}</h4>
                  </div>
                  <button
                    onClick={swapPanels}
                    className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
                    title="Swap panels"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-400 hover:text-white rotate-180" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 min-h-0">
                  {bottomPanelTab === 'insights' ? (
                    activeNavItem === "training" ? (
                      // Training insights in split view
                      trainingInsights.summary ? (
                        <>
                          {trainingInsights.incident && Object.keys(trainingInsights.incident).length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <h4 className="font-semibold text-sm">Incident Details</h4>
                              </div>
                              <div className="space-y-2">
                                {trainingInsights.incident.incident_type && (
                                  <div>
                                    <span className="text-xs text-gray-400">Type: </span>
                                    <span className="text-sm text-white capitalize">{trainingInsights.incident.incident_type}</span>
                                  </div>
                                )}
                                {trainingInsights.incident.severity && (
                                  <div>
                                    <span className="text-xs text-gray-400">Severity: </span>
                                    <span className="text-sm text-white capitalize">{trainingInsights.incident.severity}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {trainingInsights.additional_info && trainingInsights.additional_info.length > 0 && (
                            <div className="bg-[#2a2a2a] rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4 text-purple-400" />
                                <h4 className="font-semibold text-sm">Additional Information</h4>
                              </div>
                              <ul className="space-y-1">
                                {trainingInsights.additional_info.map((info, idx) => (
                                  <li key={idx} className="text-sm text-gray-300">{info}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center text-gray-400 text-sm">No insights yet</div>
                      )
                    ) : (
                      renderInsightsContent()
                    )
                  ) : (
                    renderProtocolContent()
                  )}
                </div>
              </div>
            </div>
          )}
        </div >
        )}

        {/* Dispatch Control Panel - Right Sidebar */}
        {activeNavItem === "dispatch" && (
          <div id="dispatch-panel" style={{ width: `${rightWidth}px` }} className="border-l border-[#333333] bg-[#1f1f1f] flex flex-col flex-shrink-0">
            {/* Header */}
            <div className="border-b border-[#333333] px-4 py-3">
              <h3 className="text-white font-semibold text-base">Emergency Dispatch</h3>
              <p className="text-gray-400 text-xs mt-1">Find nearest emergency services</p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              {/* Emergency Type Selector */}
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">Emergency Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDispatchEmergencyType('hospital')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      dispatchEmergencyType === 'hospital'
                        ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]'
                        : 'border-[#333333] bg-[#2a2a2a] text-gray-400 hover:border-[#3b82f6]/50 hover:text-[#3b82f6]'
                    }`}
                  >
                    <Ambulance className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Hospital</span>
                  </button>
                  <button
                    onClick={() => setDispatchEmergencyType('police')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      dispatchEmergencyType === 'police'
                        ? 'border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]'
                        : 'border-[#333333] bg-[#2a2a2a] text-gray-400 hover:border-[#22c55e]/50 hover:text-[#22c55e]'
                    }`}
                  >
                    <Shield className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Police</span>
                  </button>
                  <button
                    onClick={() => setDispatchEmergencyType('fire')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      dispatchEmergencyType === 'fire'
                        ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]'
                        : 'border-[#333333] bg-[#2a2a2a] text-gray-400 hover:border-[#ef4444]/50 hover:text-[#ef4444]'
                    }`}
                  >
                    <Flame className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Fire</span>
                  </button>
                </div>
              </div>

              {/* Search Button */}
              <Button
                onClick={async () => {
                  if (dispatchMapRef.current) {
                    setIsSearchingStations(true);
                    try {
                      await dispatchMapRef.current.searchNearestStations();
                    } finally {
                      setIsSearchingStations(false);
                    }
                  }
                }}
                disabled={isSearchingStations}
                className="w-full bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] hover:from-[#ea7b1a] hover:to-[#fb923c] text-white font-semibold py-3 rounded-lg transition-all shadow-lg"
              >
                {isSearchingStations ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Find Nearest Stations
                  </>
                )}
              </Button>

              {/* Results List */}
              {dispatchStations.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">
                    Top 5 Nearest {dispatchEmergencyType === 'hospital' ? 'Hospitals' : dispatchEmergencyType === 'police' ? 'Police Stations' : 'Fire Stations'}
                  </h4>
                  <div className="space-y-2">
                    {dispatchStations.map((station, index) => (
                      <div key={index}>
                        <button
                          onClick={() => {
                            setSelectedStationIndex(selectedStationIndex === index ? null : index);
                            if (dispatchMapRef.current) {
                              dispatchMapRef.current.flyToStation(station);
                            }
                          }}
                          className={`w-full p-3 rounded-lg border-2 transition-all text-left hover:shadow-lg ${
                            selectedStationIndex === index
                              ? dispatchEmergencyType === 'hospital'
                                ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                                : dispatchEmergencyType === 'police'
                                ? 'border-[#22c55e] bg-[#22c55e]/10'
                                : 'border-[#ef4444] bg-[#ef4444]/10'
                              : dispatchEmergencyType === 'hospital'
                                ? 'border-[#3b82f6]/30 bg-[#3b82f6]/5 hover:border-[#3b82f6] hover:bg-[#3b82f6]/10'
                                : dispatchEmergencyType === 'police'
                                ? 'border-[#22c55e]/30 bg-[#22c55e]/5 hover:border-[#22c55e] hover:bg-[#22c55e]/10'
                                : 'border-[#ef4444]/30 bg-[#ef4444]/5 hover:border-[#ef4444] hover:bg-[#ef4444]/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                                dispatchEmergencyType === 'hospital'
                                  ? 'bg-[#3b82f6] text-white'
                                  : dispatchEmergencyType === 'police'
                                  ? 'bg-[#22c55e] text-white'
                                  : 'bg-[#ef4444] text-white'
                              }`}>
                                {index + 1}
                              </span>
                              {index === 0 && (
                                <span className="px-2 py-0.5 bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] text-white text-xs font-bold rounded">
                                  CLOSEST
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-semibold ${
                                dispatchEmergencyType === 'hospital'
                                  ? 'text-[#3b82f6]'
                                  : dispatchEmergencyType === 'police'
                                  ? 'text-[#22c55e]'
                                  : 'text-[#ef4444]'
                              }`}>
                                {station.distance.toFixed(1)} km
                              </div>
                              <div className="text-xs text-[#fb923c] font-medium">
                                {station.duration} drive
                              </div>
                            </div>
                          </div>
                          <h5 className="text-sm font-semibold text-white mb-1 line-clamp-1">
                            {station.name}
                          </h5>
                          <p className="text-xs text-gray-400 line-clamp-2">
                            {station.address}
                          </p>
                          
                          {/* Emergency Contact Actions - Expand inside card when selected */}
                          {selectedStationIndex === index && emergencyContacts[dispatchEmergencyType] && (
                            <div className="mt-4 pt-4 border-t border-[#fb923c]/30">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-[#fb923c]" />
                                  <span className="text-xs font-semibold text-gray-400">Emergency Contact:</span>
                                </div>
                                <span className="text-sm font-bold text-[#fb923c]">{emergencyContacts[dispatchEmergencyType]}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    console.log('📞 Initiating emergency call to:', emergencyContacts[dispatchEmergencyType]);
                                    console.log('📊 Using insights data:', insights);
                                    console.log('📍 Location address:', mapLocation.address);
                                    
                                    try {
                                      // Determine which insights to use (training or call insights)
                                      const insightsToUse = activeNavItem === "training" ? trainingInsights : insights;
                                      console.log('🔍 Selected insights for call:', insightsToUse);
                                      
                                      // Make emergency call via backend API
                                      const response = await fetch('http://localhost:8000/call/emergency', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          to_number: emergencyContacts[dispatchEmergencyType],
                                          emergency_type: dispatchEmergencyType,
                                          location_address: mapLocation.address,
                                          station_name: station.name,
                                          insights_data: insightsToUse
                                        })
                                      });
                                      
                                      const result = await response.json();
                                      console.log('📞 Call API response:', result);
                                      
                                      if (result.status === 'success') {
                                        toast({
                                          title: "Emergency Call Initiated",
                                          description: `Call placed to ${station.name} - SID: ${result.call_sid}`,
                                        });
                                        console.log('✅ Emergency call successful:', result.call_sid);
                                      } else {
                                        toast({
                                          title: "Call Failed",
                                          description: result.message || "Failed to initiate call",
                                          variant: "destructive"
                                        });
                                        console.error('❌ Call failed:', result.message);
                                      }
                                    } catch (error) {
                                      console.error('❌ Call error:', error);
                                      toast({
                                        title: "Call Error",
                                        description: "Failed to initiate emergency call",
                                        variant: "destructive"
                                      });
                                    }
                                  }}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold h-9 text-sm"
                                >
                                  <Phone className="w-4 h-4 mr-2" />
                                  Call
                                </Button>
                                <Button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    console.log('📱 Sending emergency SMS to:', emergencyContacts[dispatchEmergencyType]);
                                    console.log('📊 Using insights data:', insights);
                                    console.log('📍 Location address:', mapLocation.address);
                                    
                                    try {
                                      // Determine which insights to use (training or call insights)
                                      const insightsToUse = activeNavItem === "training" ? trainingInsights : insights;
                                      console.log('🔍 Selected insights for SMS:', insightsToUse);
                                      
                                      // Send emergency SMS with insights data
                                      const response = await fetch('http://localhost:8000/sms/emergency', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          to_number: emergencyContacts[dispatchEmergencyType],
                                          emergency_type: dispatchEmergencyType,
                                          location_address: mapLocation.address,
                                          station_name: station.name,
                                          insights_data: insightsToUse
                                        })
                                      });
                                      
                                      const result = await response.json();
                                      console.log('📱 SMS API response:', result);
                                      
                                      if (result.status === 'success') {
                                        toast({
                                          title: "SMS Sent",
                                          description: `Emergency alert sent to ${station.name}`,
                                        });
                                        console.log('✅ Emergency SMS successful:', result.message_sid);
                                      } else {
                                        toast({
                                          title: "SMS Failed",
                                          description: result.message || "Failed to send SMS",
                                          variant: "destructive"
                                        });
                                        console.error('❌ SMS failed:', result.message);
                                      }
                                    } catch (error) {
                                      console.error('❌ SMS error:', error);
                                      toast({
                                        title: "SMS Error",
                                        description: "Failed to send emergency SMS",
                                        variant: "destructive"
                                      });
                                    }
                                  }}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-9 text-sm"
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Send SMS
                                </Button>
                              </div>
                            </div>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!isSearchingStations && dispatchStations.length === 0 && (
                <div className="bg-[#2a2a2a] rounded-lg p-6 text-center border border-[#333333]">
                  <Search className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">
                    Select an emergency type and click "Find Nearest Stations" to see the closest facilities.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div >
    </div >
  );
};