import { useState, useCallback, useEffect } from 'react';
import { getRealtimeTranslationService } from '@/services/realtimeTranslationService';

interface TranslationState {
  isTranslating: boolean;
  detectedLanguage: string;
  error: string | null;
}

interface TranslationResult {
  original: string;
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
}

interface UseRealtimeTranslationReturn {
  translateCallerMessage: (text: string) => Promise<TranslationResult>;
  translateDispatcherMessage: (text: string, targetLanguage: string) => Promise<TranslationResult>;
  isTranslating: boolean;
  detectedLanguage: string;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for real-time translation in conversations
 * Automatically translates caller messages to English and dispatcher messages to target language
 */
export const useRealtimeTranslation = (): UseRealtimeTranslationReturn => {
  const [state, setState] = useState<TranslationState>({
    isTranslating: false,
    detectedLanguage: 'en',
    error: null,
  });

  const translationService = getRealtimeTranslationService();

  /**
   * Translate caller message (Auto-detect -> English)
   */
  const translateCallerMessage = useCallback(async (text: string): Promise<TranslationResult> => {
    if (!text || !text.trim()) {
      return {
        original: text,
        translated: text,
        sourceLanguage: 'en',
        targetLanguage: 'en',
      };
    }

    console.log('🔵 [Hook] translateCallerMessage called:', text.substring(0, 50));
    setState(prev => ({ ...prev, isTranslating: true, error: null }));

    try {
      const result = await translationService.translateCallerMessage(text);

      console.log('🔵 [Hook] Translation result:', {
        detected: result.sourceLanguage,
        original: text.substring(0, 30),
        translated: result.translated.substring(0, 30),
        changed: result.translated !== text
      });

      setState(prev => ({
        ...prev,
        isTranslating: false,
        detectedLanguage: result.sourceLanguage,
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      console.error('🔵 [Hook] Translation error:', errorMessage);
      setState(prev => ({
        ...prev,
        isTranslating: false,
        error: errorMessage,
      }));
      // Return original on error
      return {
        original: text,
        translated: text,
        sourceLanguage: 'en',
        targetLanguage: 'en',
      };
    }
  }, [translationService]);

  /**
   * Translate dispatcher message (English -> Target Language)
   */
  const translateDispatcherMessage = useCallback(
    async (text: string, targetLanguage: string): Promise<TranslationResult> => {
      if (!text || !text.trim()) {
        return {
          original: text,
          translated: text,
          sourceLanguage: 'en',
          targetLanguage: 'en',
        };
      }

      console.log('🟢 [Hook] translateDispatcherMessage called:', {
        text: text.substring(0, 50),
        targetLanguage
      });

      setState(prev => ({ ...prev, isTranslating: true, error: null }));

      try {
        const result = await translationService.translateDispatcherMessage(text, targetLanguage);

        console.log('🟢 [Hook] Dispatcher translation result:', {
          original: text.substring(0, 30),
          translated: result.translated.substring(0, 30),
          targetLang: targetLanguage,
          changed: result.translated !== text
        });

        setState(prev => ({ ...prev, isTranslating: false }));

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Translation failed';
        setState(prev => ({
          ...prev,
          isTranslating: false,
          error: errorMessage,
        }));
        // Return original on error
        return {
          original: text,
          translated: text,
          sourceLanguage: 'en',
          targetLanguage: targetLanguage,
        };
      }
    },
    [translationService]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    translateCallerMessage,
    translateDispatcherMessage,
    isTranslating: state.isTranslating,
    detectedLanguage: state.detectedLanguage,
    error: state.error,
    clearError,
  };
};

export default useRealtimeTranslation;
