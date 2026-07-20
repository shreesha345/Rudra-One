/**
 * Real-time Translation Service
 * Provides fast translation between caller and dispatcher languages
 */

interface TranslationCache {
  [key: string]: string;
}

interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage: string;
  text: string;
}

class TranslationService {
  private cache: TranslationCache = {};
  private apiKey: string;
  private baseUrl = 'https://translation.googleapis.com/language/translate/v2';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY || '';
  }

  /**
   * Generate cache key for translation
   */
  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  /**
   * Detect language of text
   */
  async detectLanguage(text: string): Promise<string> {
    if (!this.apiKey) {
      console.warn('No Google Translate API key provided');
      return 'en';
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/detect?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
          }),
        }
      );

      const data = await response.json();
      return data.data.detections[0][0].language || 'en';
    } catch (error) {
      console.error('Language detection failed:', error);
      return 'en';
    }
  }

  /**
   * Translate text using Google Translate API
   */
  async translate(options: TranslationOptions): Promise<string> {
    const { text, targetLanguage, sourceLanguage = 'auto' } = options;

    if (!text || !text.trim()) {
      return text;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    if (!this.apiKey) {
      console.warn('No Google Translate API key provided, returning original text');
      return text;
    }

    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        q: text,
        target: targetLanguage,
      });

      if (sourceLanguage !== 'auto') {
        params.append('source', sourceLanguage);
      }

      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.statusText}`);
      }

      const data = await response.json();
      const translatedText = data.data.translations[0].translatedText;

      // Cache the result
      this.cache[cacheKey] = translatedText;

      return translatedText;
    } catch (error) {
      console.error('Translation failed:', error);
      return text; // Return original text on error
    }
  }

  /**
   * Translate caller speech (Spanish -> English)
   */
  async translateCallerMessage(text: string, callerLanguage: string = 'es'): Promise<string> {
    return this.translate({
      text,
      sourceLanguage: callerLanguage,
      targetLanguage: 'en',
    });
  }

  /**
   * Translate dispatcher speech (English -> Spanish)
   */
  async translateDispatcherMessage(text: string, targetLanguage: string = 'es'): Promise<string> {
    return this.translate({
      text,
      sourceLanguage: 'en',
      targetLanguage,
    });
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return Object.keys(this.cache).length;
  }
}

// Singleton instance
let translationServiceInstance: TranslationService | null = null;

export const getTranslationService = (apiKey?: string): TranslationService => {
  if (!translationServiceInstance) {
    translationServiceInstance = new TranslationService(apiKey);
  }
  return translationServiceInstance;
};

export default TranslationService;
