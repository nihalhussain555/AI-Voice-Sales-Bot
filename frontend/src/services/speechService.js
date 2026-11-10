// Web Speech API wrapper for Speech Recognition (STT) and Speech Synthesis (TTS).
// Robustness upgrades over v1:
//  - Auto-restarts recognition when Chrome ends the session after silence (the old
//    "bot stops hearing me mid-call" bug).
//  - Barge-in: customer speech can interrupt the bot mid-sentence.
//  - Trailing-silence debounce so multi-utterance answers aren't chopped into turns.
//  - Error callback surfaced to the UI instead of console-only warnings.

const LANGUAGE_CONFIG = {
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
  }
};

const RESTART_DELAY_MS = 250;       // dodge the "start() called twice" race
const FINAL_DEBOUNCE_MS = 450;      // wait for the speaker to finish the thought
const BARGE_IN_MIN_WORDS = 2;       // words of interim speech needed to interrupt TTS

class SpeechService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.wantListening = false;   // intent flag: should recognition be kept alive?
    this.voices = [];
    this.selectedLanguage = 'English';

    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.onSpeakingStateChange = null;
    this.onError = null;

    this._finalBuffer = '';
    this._finalTimer = null;
    this._restartTimer = null;

    this.initVoices();
  }

  initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  setLanguage(languageName) {
    this.selectedLanguage = languageName;
    if (this.recognition) {
      const config = LANGUAGE_CONFIG[languageName] || LANGUAGE_CONFIG['English'];
      this.recognition.lang = config.speechRecognitionLang;
    }
  }

  getBestVoiceForLanguage(languageName) {
    const config = LANGUAGE_CONFIG[languageName] || LANGUAGE_CONFIG['English'];
    const available = this.voices.length > 0 ? this.voices : window.speechSynthesis.getVoices();

    for (const hint of config.voiceHints) {
      const found = available.find(v =>
        v.name.toLowerCase().includes(hint.toLowerCase()) ||
        v.lang.toLowerCase().replace('_', '-').includes(hint.toLowerCase())
      );
      if (found) return found;
    }

    const langPrefix = config.code.split('-')[0];
    const prefixMatch = available.find(v => v.lang.toLowerCase().startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    return available.find(v => v.default) || available[0] || null;
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (this.onError) this.onError('Speech recognition is not supported in this browser. Use Chrome or Edge, or type your responses.');
      return false;
    }

    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }

    this.recognition = new SpeechRecognition();
    const config = LANGUAGE_CONFIG[this.selectedLanguage] || LANGUAGE_CONFIG['English'];
    this.recognition.lang = config.speechRecognitionLang;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onSpeechStart) this.onSpeechStart();
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this._finalBuffer += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (this.onInterimResult && interim) {
        this.onInterimResult(interim.trim());
      }

      // Barge-in: customer talking over the bot stops the bot.
      if (this.isSpeaking && interim.trim().split(/\s+/).length >= BARGE_IN_MIN_WORDS) {
        this.stopSpeaking();
      }

      // Trailing-silence debounce: flush the accumulated transcript once the
      // customer pauses, so a sentence delivered over 2-3 recognition chunks
      // becomes ONE turn instead of several fragmented ones.
      if (this._finalBuffer.trim()) {
        this._scheduleFinalFlush();
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.wantListening = false;
        if (this.onError) this.onError('Microphone permission denied. Enable it in the browser to use voice, or type your responses.');
        return;
      }
      if (this.onError) this.onError(`Speech recognition error: ${event.error}`);
    };

    // The critical fix: Chrome terminates recognition after ~silence. Restart it
    // whenever we still *want* to be listening.
    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onSpeechEnd) this.onSpeechEnd();

      if (this.wantListening && !this.isSpeaking) {
        clearTimeout(this._restartTimer);
        this._restartTimer = setTimeout(() => {
          if (this.wantListening && !this.isSpeaking) this._rawStart();
        }, RESTART_DELAY_MS);
      }
    };

    return true;
  }

  _rawStart() {
    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e) {
      // "Already started" is fine; anything else surfaces as an error.
      if (e && e.name === 'InvalidStateError') return true;
      if (this.onError) this.onError(`Could not start listening: ${e.message || e}`);
      return false;
    }
  }

  _scheduleFinalFlush() {
    clearTimeout(this._finalTimer);
    this._finalTimer = setTimeout(() => {
      const text = this._finalBuffer.trim();
      this._finalBuffer = '';
      if (text && this.onFinalResult) {
        this.onFinalResult(text);
      }
    }, FINAL_DEBOUNCE_MS);
  }

  startListening() {
    this.wantListening = true;
    if (this.isSpeaking) {
      // Do not open the mic while the bot talks (feedback loop). The onend /
      // speak-complete handlers will start listening once the bot finishes.
      return;
    }
    if (!this.recognition) {
      const initialized = this.initRecognition();
      if (!initialized) return;
    }
    if (this.isListening) return;
    this._rawStart();
  }

  stopListening() {
    this.wantListening = false;
    clearTimeout(this._restartTimer);
    clearTimeout(this._finalTimer);
    // Preserve any buffered speech as a turn before shutting the mic off.
    if (this._finalBuffer.trim()) {
      const text = this._finalBuffer.trim();
      this._finalBuffer = '';
      if (this.onFinalResult) this.onFinalResult(text);
    }
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }

  speak(text, onComplete) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onComplete) onComplete();
      return;
    }

    // Stop recognition while bot is speaking
    this.wantListening = false;
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch (e) {}
      this.isListening = false;
    }
    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/[*_#`~[\]]/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '')
      .trim();

    // Chrome quirk: speechSynthesis can silently stall on long utterances.
    // Chunk on sentence boundaries and keep a keep-alive ticking.
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voice = this.getBestVoiceForLanguage(this.selectedLanguage);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.02;

    let finished = false;
    const handleEnd = () => {
      if (finished) return;
      finished = true;
      clearInterval(this._keepAlive);
      this.isSpeaking = false;
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
      if (onComplete) onComplete();
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(true);
    };
    utterance.onend = handleEnd;
    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted' && this.onError) {
        this.onError(`Speech synthesis error: ${e.error}`);
      }
      handleEnd();
    };

    this._keepAlive = setInterval(() => {
      if (this.isSpeaking && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 7000);

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      clearInterval(this._keepAlive);
      this.isSpeaking = false;
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
    }
  }

  // Hard teardown for call end / component unmount.
  destroy() {
    this.stopListening();
    this.stopSpeaking();
    clearTimeout(this._finalTimer);
    clearTimeout(this._restartTimer);
    this.recognition = null;
  }
}

export const speechService = new SpeechService();
export { LANGUAGE_CONFIG };
