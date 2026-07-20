import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, Languages, Trash2, Save, ArrowLeft } from 'lucide-react';

interface SettingsData {
  call_forward_number: string | null;
  default_translation_language: string;
}

const INDIAN_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
];

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsData>({
    call_forward_number: null,
    default_translation_language: 'en',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/settings');
      const data = await response.json();
      
      if (data.status === 'success' && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load settings. Using defaults.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:8000/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast({
          title: 'Success',
          description: 'Settings saved successfully',
        });
      } else {
        throw new Error(data.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const clearLocalStorage = () => {
    if (confirm('Are you sure you want to clear all local storage? This will reset all local preferences and cache.')) {
      localStorage.clear();
      toast({
        title: 'Local Storage Cleared',
        description: 'All local data has been cleared successfully',
      });
      
      // Reload the page to reset the app state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5B5FED] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-gray-800 pb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-white mb-4 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-2">Manage your agency settings and preferences</p>
        </div>

        {/* Call Forwarding */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-[#5B5FED]" />
              <CardTitle className="text-white">Call Forwarding</CardTitle>
            </div>
            <CardDescription>
              Set a phone number to forward incoming emergency calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="forward-number" className="text-gray-300">
                Forward To Phone Number
              </Label>
              <Input
                id="forward-number"
                type="tel"
                placeholder="+1234567890"
                value={settings.call_forward_number || ''}
                onChange={(e) => setSettings({ ...settings, call_forward_number: e.target.value || null })}
                className="bg-[#0a0a0a] border-gray-700 text-white placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500">
                Leave empty to disable call forwarding. Use international format (e.g., +91 for India)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Default Translation Language */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Languages className="w-5 h-5 text-[#5B5FED]" />
              <CardTitle className="text-white">Default Translation Language</CardTitle>
            </div>
            <CardDescription>
              Set the default language for translating caller messages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="default-language" className="text-gray-300">
                Default Language
              </Label>
              <Select
                value={settings.default_translation_language}
                onValueChange={(value) => setSettings({ ...settings, default_translation_language: value })}
              >
                <SelectTrigger 
                  id="default-language"
                  className="bg-[#0a0a0a] border-gray-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-gray-700">
                  {INDIAN_LANGUAGES.map((lang) => (
                    <SelectItem 
                      key={lang.code} 
                      value={lang.code}
                      className="text-white hover:bg-[#2a2a2a] focus:bg-[#2a2a2a]"
                    >
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                This will be used as the default target language for real-time translation
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Clear Local Storage */}
        <Card className="bg-[#1a1a1a] border-gray-800 border-red-900/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <CardTitle className="text-white">Clear Local Storage</CardTitle>
            </div>
            <CardDescription className="text-red-400/70">
              Remove all cached data and preferences stored locally
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={clearLocalStorage}
              className="w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Local Storage
            </Button>
            <p className="text-xs text-gray-500 mt-3">
              Warning: This will clear all local data including cached call records, preferences, and session information. 
              The page will reload automatically.
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
          <Button
            variant="outline"
            onClick={loadSettings}
            disabled={saving}
            className="border-gray-700 text-gray-300 hover:bg-[#1a1a1a]"
          >
            Reset
          </Button>
          <Button
            onClick={saveSettings}
            disabled={saving}
            className="bg-[#5B5FED] hover:bg-[#4a4ec0] text-white"
          >
            {saving ? (
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
        </div>
      </div>
    </div>
  );
}
