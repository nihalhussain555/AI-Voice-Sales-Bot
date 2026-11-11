// Canonical language list for the whole app: the browser speech layer, the
// agent's voice path and every language picker read this one module, so a
// language cannot appear in the UI without a recognition locale behind it.
// Codes are BCP 47 locales for the Web Speech API.
export const LANGUAGE_CONFIG = {
  'English': {
    code: 'en-US',
    speechRecognitionLang: 'en-US',
    voiceHints: ['Google US English', 'Microsoft Zira', 'Samantha', 'en-US', 'en_US', 'English']
  },
  'Hindi': {
    code: 'hi-IN',
    speechRecognitionLang: 'hi-IN',
    voiceHints: ['Google हिन्दी', 'Microsoft Hemant', 'Microsoft Kalpana', 'hi-IN', 'hi_IN', 'Hindi']
  },
  'Telugu': {
    code: 'te-IN',
    speechRecognitionLang: 'te-IN',
    voiceHints: ['Google తెలుగు', 'Microsoft Mohan', 'te-IN', 'te_IN', 'Telugu']
  },
  'Malayalam': {
    code: 'ml-IN',
    speechRecognitionLang: 'ml-IN',
    voiceHints: ['Google മലയാളം', 'Microsoft Neethu', 'ml-IN', 'ml_IN', 'Malayalam']
  },
  'Tamil': {
    code: 'ta-IN',
    speechRecognitionLang: 'ta-IN',
    voiceHints: ['Google தமிழ்', 'Microsoft Valluvar', 'Microsoft Pallavi', 'ta-IN', 'ta_IN', 'Tamil']
  },
  'Arabic': {
    code: 'ar-SA',
    speechRecognitionLang: 'ar-SA',
    // Arabic ships under several names across browsers, so the locale codes stay last.
    voiceHints: ['Google العربية', 'Microsoft Tarik', 'Microsoft Salma', 'ar-SA', 'ar-AE', 'Arabic']
  }
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG);
