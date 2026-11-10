import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { speechService } from '../services/speechService.js';
import { callRecorder } from '../services/audioRecorder.js';

// Call session state machine: idle → connecting → speaking ⇄ listening/processing → ended.
// Owns speech callbacks, timer, transcript, recording upload, summary and persistence.
export default function useCallSession({ product, language, onError, onCallSaved }) {
  const [status, setStatus] = useState('idle'); // idle|connecting|speaking|listening|processing|ended
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [lastCall, setLastCall] = useState(null);

  const transcriptRef = useRef([]);
  const statusRef = useRef(status);
  const mutedRef = useRef(isMuted);
  const productRef = useRef(product);
  const languageRef = useRef(language);
  const timerRef = useRef(null);
  const endingRef = useRef(false);
  const durationRef = useRef(0);

  statusRef.current = status;
  mutedRef.current = isMuted;
  productRef.current = product;
  languageRef.current = language;
  durationRef.current = duration;

  const pushTranscript = useCallback((entry) => {
    transcriptRef.current = [...transcriptRef.current, entry];
    setTranscript(transcriptRef.current);
  }, []);

  const timeNow = () => {
    const m = Math.floor(durationRef.current / 60);
    const s = durationRef.current % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ---- speech service wiring -------------------------------------------------
  useEffect(() => {
    speechService.setLanguage(language);
  }, [language]);

  useEffect(() => {
    speechService.onInterimResult = (text) => {
      if (statusRef.current === 'listening') setInterimText(text);
    };

    speechService.onFinalResult = (text) => {
      setInterimText('');
      if (text?.trim() && ['listening', 'processing'].includes(statusRef.current)) {
        handleCustomerInput(text.trim());
      }
    };

    speechService.onSpeakingStateChange = (speaking) => {
      if (speaking) {
        setStatus('speaking');
      } else if (!['idle', 'ended'].includes(statusRef.current)) {
        setStatus('listening');
        if (!mutedRef.current) speechService.startListening();
      }
    };

    speechService.onError = (msg) => onError?.(msg);

    return () => {
      speechService.onInterimResult = null;
      speechService.onFinalResult = null;
      speechService.onSpeakingStateChange = null;
      speechService.onError = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- timer -----------------------------------------------------------------
  useEffect(() => {
    if (status !== 'idle' && status !== 'ended') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // ---- turn taking -----------------------------------------------------------
  const speakReply = useCallback((replyText) => {
    pushTranscript({ sender: 'bot', text: replyText, time: timeNow() });
    setStatus('speaking');
    speechService.speak(replyText); // onSpeakingStateChange(false) flips to listening
  }, [pushTranscript]);

  const handleCustomerInput = useCallback(async (customerText) => {
    if (!customerText || ['ended', 'idle'].includes(statusRef.current)) return;

    speechService.stopListening();
    setStatus('processing');
    pushTranscript({ sender: 'customer', text: customerText, time: timeNow() });

    try {
      const data = await api.chat({
        message: customerText,
        history: transcriptRef.current,
        product: productRef.current,
        language: languageRef.current
      });
      speakReply(data.reply);
      if (data.provider === 'smart-sales-engine') {
        onError?.('Groq key not configured — responses come from the built-in demo engine. Add your key in Settings.', 'info');
      }
    } catch (err) {
      // LLM failure must be visible, not a silent canned line pretending to be AI.
      onError?.(`AI response failed: ${err.message}. The call continues with a safe fallback reply.`, 'error');
      speakReply("Sorry, I lost my train of thought — could you repeat that?");
    }
  }, [pushTranscript, speakReply, onError]);

  // ---- lifecycle ---------------------------------------------------------------
  const startCall = useCallback(async () => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'ended') return;

    endingRef.current = false;
    transcriptRef.current = [];
    setTranscript([]);
    setDuration(0);
    durationRef.current = 0;
    setInterimText('');
    setStatus('connecting');
    await callRecorder.start();

    setTimeout(async () => {
      try {
        const data = await api.chat({
          message: '',
          history: [],
          product: productRef.current,
          language: languageRef.current
        });
        speakReply(data.reply);
      } catch (err) {
        onError?.(`Could not start the AI conversation: ${err.message}`, 'error');
        speakReply("Hello! Thanks for connecting. Are you currently exploring ways to upgrade your workflows?");
      }
    }, 600);
  }, [speakReply, onError]);

  const endCall = useCallback(async () => {
    if (endingRef.current || statusRef.current === 'ended') return;
    endingRef.current = true;

    setStatus('ended');
    speechService.destroy();
    clearInterval(timerRef.current);

    const { blob } = await callRecorder.stop();

    // Only persist server URLs — a blob: URL is dead once the tab closes.
    let recordingUrl = null;
    if (blob && blob.size > 0) {
      try {
        const uploaded = await api.uploadRecording(blob);
        if (uploaded?.url) recordingUrl = uploaded.url;
      } catch (err) {
        onError?.('Recording upload failed; the call will be saved without audio.', 'error');
      }
    }

    let summary;
    try {
      summary = await api.summarize({ transcript: transcriptRef.current, product: productRef.current });
    } catch (err) {
      summary = {
        status: 'Follow-up Required',
        overview: 'Summary service unavailable.',
        requirements: [], objections: [], nextSteps: ['Review transcript manually'],
        sentiment: 'Neutral', dealScore: 50
      };
    }

    const record = {
      id: `call-${Date.now()}`,
      timestamp: new Date().toISOString(),
      channel: 'browser',
      customerName: 'Prospective Customer',
      company: 'High-Growth Enterprise',
      product: productRef.current?.name || 'DevPulse AI',
      language: languageRef.current,
      duration: durationRef.current,
      status: summary.status || 'Follow-up Required',
      recordingUrl,
      transcript: transcriptRef.current,
      summary
    };

    try {
      await api.saveCall(record);
      // Fire-and-forget CRM capture; visible in Leads page once it lands.
      api.extractLead(record.id).catch(() => {});
    } catch (err) {
      onError?.(`Call was not persisted: ${err.message}`, 'error');
    }

    setLastCall({ ...record, _audioBlob: blob });
    onCallSaved?.(record);
    setStatus('idle');
    setTranscript([]);
    transcriptRef.current = [];
  }, [onCallSaved, onError]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (prev) {
        if (statusRef.current === 'listening') speechService.startListening();
        return false;
      }
      speechService.stopListening();
      return true;
    });
  }, []);

  const sendTyped = useCallback((text) => handleCustomerInput(text), [handleCustomerInput]);

  // Cleanup if the page unmounts mid-call.
  useEffect(() => () => { speechService.destroy(); callRecorder.cleanup?.(); }, []);

  return {
    status, duration, transcript, interimText, isMuted, lastCall,
    startCall, endCall, toggleMute, sendTyped,
    setLastCall
  };
}
