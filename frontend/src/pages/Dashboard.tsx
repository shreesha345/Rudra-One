import { useNavigate } from "react-router-dom";
import { Phone, Plus, Search, Bell, User, ChevronDown, Share2, Sparkles, Copy, Volume2, MapPin, FileText, Play, GripVertical, Radio, BarChart3, GraduationCap, Compass, Settings, Send, Mic, MicOff, CheckCircle, XCircle, AlertCircle, Info, MessageSquare, Ambulance, Shield, Flame, Loader2, LayoutDashboard, Archive, MoreHorizontal, Clock, Filter, RefreshCw, Save, Languages, Trash2, Menu, X, ChevronLeft, ChevronRight, History, Globe, ArrowRight, Tag, LineChart, Award } from "lucide-react";
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
  
  // Settings state
  const [callForwardNumber, setCallForwardNumber] = useState<string>("");
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(true);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'call-forwarding' | 'language' | 'storage'>('call-forwarding');
  
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
      const msg = message as any;
      if (msg.type === 'location_update' && msg.location) {
        // Handle location data received from backend
        const { latitude, longitude, caller_number } = msg.location;
        console.log('📍 Location received via WebSocket:', msg.location);
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
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
            language: 'English',
            isLive: true,
            call_sid: message.call_sid,
          };

          // Clear conversation and insights for new call
          console.log('🆕 New call started - clearing conversation and insights');
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

  const handleClearStorage = () => {
    if (window.confirm('Are you sure you want to clear all stored data? This will remove all calls, training logs, and settings. This action cannot be undone.')) {
      localStorage.clear();
      toast({
        title: "Storage Cleared",
        description: "All stored data has been removed. The page will reload.",
      });
      // Reload page to reset all state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
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
      // Extract phone number from station name or use a default
      // In production, you'd have phone numbers in the station data
      const phoneNumber = station.id; // Placeholder - you'd get actual phone from station data
      
      const response = await fetch(`${API_BASE_URL}/sms/emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_number: phoneNumber,
          insights_data: insights,
          location_address: mapLocation.address || `${mapLocation.latitude}, ${mapLocation.longitude}`,
          emergency_type: dispatchEmergencyType,
          station_name: station.name
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send emergency SMS');
      }

      const data = await response.json();
      
      toast({
        title: "SMS Sent",
        description: `Emergency alert sent to ${station.name}`,
      });
      
      console.log('✅ Emergency SMS sent:', data);
    } catch (error) {
      console.error('❌ Error sending emergency SMS:', error);
      toast({
        title: "SMS Failed",
        description: "Failed to send emergency alert",
        variant: "destructive",
      });
    }
  };

  const handleEmergencyCall = async (station: EmergencyStation) => {
    try {
      // Extract phone number from station - in production this would come from station data
      const phoneNumber = station.id; // Placeholder
      
      const response = await fetch(`${API_BASE_URL}/call/emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_number: phoneNumber,
          insights_data: insights,
          location_address: mapLocation.address || `${mapLocation.latitude}, ${mapLocation.longitude}`,
          emergency_type: dispatchEmergencyType
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate emergency call');
      }

      const data = await response.json();
      
      toast({
        title: "Call Initiated",
        description: `Emergency call placed to ${station.name}`,
      });
      
      console.log('✅ Emergency call initiated:', data);
    } catch (error) {
      console.error('❌ Error initiating emergency call:', error);
      toast({
        title: "Call Failed",
        description: "Failed to initiate emergency call",
        variant: "destructive",
      });
    }
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
      setSelectedIncident(0);

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

      const response = await fetch(`${API_BASE_URL}/training/message`, {
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

        // Update protocol questions based on conversation
        if (protocolManagerRef.current && activeTrainingSession) {
          const conversationText = trainingConversation.map(m => m.message).join(' ') + ' ' + data.caller_response;
          const result = protocolManagerRef.current.checkAndMarkQuestion(activeTrainingSession, conversationText);
          
          if (result.updated) {
            console.log('✅ Protocol questions updated:', result.markedQuestions);
          }

          // Generate AI questions dynamically based on conversation
          if (!isGeneratingQuestions) {
            setIsGeneratingQuestions(true);
            protocolManagerRef.current.generateAdditionalQuestions(activeTrainingSession, conversationText)
              .then(() => {
                setIsGeneratingQuestions(false);
                console.log('✅ AI-generated protocol questions updated');
              })
              .catch(() => {
                setIsGeneratingQuestions(false);
              });
          }
        }

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
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleStopTraining = async () => {
    if (!activeTrainingSession) return;

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
        // Don't show error for no-speech, just log it
        console.log('⏳ No speech detected, will restart automatically...');
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
               <div className={`w-2 h-2 rounded-full ${
                  notificationsConnected ? 'bg-green-500' : 'bg-red-500'
               }`}></div>
               <span className={notificationsConnected ? 'text-green-400' : 'text-red-400'}>
                  {notificationsConnected ? 'Connected' : 'Disconnected'}
               </span>
            </div>
            <Button variant="ghost" className="text-sm text-gray-400 font-normal hover:text-white hover:bg-[#1a1a1a]">
              Bangalore 112 Service <ChevronDown className="ml-2 w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
               <Bell className="w-5 h-5" />
            </Button>
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
                       onClick={() => {
                         // Only clear if switching to a different call
                         if (idx !== selectedIncident) {
                           console.log('🔄 Switching to different call - clearing conversation');
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
                           // Reset insights extractor
                           if (insightsExtractorRef.current) {
                             insightsExtractorRef.current = getInsightsExtractor();
                           }
                         }
                         
                         setSelectedIncident(idx);
                         // Set the caller number for WebSocket connection
                         if (call.phone && call.isLive) {
                           setSelectedCallerNumber(call.phone);
                           setIsLiveCall(true);
                           console.log('📞 Selected live call:', call.phone);
                         } else {
                           setSelectedCallerNumber(null);
                           setIsLiveCall(false);
                         }
                       }}>
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
                        <span>{calls[selectedIncident]?.isLive ? "Incoming Call" : "Past Call"}</span>
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
                  </div>
               </div>
               <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                     <div className={`w-2 h-2 rounded-full ${calls[selectedIncident]?.isLive ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
                     <span className="text-xs font-bold text-white">{calls[selectedIncident]?.isLive ? 'LIVE' : 'RECORDED'}</span>
                  </div>
                  <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                     <div className={`h-full bg-[#5B5FED] transition-all duration-300 ${
                        calls[selectedIncident]?.isLive ? 'w-full' : 'w-1/3'
                     }`}></div>
                  </div>
                  <Volume2 className="w-4 h-4 text-gray-400" />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
               <div className="text-center text-xs text-gray-500 mb-8">
                  {calls[selectedIncident]?.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} | {calls[selectedIncident]?.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
               </div>
               <div className="flex justify-center mb-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                     <Phone className="w-3 h-3" /> Call started
                  </div>
               </div>

               {conversation.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === 'Dispatch' ? 'justify-end' : 'justify-start'}`}>
                     <div className="max-w-[80%]">
                        <div className={`text-[10px] text-gray-500 mb-1 flex items-center gap-2 ${
                           msg.sender === 'Dispatch' ? 'justify-end' : 'justify-start'
                        }`}>
                           <span>{msg.sender} | {msg.time}</span>
                           {msg.isTranslated && (
                              <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-medium">
                                 <span>🌐</span> Translated
                              </span>
                           )}
                        </div>
                        <div className={`rounded-2xl text-sm ${
                           msg.sender === 'Dispatch' 
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
                              <div className={`p-3 ${
                                 msg.sender === 'Dispatch' ? 'text-gray-300' : 'text-white'
                              }`}>
                                 {msg.message}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               ))}
               
               <div ref={conversationEndRef} />
            </div>

            {/* Suggested Question - Shows one at a time above Talk button */}
            {calls[selectedIncident]?.isLive && protocolQuestions.filter(q => !q.isAsked).length > 0 && (
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
                           <div className="flex items-center gap-2 mb-1">
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
                                 className="text-[10px] text-[#5B5FED] hover:text-[#4a4ec0] transition-colors"
                              >
                                 {protocolQuestions.filter(q => !q.isAsked).length - 1} more questions →
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            )}

            {/* Microphone Button for Live Calls */}
            {calls[selectedIncident]?.isLive && (
               <div className="px-6 py-3 border-t border-[#2a2a2a] bg-[#0a0a0a] shrink-0">
                  <Button
                     onClick={toggleMicrophone}
                     disabled={!isLiveCall}
                     variant="outline"
                     size="sm"
                     className={`h-8 text-xs font-medium transition-all ${
                        isMicActive
                           ? 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20'
                           : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white'
                     }`}
                  >
                     {isMicActive ? (
                        <>
                           <MicOff className="w-3 h-3 mr-1.5" />
                           Stop Talking
                        </>
                     ) : (
                        <>
                           <Mic className="w-3 h-3 mr-1.5" />
                           Talk
                        </>
                     )}
                  </Button>
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
               className={`border-b border-[#2a2a2a] flex flex-col min-h-[300px] ${
                  calls[selectedIncident]?.phone && locationData[calls[selectedIncident].phone]
                     ? 'p-0'
                     : 'p-6 items-center justify-center text-center'
               }`}
            >
               {calls[selectedIncident]?.phone && locationData[calls[selectedIncident].phone] ? (
                  // Show map when location data is available
                  <div className="h-full w-full bg-[#1a1a1a] overflow-hidden relative flex-1">
                     <MapView 
                        latitude={locationData[calls[selectedIncident].phone].latitude} 
                        longitude={locationData[calls[selectedIncident].phone].longitude} 
                     />
                  </div>
               ) : (
                  // Show request button when no location data
                  <>
                     <div className="text-sm text-gray-400 mb-4">Send a link via SMS to receive live GPS location</div>
                     <Button 
                        onClick={() => {
                           if (calls[selectedIncident]?.phone) {
                              handleSendTrackingLink(calls[selectedIncident].phone);
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
                  </>
               )}
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
                        className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                           activeTab === tab.toLowerCase() ? 'border-[#5B5FED] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
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
                     <div className="space-y-4">
                        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333]">
                           <div className="flex items-center justify-between mb-3">
                              <h3 className="text-xs font-bold text-gray-400 uppercase">Protocol Questions</h3>
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
                                       className={`bg-[#0a0a0a] p-3 rounded-lg border transition-colors ${
                                          question.isAsked 
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
                                       <span className={`text-sm font-medium capitalize ${
                                          insights.incident.severity === 'critical' ? 'text-red-400' :
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
               <div className="absolute top-4 left-4 z-10 bg-[#1a1a1a]/90 backdrop-blur border border-[#333] p-4 rounded-lg shadow-lg w-80">
                  <h3 className="text-white font-semibold mb-3">Dispatch Resources</h3>
                  <div className="grid grid-cols-3 gap-2 mb-4">
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
                     className="w-full bg-[#5B5FED] hover:bg-[#4a4ec0] text-white font-semibold py-2 rounded-lg transition-all shadow-lg"
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
               </div>
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
                                       <div className={`w-2 h-2 rounded-full ${
                                          station.type === 'hospital' ? 'bg-[#3b82f6]' :
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
                    Ask Prepared
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
              <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                
                {/* Logo Section */}
                <div className="flex items-center gap-3 mb-8">
                  <img 
                    src="/image-removebg-preview (10).png" 
                    alt="Prepared Logo" 
                    className="h-40 w-auto"
                  />
                </div>

                {/* Search Bar Section */}
                <div className="w-full max-w-2xl relative mb-8">
                  <div className="relative flex items-center bg-[#1a1d24] rounded-xl border border-gray-700 p-2 shadow-lg">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-gray-700/50 text-gray-400 hover:text-white mr-2">
                      <Plus className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center bg-gray-800/50 rounded-full px-3 py-1 mr-2">
                      <Globe className="h-3 w-3 text-gray-400 mr-2" />
                      <span className="text-xs text-gray-300">Search</span>
                    </div>

                    <input 
                      type="text" 
                      placeholder="Which incident types scored lower than 70% i"
                      className="flex-1 bg-transparent border-none outline-none text-gray-300 placeholder-gray-500 text-sm h-10"
                    />

                    <Button size="icon" className="h-8 w-8 rounded-full bg-[#e87c46] hover:bg-[#d66a35] text-white ml-2">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Quick Action Cards */}
                <div className="flex flex-wrap justify-center gap-4">
                  <Button variant="outline" className="bg-[#1a1d24] border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-auto py-2 px-4 rounded-lg gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    YTD Total Call Volume
                  </Button>
                  <Button variant="outline" className="bg-[#1a1d24] border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-auto py-2 px-4 rounded-lg gap-2">
                    <Tag className="h-4 w-4 text-gray-400" />
                    Top 10 Call Tags
                  </Button>
                  <Button variant="outline" className="bg-[#1a1d24] border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-auto py-2 px-4 rounded-lg gap-2">
                    <LineChart className="h-4 w-4 text-gray-400" />
                    Average QA Scores
                  </Button>
                  <Button variant="outline" className="bg-[#1a1d24] border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-auto py-2 px-4 rounded-lg gap-2">
                    <Award className="h-4 w-4 text-gray-400" />
                    Highest-Performing Staff
                  </Button>
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
                           }}
                           className={`p-3 border-b border-[#1a1a2a] cursor-pointer hover:bg-[#1a1a1a] transition-colors relative ${
                              activeTrainingSession === log.session_id ? 'bg-gradient-to-r from-[#1a1a1a] to-[#1e1e2e]' : ''
                           }`}
                        >
                           {activeTrainingSession === log.session_id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5B5FED]"></div>}
                           <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                 log.status === 'completed' ? 'bg-green-900/30 text-green-400' : 
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
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                       log.status === 'active' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-gray-800/50 border-gray-700 text-gray-400'
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
                                 <span className={`${
                                    isTrainingInProgress ? 'text-[#5B5FED]' : 'text-gray-500'
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
                              className={`${
                                 isTrainingInProgress 
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
                                 <div className={`p-3 text-sm ${
                                    msg.sender === 'Dispatch' 
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
                                             className="text-xs text-[#5B5FED] hover:text-[#7b7ff0] shrink-0"
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
                                 className={`h-10 w-10 rounded-full transition-all ${
                                    isMicActive 
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
                           className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                              activeTab === tab.toLowerCase() ? 'border-[#5B5FED] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
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
                                       <span className={`text-xs font-bold px-2 py-1 rounded ${
                                          trainingConfidence > 80 ? 'bg-green-900/30 text-green-400' : 
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
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                           activeSettingsSection === 'call-forwarding' 
                              ? 'bg-[#5B5FED]/10 text-[#5B5FED]' 
                              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                        }`}
                     >
                        <Phone className="w-4 h-4" />
                        <span className="text-sm font-medium">Call Forwarding</span>
                     </button>
                     <button 
                        onClick={() => setActiveSettingsSection('language')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                           activeSettingsSection === 'language' 
                              ? 'bg-[#5B5FED]/10 text-[#5B5FED]' 
                              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                        }`}
                     >
                        <Languages className="w-4 h-4" />
                        <span className="text-sm font-medium">Default Language</span>
                     </button>
                     <button 
                        onClick={() => setActiveSettingsSection('storage')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                           activeSettingsSection === 'storage' 
                              ? 'bg-[#5B5FED]/10 text-[#5B5FED]' 
                              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                        }`}
                     >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium">Clear Storage</span>
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
                           <div>
                              <h2 className="text-2xl font-bold text-white">Settings</h2>
                              <p className="text-sm text-gray-400">Manage your agency settings and preferences</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="p-8">
                     <div className="max-w-4xl mx-auto">
                        {/* Call Forwarding Section */}
                        {activeSettingsSection === 'call-forwarding' && (
                           <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                              <div className="flex items-center gap-3 mb-6">
                                 <div className="w-10 h-10 rounded-lg bg-[#5B5FED]/10 flex items-center justify-center">
                                    <Phone className="w-5 h-5 text-[#5B5FED]" />
                                 </div>
                                 <div>
                                    <h3 className="text-lg font-semibold text-white">Call Forwarding</h3>
                                    <p className="text-sm text-gray-400">Forward incoming calls to another number</p>
                                 </div>
                              </div>
                              
                              <div className="space-y-4">
                                 <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                       Forward To Phone Number
                                    </label>
                                    <input
                                       type="tel"
                                       placeholder="+1234567890"
                                       value={callForwardNumber}
                                       onChange={(e) => setCallForwardNumber(e.target.value)}
                                       className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#5B5FED] focus:border-transparent"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                       Leave empty to disable. Use international format (e.g., +91 for India)
                                    </p>
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
                                          Save Call Forwarding
                                       </>
                                    )}
                                 </Button>
                              </div>
                           </div>
                        )}

                        {/* Default Language Section */}
                        {activeSettingsSection === 'language' && (
                           <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                              <div className="flex items-center gap-3 mb-6">
                                 <div className="w-10 h-10 rounded-lg bg-[#5B5FED]/10 flex items-center justify-center">
                                    <Languages className="w-5 h-5 text-[#5B5FED]" />
                                 </div>
                                 <div>
                                    <h3 className="text-lg font-semibold text-white">Default Translation Language</h3>
                                    <p className="text-sm text-gray-400">Set your preferred translation language</p>
                                 </div>
                              </div>
                              
                              <div className="space-y-4">
                                 <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                       Default Language
                                    </label>
                                    <select 
                                       value={defaultLanguage}
                                       onChange={(e) => setDefaultLanguage(e.target.value)}
                                       className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#5B5FED] focus:border-transparent"
                                    >
                                       <option value="en">English</option>
                                       <option value="hi">Hindi (हिन्दी)</option>
                                       <option value="bn">Bengali (বাংলা)</option>
                                       <option value="te">Telugu (తెలుగు)</option>
                                       <option value="mr">Marathi (मराठी)</option>
                                       <option value="ta">Tamil (தமிழ்)</option>
                                       <option value="gu">Gujarati (ગુજરાતી)</option>
                                       <option value="kn">Kannada (ಕನ್ನಡ)</option>
                                       <option value="ml">Malayalam (മലയാളം)</option>
                                       <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                                       <option value="or">Odia (ଓଡ଼ିଆ)</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-2">
                                       This will be used as the default target language for real-time translation
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

                        {/* Clear Local Storage Section */}
                        {activeSettingsSection === 'storage' && (
                           <div className="bg-[#1a1a1a] border border-red-900/30 rounded-lg p-6">
                              <div className="flex items-center gap-3 mb-6">
                                 <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                 </div>
                                 <div>
                                    <h3 className="text-lg font-semibold text-white">Clear Local Storage</h3>
                                    <p className="text-sm text-red-400/70">Remove all cached data and preferences</p>
                                 </div>
                              </div>
                              
                              <div className="space-y-4">
                                 <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                                    <p className="text-sm text-gray-300 mb-3">
                                       This will clear all local data including:
                                    </p>
                                    <ul className="text-sm text-gray-400 space-y-1 ml-4">
                                       <li>• All call records and transcriptions</li>
                                       <li>• Training sessions and evaluations</li>
                                       <li>• Conversation history and insights</li>
                                       <li>• User preferences and settings</li>
                                    </ul>
                                    <p className="text-xs text-red-400 mt-3">
                                       ⚠️ This action cannot be undone. The page will reload automatically.
                                    </p>
                                 </div>
                                 
                                 <Button 
                                    onClick={handleClearStorage}
                                    variant="destructive"
                                    className="w-full sm:w-auto"
                                 >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Clear Local Storage
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
