/**
 * Translation Service Test
 * Run this to test the translation functionality
 */

import { getRealtimeTranslationService } from './realtimeTranslationService';

async function testTranslation() {
  const translationService = getRealtimeTranslationService();

  console.log('🧪 Testing Real-time Translation Service\n');
  console.log('='.repeat(60));

  // Test 1: Spanish to English (Caller)
  console.log('\n📞 Test 1: Caller speaks Spanish -> English');
  const spanishText = 'Ayúdame, necesito ayuda, hay una emergencia';
  console.log(`Original (Spanish): ${spanishText}`);
  
  const englishTranslation = await translationService.translateCallerMessage(spanishText);
  console.log(`Translated (English): ${englishTranslation.translated}`);
  console.log(`Detected Language: ${englishTranslation.sourceLanguage}`);

  // Test 2: English to Spanish (Dispatcher)
  console.log('\n🎧 Test 2: Dispatcher speaks English -> Spanish');
  const englishText = 'Help is on the way. Stay calm and stay on the line.';
  console.log(`Original (English): ${englishText}`);
  
  const spanishTranslation = await translationService.translateDispatcherMessage(englishText, 'spanish');
  console.log(`Translated (Spanish): ${spanishTranslation.translated}`);

  // Test 3: Hindi to English
  console.log('\n📞 Test 3: Caller speaks Hindi -> English');
  const hindiText = 'मुझे मदद चाहिए, यह एक आपातकाल है';
  console.log(`Original (Hindi): ${hindiText}`);
  
  const hindiToEnglish = await translationService.translateCallerMessage(hindiText);
  console.log(`Translated (English): ${hindiToEnglish.translated}`);
  console.log(`Detected Language: ${hindiToEnglish.sourceLanguage}`);

  // Test 4: English to Hindi (Dispatcher)
  console.log('\n🎧 Test 4: Dispatcher speaks English -> Hindi');
  const dispatcherText = 'What is your emergency?';
  console.log(`Original (English): ${dispatcherText}`);
  
  const englishToHindi = await translationService.translateDispatcherMessage(dispatcherText, 'hindi');
  console.log(`Translated (Hindi): ${englishToHindi.translated}`);

  // Test 5: French to English
  console.log('\n📞 Test 5: Caller speaks French -> English');
  const frenchText = "J'ai besoin d'aide immédiatement";
  console.log(`Original (French): ${frenchText}`);
  
  const frenchToEnglish = await translationService.translateCallerMessage(frenchText);
  console.log(`Translated (English): ${frenchToEnglish.translated}`);

  // Test 6: Batch translation
  console.log('\n📦 Test 6: Batch Translation');
  const phrases = [
    'What is your location?',
    'Are you safe?',
    'Help is coming',
  ];
  console.log('Original phrases:', phrases);
  
  const batchTranslated = await translationService.batchTranslate(phrases, 'spanish');
  console.log('Translated to Spanish:', batchTranslated);

  // Cache stats
  console.log('\n📊 Cache Statistics');
  console.log(`Cache size: ${translationService.getCacheSize()} entries`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!\n');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTranslation().catch(console.error);
}

export { testTranslation };
