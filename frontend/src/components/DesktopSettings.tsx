import { useEffect, useState } from 'react';
import { AudioDeviceSelector } from './AudioDeviceSelector';
import { Button } from './ui/button';
import { Settings, X } from 'lucide-react';

interface DesktopSettingsProps {
  onInputDeviceChange?: (deviceId: string) => void;
  onOutputDeviceChange?: (deviceId: string) => void;
}

export const DesktopSettings = ({ 
  onInputDeviceChange, 
  onOutputDeviceChange 
}: DesktopSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [appInfo, setAppInfo] = useState<any>(null);

  useEffect(() => {
    // Check if running in Electron
    const electron = window.electronAPI?.isElectron || false;
    setIsElectron(electron);

    if (electron && window.electronAPI) {
      window.electronAPI.getAppInfo().then(info => {
        setAppInfo(info);
      });
    }
  }, []);

  if (!isElectron) {
    return null; // Don't show settings in web version
  }

  return (
    <>
      {/* Settings Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        size="icon"
        className="relative"
        title="Audio Settings"
      >
        <Settings className="w-5 h-5" />
      </Button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#333333]">
              <div>
                <h2 className="text-lg font-semibold text-white">Desktop Settings</h2>
                {appInfo && (
                  <p className="text-xs text-[#b5b5b5]">
                    Version {appInfo.version} • {appInfo.platform}
                  </p>
                )}
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="icon"
                className="hover:bg-[#2a2a2a]"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-white mb-3">Audio Devices</h3>
                <AudioDeviceSelector
                  onInputDeviceChange={onInputDeviceChange}
                  onOutputDeviceChange={onOutputDeviceChange}
                />
              </div>

              <div className="pt-4 border-t border-[#333333]">
                <p className="text-xs text-[#b5b5b5]">
                  💡 Tip: Select your preferred audio devices for better call quality.
                  Changes take effect immediately.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#333333] flex justify-end">
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-[#fb923c] hover:bg-[#fb923c]/90 text-white"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
