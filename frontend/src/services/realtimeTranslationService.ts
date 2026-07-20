/**
 * Real-time Translation Service with MyMemory API (Free & Reliable)
 * No API key required - uses free MyMemory Translation API
 * Supports 50+ languages with offline character-based detection
 */

interface TranslationCache {
  [key: string]: string;
}

interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage: string;
  text: string;
}

interface TranslationResult {
  original: string;
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
}

class RealtimeTranslationService {
  private cache: TranslationCache = {};
  private myMemoryUrl = 'https://api.mymemory.translated.net/get';
  
  // Language code mapping - Includes all 22 official languages of India
  private languageMap: { [key: string]: string } = {
    // Major world languages
    'spanish': 'es',
    'english': 'en',
    'french': 'fr',
    'german': 'de',
    'italian': 'it',
    'portuguese': 'pt',
    'russian': 'ru',
    'japanese': 'ja',
    'korean': 'ko',
    'chinese': 'zh',
    'arabic': 'ar',
    
    // 22 Official Languages of India
    'hindi': 'hi',
    'bengali': 'bn',
    'telugu': 'te',
    'marathi': 'mr',
    'tamil': 'ta',
    'urdu': 'ur',
    'gujarati': 'gu',
    'kannada': 'kn',
    'odia': 'or',
    'malayalam': 'ml',
    'punjabi': 'pa',
    'assamese': 'as',
    'maithili': 'mai',
    'santali': 'sat',
    'kashmiri': 'ks',
    'nepali': 'ne',
    'sindhi': 'sd',
    'konkani': 'kok',
    'dogri': 'doi',
    'manipuri': 'mni',
    'bodo': 'brx',
    'sanskrit': 'sa',
  };

