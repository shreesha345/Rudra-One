import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Settings as SettingsIcon, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { apiService } from '../services/apiService';

export const DesktopSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  
  const [settings, setSettings] = useState({
    DEEPGRAM_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    GOOGLE_API_KEY: '',
    ELEVENLABS_API_KEY: '',
    ELEVENLABS_VOICE: '',
    SARVAM_API_KEY: '',
    GROQ_API_KEY: '',
    ASSEMBLYAI_API_KEY: '',
    NGROK_URL: '',
    VITE_MAPBOX_TOKEN: ''
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const baseUrl = apiService.getBaseUrl();
      const response = await fetch(`${baseUrl}/settings`);
      if (response.ok) {
        const data = await response.json();
        // Merge with existing keys to ensure all fields exist
        setSettings(prev => ({ ...prev, ...data }));
        
        // Also check localStorage for frontend-only settings like Mapbox
        const mapboxToken = localStorage.getItem('VITE_MAPBOX_TOKEN');
        if (mapboxToken) {
            setSettings(prev => ({ ...prev, VITE_MAPBOX_TOKEN: mapboxToken }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const baseUrl = apiService.getBaseUrl();
      
      // Save backend settings
      const response = await fetch(`${baseUrl}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save backend settings');
      }
      
      // Save frontend settings to localStorage
      if (settings.VITE_MAPBOX_TOKEN) {
        localStorage.setItem('VITE_MAPBOX_TOKEN', settings.VITE_MAPBOX_TOKEN);
      }

      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderField = (key: string, label: string, isSecret = true) => (
    <div className="space-y-2">
      <Label htmlFor={key} className="text-white">{label}</Label>
      <div className="relative">
        <Input
          id={key}
          type={isSecret && !showSecrets[key] ? "password" : "text"}
          value={settings[key as keyof typeof settings] || ''}
          onChange={(e) => handleChange(key, e.target.value)}
          className="bg-[#2a2a2a] border-[#333333] text-white pr-10"
          placeholder={`Enter ${label}`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => toggleShowSecret(key)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[#fb923c]" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#1a1a1a] p-8 overflow-y-auto custom-scrollbar h-full">
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex items-center justify-between border-b border-[#333333] pb-6">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <SettingsIcon className="w-6 h-6 text-[#fb923c]" />
              System Configuration
            </h2>
            <p className="text-gray-400 mt-1">
              Configure API keys and service connections for the platform.
            </p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-[#fb923c] hover:bg-[#ea7b1a] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Voice & Telephony */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#fb923c] border-b border-[#333333] pb-2">
              Voice & Telephony
            </h3>
            {renderField('TWILIO_ACCOUNT_SID', 'Twilio Account SID')}
            {renderField('TWILIO_AUTH_TOKEN', 'Twilio Auth Token')}
            {renderField('TWILIO_PHONE_NUMBER', 'Twilio Phone Number', false)}
            {renderField('DEEPGRAM_API_KEY', 'Deepgram API Key')}
          </div>

          {/* AI & Intelligence */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#fb923c] border-b border-[#333333] pb-2">
              AI & Intelligence
            </h3>
            {renderField('GOOGLE_API_KEY', 'Google Gemini API Key')}
            {renderField('GROQ_API_KEY', 'Groq API Key')}
            {renderField('ASSEMBLYAI_API_KEY', 'AssemblyAI API Key')}
          </div>

          {/* Text to Speech */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#fb923c] border-b border-[#333333] pb-2">
              Text to Speech
            </h3>
            {renderField('ELEVENLABS_API_KEY', 'ElevenLabs API Key')}
            {renderField('ELEVENLABS_VOICE', 'ElevenLabs Voice ID', false)}
            {renderField('SARVAM_API_KEY', 'Sarvam AI API Key (Disabled)')}
          </div>

          {/* Infrastructure */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#fb923c] border-b border-[#333333] pb-2">
              Infrastructure
            </h3>
            {renderField('NGROK_URL', 'Ngrok URL (Optional)', false)}
            {renderField('VITE_MAPBOX_TOKEN', 'Mapbox Token')}
          </div>
        </div>
      </div>
    </div>
  );
};
