import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, Languages, Trash2, Save, ArrowLeft, Siren } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { apiService } from '@/services/apiService';

interface SettingsData {
  call_forward_number: string | null;
  default_translation_language: string;
  emergency_hospital?: string | null;
  emergency_police?: string | null;
  emergency_fire?: string | null;
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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      const response = await fetch(`${API_BASE_URL}/api/settings`);
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
      // Prepare the payload in the exact format required
      const payload = {
        call_forward_number: settings.call_forward_number || null,
        default_translation_language: settings.default_translation_language || "en",
        emergency_hospital: settings.emergency_hospital || null,
        emergency_police: settings.emergency_police || null,
        emergency_fire: settings.emergency_fire || null
      };
      
      console.log('💾 Saving settings with payload:', payload);
      
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('📥 Save response:', data);

      if (data.status === 'success') {
        toast({
          title: 'Success',
          description: 'Settings saved successfully',
        });
        
        // Dispatch custom event to notify Dashboard to refresh settings
        window.dispatchEvent(new CustomEvent('settings-updated'));
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

  const handleClearDatabase = async () => {
    try {
      setLoading(true);
      await apiService.clearDatabase();
      
      // Also clear local storage to ensure a complete reset
      localStorage.clear();
      
      toast({
        title: "Success",
        description: "Database and local storage cleared successfully",
      });
      // Reload to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

        {/* Emergency Contacts */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Siren className="w-5 h-5 text-[#5B5FED]" />
              <CardTitle className="text-white">Emergency Contacts</CardTitle>
            </div>
            <CardDescription>
              Configure the phone numbers for emergency services dispatch
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hospital-number" className="text-gray-300">
                Hospital / Ambulance
              </Label>
              <Input
                id="hospital-number"
                type="tel"
                placeholder="+1234567890"
                value={settings.emergency_hospital || ''}
                onChange={(e) => setSettings({ ...settings, emergency_hospital: e.target.value || null })}
                className="bg-[#0a0a0a] border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="police-number" className="text-gray-300">
                Police Department
              </Label>
              <Input
                id="police-number"
                type="tel"
                placeholder="+1234567890"
                value={settings.emergency_police || ''}
                onChange={(e) => setSettings({ ...settings, emergency_police: e.target.value || null })}
                className="bg-[#0a0a0a] border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fire-number" className="text-gray-300">
                Fire Department
              </Label>
              <Input
                id="fire-number"
                type="tel"
                placeholder="+1234567890"
                value={settings.emergency_fire || ''}
                onChange={(e) => setSettings({ ...settings, emergency_fire: e.target.value || null })}
                className="bg-[#0a0a0a] border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <p className="text-xs text-gray-500">
              These numbers will be used when dispatching emergency services via SMS or Call.
            </p>
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

        {/* System Reset */}
        <Card className="bg-[#1a1a1a] border-gray-800 border-red-900/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <CardTitle className="text-white">System Reset</CardTitle>
            </div>
            <CardDescription className="text-red-400/70">
              Permanently delete all data from the database and clear local storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Factory Reset (Clear All Data)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#1a1a1a] border-gray-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    This action cannot be undone. This will permanently delete all call history, transcripts, and insights from the database, AND clear all local storage.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-transparent border-gray-700 text-white hover:bg-gray-800">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearDatabase} className="bg-red-600 hover:bg-red-700 text-white">
                    Yes, delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <p className="text-xs text-gray-500 mt-3">
              Warning: This will permanently remove all data from the server database and your local browser. This action is irreversible.
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