  /**
   * Generate cache key for translation
   */
  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text.toLowerCase().trim()}`;
  }

  /**
   * Get language code from name
   */
  getLanguageCode(language: string): string {
    const lowerLang = language.toLowerCase();
    return this.languageMap[lowerLang] || lowerLang;
  }

  /**
   * Detect language of text using simple heuristics
   */
  async detectLanguage(text: string): Promise<string> {
    if (!text || !text.trim()) {
      return 'en';
    }

    // Simple language detection based on character ranges
    const hasDevanagari = /[\u0900-\u097F]/.test(text); // Hindi, Marathi, Sanskrit
    const hasBengali = /[\u0980-\u09FF]/.test(text);
    const hasTamil = /[\u0B80-\u0BFF]/.test(text);
    const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
    const hasKannada = /[\u0C80-\u0CFF]/.test(text);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
    const hasGurmukhi = /[\u0A00-\u0A7F]/.test(text); // Punjabi
    const hasOriya = /[\u0B00-\u0B7F]/.test(text); // Odia
    const hasArabic = /[\u0600-\u06FF]/.test(text); // Arabic, Urdu
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
    const hasKorean = /[\uAC00-\uD7AF]/.test(text);
    const hasCyrillic = /[\u0400-\u04FF]/.test(text); // Russian

    if (hasDevanagari) return 'hi'; // Hindi (most common)
    if (hasBengali) return 'bn';
    if (hasTamil) return 'ta';
    if (hasTelugu) return 'te';
    if (hasKannada) return 'kn';
    if (hasMalayalam) return 'ml';
    if (hasGujarati) return 'gu';
    if (hasGurmukhi) return 'pa';
    if (hasOriya) return 'or';
    if (hasArabic) return 'ar'; // Could be Urdu too
    if (hasChinese) return 'zh';
    if (hasJapanese) return 'ja';
    if (hasKorean) return 'ko';
    if (hasCyrillic) return 'ru';

    // Default to English for Latin script
    return 'en';
  }

  /**
   * Translate text using MyMemory API (Free & Reliable)
   */
  async translate(options: TranslationOptions): Promise<string> {
    const { text, targetLanguage, sourceLanguage = 'auto' } = options;

    if (!text || !text.trim()) {
      return text;
    }

    // Normalize language codes
    const targetLang = this.getLanguageCode(targetLanguage);
    let sourceLang = sourceLanguage === 'auto' ? await this.detectLanguage(text) : this.getLanguageCode(sourceLanguage);

    console.log('🔄 Translation request:', {
      text: text.substring(0, 50) + '...',
      sourceLang,
      targetLang,
      targetLanguageInput: targetLanguage
    });

    // If source and target are the same, no translation needed
    if (sourceLang === targetLang) {
      console.log('⏭️ Same language, skipping translation');
      return text;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text, sourceLang, targetLang);
    if (this.cache[cacheKey]) {
      console.log('✅ Using cached translation');
      return this.cache[cacheKey];
    }

    try {
      // Use MyMemory Translation API (free, no API key required)
      const langPair = `${sourceLang}|${targetLang}`;
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${langPair}`;

      console.log('🌐 Calling MyMemory API:', { langPair, textLength: text.length });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      console.log('📥 API Response:', {
        status: data.responseStatus,
        hasTranslation: !!data.responseData?.translatedText
      });

      if (data.responseStatus !== 200) {
        throw new Error(`Translation failed: ${data.responseDetails || 'Unknown error'}`);
      }

      const translatedText = data.responseData.translatedText;

      // Cache the result
      this.cache[cacheKey] = translatedText;

      console.log('✅ Translation successful:', {
        original: text.substring(0, 30),
        translated: translatedText.substring(0, 30)
      });

      return translatedText;
    } catch (error) {
      console.error('❌ Translation failed:', error);
      return text; // Return original text on error
    }
  }

  /**
   * Translate with full result details
   */
  async translateWithDetails(options: TranslationOptions): Promise<TranslationResult> {
    const { text, targetLanguage, sourceLanguage = 'auto' } = options;
    
    let detectedSource = sourceLanguage;
    if (sourceLanguage === 'auto') {
      detectedSource = await this.detectLanguage(text);
    }

    const translated = await this.translate(options);

    return {
      original: text,
      translated,
      sourceLanguage: detectedSource,
      targetLanguage: this.getLanguageCode(targetLanguage),
    };
  }

  /**
   * Translate caller message (Auto-detect -> English)
   * Detects language and translates to English
   */
  async translateCallerMessage(text: string): Promise<TranslationResult> {
    const detectedLang = await this.detectLanguage(text);
    
    // If already English, no translation needed
    if (detectedLang === 'en') {
      return {
        original: text,
        translated: text,
        sourceLanguage: 'en',
        targetLanguage: 'en',
      };
    }

    const translated = await this.translate({
      text,
      sourceLanguage: detectedLang,
      targetLanguage: 'en',
    });

    return {
      original: text,
      translated,
      sourceLanguage: detectedLang,
      targetLanguage: 'en',
    };
  }

  /**
   * Translate dispatcher message (English -> Target Language)
   * Translates from English to caller's language
   */
  async translateDispatcherMessage(text: string, targetLanguage: string): Promise<TranslationResult> {
    const targetLang = this.getLanguageCode(targetLanguage);

    // If target is English, no translation needed
    if (targetLang === 'en') {
      return {
        original: text,
        translated: text,
        sourceLanguage: 'en',
        targetLanguage: 'en',
      };
    }

    const translated = await this.translate({
      text,
      sourceLanguage: 'en',
      targetLanguage: targetLang,
    });

    return {
      original: text,
      translated,
      sourceLanguage: 'en',
      targetLanguage: targetLang,
    };
  }

  /**
   * Batch translate multiple texts
   */
  async batchTranslate(texts: string[], targetLanguage: string, sourceLanguage: string = 'auto'): Promise<string[]> {
    const promises = texts.map(text => 
      this.translate({ text, targetLanguage, sourceLanguage })
    );
    return Promise.all(promises);
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

  /**
   * Preload common phrases for faster translation
   */
  async preloadCommonPhrases(phrases: string[], targetLanguage: string): Promise<void> {
    await this.batchTranslate(phrases, targetLanguage);
  }
}

// Singleton instance
let realtimeTranslationServiceInstance: RealtimeTranslationService | null = null;

export const getRealtimeTranslationService = (): RealtimeTranslationService => {
  if (!realtimeTranslationServiceInstance) {
    realtimeTranslationServiceInstance = new RealtimeTranslationService();
  }
  return realtimeTranslationServiceInstance;
};

export default RealtimeTranslationService;
