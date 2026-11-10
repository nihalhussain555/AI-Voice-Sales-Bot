// Twilio-facing half of phone calling: the inbound voice webhook, the Media
// Streams websocket audio pipeline (VAD -> STT -> sales turn -> TTS with
// barge-in), and Twilio's call-status callbacks.
//
// Call state and persistence are NOT decided here — they live in callLifecycle,
// which both this module and the app-facing phoneService share. This module only
// produces transcripts and reports what it observed.

import express from 'express';
import { WebSocketServer } from 'ws';
import { twilioConfig, twilioReadiness, groqConfig } from '../config/env.js';
import { groqTranscribe, groqTts } from './groqClient.js';
import { generateTurn } from './salesTurn.js';
import { buildConnectTwiML, validateSignature } from './twilioClient.js';
import { OUTCOME } from '../utils/phone.js';
import {
  mulawBufferToLinear,
  buildWav,
  parseWav,
  resampleLinear,
  to8kMulawChunks,
  rmsEnergy
} from '../utils/audioCodecs.js';

const log = (...args) => console.log('[telephony]', ...args);
const logErr = (...args) => console.error('[telephony]', ...args);

const CHUNK_SAMPLES = 160; // 20ms at 8kHz
const LOOKBACK_CHUNKS = 15; // ~300ms of recent audio kept during playback
const PRODUCT_KEY = 'devpulse';
const FALLBACK_REPLY = 'Sorry, I am having trouble connecting. Please try again.';
// After the audio stream ends we wait this long for Twilio's own terminal
// callback (which carries busy / no-answer / canceled), and only then infer.
const TERMINAL_GRACE_MS = 2500;

function serverApiKey() {
  return groqConfig.apiKey();
}

// ---------------------------------------------------------------------------
// Energy VAD: segments caller speech into utterances on trailing silence.
// Exported for tests; gate is directly configurable (adaptive noise-floor
// tracking stays off whenever an explicit gate is supplied).
// ---------------------------------------------------------------------------
export class EnergyVad {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 8000;
    this.baseGate = opts.gate ?? 500;
    this.explicitGate = opts.gate != null;
    this.gate = this.baseGate;
    this.gateMult = opts.gateMult ?? 4;
    this.minGate = opts.minGate ?? 300;
    this.silenceMs = opts.silenceMs ?? 800;
    this.minSpeechMs = opts.minSpeechMs ?? 500;
    this.maxSilenceMs = opts.maxSilenceMs ?? 3000;
    this.noiseSamples = opts.noiseSamples ?? 40;
    this.noiseChunks = opts.noiseChunks ?? 5;
    this.noiseFloor = this.baseGate;
    this.noiseWindow = [];
    this.samples = [];
    this.total = 0;
    this.speechEnd = 0; // samples collected up to the last voiced chunk
    this.inSpeech = false;
    this.silenceRun = 0;
    this.lastRms = 0;
    this.loudRun = 0;
    this.silentRun = 0;
  }

  rms(chunk) {
    return rmsEnergy(chunk);
  }

  // Feed one Int16Array chunk. Returns the flushed utterance (Int16Array) when
  // trailing silence closes a speech segment, otherwise null.
  pushSample(chunk) {
    const chunkLen = chunk && chunk.length ? chunk.length : 1;
    const energy = rmsEnergy(chunk);
    this.lastRms = energy;
    this._trackNoise(energy, chunk.length);
    if (!this.explicitGate) {
      this.gate = Math.max(this.minGate, Math.min(this.baseGate, this.noiseFloor * this.gateMult));
    }

    if (energy >= this.gate) {
      this.loudRun++;
      this.silentRun = 0;
      this.silenceRun = 0;
      this.inSpeech = true;
      this.samples.push(chunk);
      this.total += chunk.length;
      this.speechEnd = this.total;
    } else if (this.inSpeech) {
      this.silentRun++;
      // Keep trailing silence in the utterance; trimming happens before STT.
      this.samples.push(chunk);
      this.total += chunk.length;
      this.silenceRun += chunkLen;
      if (this.silenceRun >= (this.silenceMs * this.sampleRate) / 1000 &&
          this.speechEnd >= (this.minSpeechMs * this.sampleRate) / 1000) {
        return this.flush();
      }
      // A long quiet tail after a too-short blip is noise, not an utterance.
      if (this.silenceRun >= (this.maxSilenceMs * this.sampleRate) / 1000) this.reset();
    }
    return null;
  }

  // Mid-speech snapshot for barge-in recovery: hand back the samples collected
  // so far without requiring the silence window to complete.
  flush() {
    const out = this._joined();
    this.reset();
    return out;
  }

  reset() {
    this.samples = [];
    this.total = 0;
    this.speechEnd = 0;
    this.inSpeech = false;
    this.silenceRun = 0;
    this.silentRun = 0;
    this.loudRun = 0;
  }

  _joined() {
    const out = new Int16Array(this.total);
    let off = 0;
    for (const arr of this.samples) {
      out.set(arr, off);
      off += arr.length;
    }
    return out;
  }

  // Noise floor = mean of the quietest few non-speech chunks.
  _trackNoise(energy, chunkLen) {
    if (this.explicitGate) return;
    if (this.inSpeech || chunkLen === 0) return;
    this.noiseWindow.push(energy);
    if (this.noiseWindow.length > this.noiseSamples) this.noiseWindow.shift();
    if (this.noiseWindow.length >= this.noiseChunks) {
      const sorted = [...this.noiseWindow].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 0; i < this.noiseChunks; i++) sum += sorted[i];
      this.noiseFloor = sum / this.noiseChunks;
    }
  }
}

// Drop the first/last low-energy ~silenceMs window of an utterance.
function trimSilence(pcm, gate, sampleRate, silenceMs = 200) {
  const win = Math.max(1, Math.floor((silenceMs * sampleRate) / 1000));
  let start = 0;
  let end = pcm.length;
  while (start + win <= end && rmsEnergy(pcm.subarray(start, start + win)) < gate) start += win;
  while (end - win >= start && rmsEnergy(pcm.subarray(end - win, end)) < gate) end -= win;
  return pcm.slice(start, end);
}

function sayAndHangup(message) {
  const safe = String(message).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${safe}</Say><Hangup/></Response>`;
}

// ---------------------------------------------------------------------------
// createTelephony
// providers exists so the audio pipeline can be exercised without network
// access; production always uses the real Groq functions.
// ---------------------------------------------------------------------------
export function createTelephony({ lifecycle, providers } = {}) {
  if (!lifecycle) throw new Error('createTelephony requires a callLifecycle instance');
  const {
    transcribe = groqTranscribe,
    tts = groqTts,
    turn = generateTurn
  } = providers || {};

  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  // Inbound call metadata from the /voice webhook, used only if the websocket's
  // own start parameters are missing (old TwiML, or a stream we did not create).
  const pendingCalls = [];
  const sockets = new Set();

  const notConfigured = (req, res) =>
    res.status(501).json({ error: 'Telephony not configured — set TWILIO_* env vars' });

  // ------------------------------------------------------------------ routes

  router.post('/api/twilio/voice', (req, res) => {
    const cfg = twilioConfig();
    if (!cfg.accountSid || !cfg.authToken) return notConfigured(req, res);
    try {
      const signature = req.headers['x-twilio-signature'];
      const url = cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/twilio/voice` : null;
      const sig = url ? validateSignature({ url, signature }) : { checked: false, valid: true };
      if (sig.checked && !sig.valid) {
        log('rejected voice webhook: bad or missing X-Twilio-Signature');
        return res.status(403).type('text/plain').send('Invalid Twilio signature');
      }

      const callSid = req.body.CallSid || null;
      const from = req.body.From || '';
      const to = req.body.To || cfg.phoneNumber;
      const customerName = req.body.CustomerName || (from ? `Caller ${from}` : 'Phone prospect');
      const ready = twilioReadiness();

      // No AI key means no speech-to-text and no text-to-speech: tell the caller
      // instead of letting the line go silent, and log the failed attempt.
      if (!ready.aiReady) {
        logErr('inbound call rejected: GROQ_API_KEY is not configured');
        lifecycle.startAttempt({ callSid, direction: 'inbound', from, to, customerName, productKey: PRODUCT_KEY });
        lifecycle.finalize(callSid, OUTCOME.FAILED, 'no-ai-key');
        return res.type('text/xml').send(sayAndHangup(
          'Our voice assistant is temporarily unavailable. Please try again later. Goodbye.'
        ));
      }

      if (!lifecycle.hasCapacity()) {
        log(`inbound call ${callSid} refused: at capacity`);
        lifecycle.startAttempt({ callSid, direction: 'inbound', from, to, customerName, productKey: PRODUCT_KEY });
        lifecycle.finalize(callSid, OUTCOME.BUSY, 'over-capacity');
        return res.type('text/xml').send(sayAndHangup(
          'All our agents are on another call right now. Please try again in a moment. Goodbye.'
        ));
      }

      const meta = { callSid, from, to, customerName, productKey: PRODUCT_KEY, queuedAt: Date.now() };
      if (callSid) {
        pendingCalls.push(meta);
        lifecycle.startAttempt({ ...meta, direction: 'inbound' });
        setTimeout(() => {
          const idx = pendingCalls.indexOf(meta);
          if (idx !== -1) pendingCalls.splice(idx, 1);
        }, 30000).unref();
      }

      return res.type('text/xml').send(buildConnectTwiML({
        wsUrl: mediaStreamUrl(req),
        eventsUrl: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/twilio/events` : null,
        callSid,
        extraParams: { direction: 'inbound', from, to }
      }));
    } catch (err) {
      logErr('voice webhook error:', err);
      return res.status(500).type('text/xml').send(sayAndHangup('Sorry, something went wrong. Goodbye.'));
    }
  });

  // Call progress: StatusCallback (CallStatus), the <Connect action> (leg end
  // status + ConnectFailReason) and any stream status all land here.
  router.post('/api/twilio/events', async (req, res) => {
    const cfg = twilioConfig();
    if (!cfg.accountSid || !cfg.authToken) return notConfigured(req, res);
    try {
      const signature = req.headers['x-twilio-signature'];
      const url = cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/twilio/events` : null;
      const sig = url ? validateSignature({ url, signature }) : { checked: false, valid: true };
      if (sig.checked && !sig.valid) {
        // Do not discard status over a signature mismatch (a changed tunnel URL
        // is the common cause); the call-controlling webhook stays strict.
        logErr('status callback signature mismatch — processing anyway:', sig.error || 'invalid');
      }
      const params = req.body || {};
      log(`status callback: CallStatus=${params.CallStatus} ConnectStatus=${params.ConnectStatus} ` +
        `ErrorCode=${params.ErrorCode || ''} sid=${params.CallSid}`);
      const attempt = await lifecycle.applyParams(params, { source: params.ConnectStatus ? 'connect-action' : 'status-callback' });
      if (attempt?.terminal) {
        for (const s of sockets) {
          if (s.callSid === attempt.callSid || (attempt.callSid && s.keys?.includes(attempt.callSid))) {
            s.closeSocket?.('twilio reported call ended');
          }
        }
      }
      return res.status(200).type('text/xml').send('<Response/>');
    } catch (err) {
      logErr('status callback error:', err);
      return res.status(200).type('text/xml').send('<Response/>');
    }
  });

  router.get('/api/twilio/status', (req, res) => {
    const ready = twilioReadiness();
    res.json({
      configured: ready.inboundReady,
      mode: ready.mode,
      phoneNumber: ready.phoneNumber,
      webhookUrl: ready.webhookUrl,
      eventsUrl: ready.eventsUrl,
      missing: ready.dialMissing,
      aiReady: ready.aiReady,
      activeCalls: lifecycle.activeCount()
    });
  });

  function mediaStreamUrl(req) {
    // PUBLIC_BASE_URL host wins; fall back to the request host for LAN/testing.
    const base = twilioConfig().publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    const wsBase = base.startsWith('https')
      ? base.replace(/^https/, 'wss')
      : base.replace(/^http/, 'ws');
    return `${wsBase}/ws/media`;
  }

  // ------------------------------------------------------------ websocket side

  function attachWebSocket(httpServer) {
    if (!httpServer) return;
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (req, socket, head) => {
      let pathname = '';
      try {
        pathname = new URL(req.url, 'http://localhost').pathname;
      } catch { /* ignore */ }
      if (pathname !== '/ws/media') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
    wss.on('connection', (ws) => handleMediaSocket(ws));
  }

  function handleMediaSocket(ws) {
    const state = {
      ws,
      callSid: null,
      keys: [],
      from: '',
      to: '',
      customerName: null,
      productKey: PRODUCT_KEY,
      startedAt: Date.now(),
      vad: new EnergyVad({ sampleRate: 8000 }),
      transcript: [],
      playing: false,
      playTimer: null,
      playResolve: null,
      closeTimer: null,
      busy: false,
      speakChain: Promise.resolve(),
      lookback: [],
      maxTimer: null,
      ended: false,
      streamSid: null,
      closeSocket: (why) => {
        try { ws.close(); } catch { /* ignore */ }
        if (why) log(`socket closed for ${state.callSid}: ${why}`);
      },
      getTranscript: () => state.transcript
    };
    sockets.add(state);
    log('media websocket opened');

    ws.on('message', (raw) => {
      handleWsMessage(state, raw).catch((err) => logErr('ws message error:', err));
    });
    ws.on('close', () => {
      haltPlayback(state);
      clearTimeout(state.maxTimer);
      state.maxTimer = null;
      endStream(state, 'ws-close');
      sockets.delete(state);
    });
    ws.on('error', (err) => logErr('ws error:', err.message));
  }

  // Bind this socket to its call attempt. TwiML <Parameter> values arrive in the
  // start event, which is the reliable pairing route; the webhook FIFO queue is
  // only a fallback for streams that carry no parameters.
  function identifyStream(state, msg) {
    const params = (msg.start && msg.start.parameters) || {};
    const streamCallSid = msg.start?.callSid || null;
    const cfg = twilioConfig();
    const keys = [params.dialToken, params.callSid, streamCallSid].filter(Boolean);

    if (!keys.length && pendingCalls.length) {
      const meta = pendingCalls.shift();
      keys.push(meta.callSid);
      state.from = meta.from;
      state.to = meta.to;
      state.customerName = meta.customerName;
      state.productKey = meta.productKey || PRODUCT_KEY;
    }

    state.keys = keys;
    state.callSid = streamCallSid || keys[0] || null;
    if (params.direction === 'inbound') {
      state.from = params.from || state.from;
      state.to = params.to || state.to;
    }

    let attempt = lifecycle.get(keys);
    if (attempt && streamCallSid && attempt.callSid !== streamCallSid) {
      // Outbound dials are registered under the token that rode inside the TwiML;
      // now that the real CallSid is known, adopt it so every later callback
      // (always keyed by CallSid) resolves to this same attempt.
      lifecycle.rekey(attempt.callSid, streamCallSid);
      keys.push(streamCallSid);
      attempt = lifecycle.get(streamCallSid);
    }
    if (!attempt) {
      attempt = lifecycle.startAttempt({
        callSid: state.callSid,
        direction: params.direction === 'inbound' ? 'inbound' : 'outbound',
        from: params.from || state.from || '',
        to: params.to || state.to,
        productKey: params.productKey || state.productKey,
        customerName: state.customerName || (params.from ? `Caller ${params.from}` : 'Phone prospect')
      });
      if (state.callSid && state.callSid !== attempt.callSid) keys.push(attempt.callSid, state.callSid);
    }
    if (attempt) {
      state.customerName = state.customerName || attempt.customerName;
      state.productKey = params.productKey || attempt.productKey || PRODUCT_KEY;
      lifecycle.bindSession([...keys, attempt.callSid], {
        getTranscript: state.getTranscript,
        closeSocket: state.closeSocket,
        streamSid: msg.streamSid || null
      });
      state.keys = [...new Set([...keys, attempt.callSid])];
    }
    log(`media stream ${msg.streamSid || '(no sid)'} bound to call ${state.callSid || '(unidentified)'}`);
  }

  function endStream(state, reason) {
    if (state.ended) return;
    state.ended = true;
    clearTimeout(state.closeTimer);
    // Twilio's own terminal callback usually beats us here with the real reason
    // (busy/no-answer/canceled), so wait briefly before inferring from the audio.
    state.closeTimer = setTimeout(() => {
      if (lifecycle.get(state.keys)?.terminal) return;
      const spoken = state.transcript.filter((m) => m && m.text).length > 1;
      lifecycle.noteOutcome(state.keys, spoken ? OUTCOME.COMPLETED : OUTCOME.UNKNOWN, reason);
    }, TERMINAL_GRACE_MS);
    state.closeTimer.unref?.();
  }

  async function handleWsMessage(state, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.event) {
      case 'connected':
        sendJson(state.ws, { event: 'connected' }); // required echo per Media Streams v1
        break;
      case 'start': {
        identifyStream(state, msg);
        state.startedAt = Date.now();
        lifecycle.noteConnected(state.keys);
        startMaxCallTimer(state);
        const greeting = await greetingText(state);
        // The agent's opening line belongs in the transcript (and therefore in the
        // call history and summary), not just in the audio.
        state.transcript.push({ sender: 'bot', text: greeting, time: callTime(state) });
        await speak(state, greeting);
        break;
      }
      case 'media':
        handleMediaChunk(state, msg.media && msg.media.chunk);
        break;
      case 'mark':
        break;
      case 'stop':
        haltPlayback(state);
        clearTimeout(state.maxTimer);
        state.maxTimer = null;
        endStream(state, 'stream-stop-event');
        break;
      default:
        break;
    }
  }

  function startMaxCallTimer(state) {
    const { maxCallMinutes } = twilioConfig();
    const ms = Math.max(1, maxCallMinutes) * 60000;
    state.maxTimer = setTimeout(() => {
      log(`call ${state.callSid} hit MAX_CALL_MINUTES, wrapping up`);
      sendJson(state.ws, { event: 'clear' });
      const bye = 'I need to let you go now. Thanks for your time!';
      state.transcript.push({ sender: 'bot', text: bye, time: callTime(state) });
      speak(state, bye)
        .finally(() => setTimeout(() => state.closeSocket('max call duration'), 800));
    }, ms);
    state.maxTimer.unref();
  }

  async function greetingText(state) {
    try {
      const { reply } = await turn({
        message: '', history: [], productKey: state.productKey, language: 'English', apiKey: null
      });
      return reply;
    } catch (err) {
      logErr('greeting generation failed:', err.message);
      return FALLBACK_REPLY;
    }
  }

  function handleMediaChunk(state, base64Chunk) {
    if (!base64Chunk) return;
    const pcm = mulawBufferToLinear(Buffer.from(base64Chunk, 'base64'));
    if (state.playing) {
      // Barge-in: only loud sustained caller audio interrupts playback.
      state.lookback.push(pcm);
      if (state.lookback.length > LOOKBACK_CHUNKS) state.lookback.shift();
      const energy = rmsEnergy(pcm);
      if (energy >= state.vad.gate) {
        state.vad.loudRun++;
        if (state.vad.loudRun >= 3 && !state.busy) {
          log(`barge-in detected in call ${state.callSid}`);
          haltPlayback(state);
          sendJson(state.ws, { event: 'clear' });
          // Rebuild the interrupted utterance from the lookback window so the
          // interrupting words are not lost.
          state.vad.reset();
          const lb = state.lookback;
          state.lookback = [];
          for (const c of lb) {
            const flushed = state.vad.pushSample(c);
            if (flushed) { onUtterance(state, flushed).catch((e) => logErr(e)); return; }
          }
        }
      } else {
        state.vad.loudRun = 0;
      }
      return;
    }
    if (state.busy) {
      // Still transcribing/answering the previous utterance: keep accumulating
      // caller speech (and trailing silence) instead of fragmenting it.
      const vad = state.vad;
      const voiced = rmsEnergy(pcm) >= vad.gate;
      if (voiced || vad.inSpeech) {
        vad.inSpeech = true;
        vad.samples.push(pcm);
        vad.total += pcm.length;
        if (voiced) {
          vad.speechEnd = vad.total;
          vad.silenceRun = 0;
        } else {
          vad.silenceRun += pcm.length;
        }
      }
      return;
    }
    const utterance = state.vad.pushSample(pcm);
    if (utterance) onUtterance(state, utterance).catch((err) => logErr('utterance error:', err));
  }

  async function onUtterance(state, utterancePcm) {
    state.busy = true;
    state.vad.reset();
    try {
      const key = serverApiKey();
      const trimmed = trimSilence(utterancePcm, state.vad.gate, 8000, 200);
      if (trimmed.length < 800) return; // <100ms: noise, not speech

      let text = '';
      try {
        text = await transcribe({ apiKey: key, audioBuffer: buildWav(trimmed, 8000), filename: 'utterance.wav' });
      } catch (err) {
        logErr('STT failed:', err.message);
        return;
      }
      if (!text || !text.trim()) return;

      state.transcript.push({ sender: 'customer', text: text.trim(), time: callTime(state) });
      log(`call ${state.callSid} caller: ${text.trim()}`);

      let reply = FALLBACK_REPLY;
      try {
        const t = await turn({
          message: text.trim(),
          history: state.transcript.slice(0, -1),
          productKey: state.productKey,
          language: 'English',
          apiKey: null
        });
        reply = t.reply;
      } catch (err) {
        logErr('turn generation failed:', err.message);
      }
      state.transcript.push({ sender: 'bot', text: reply, time: callTime(state) });
      await speak(state, reply);
    } finally {
      state.busy = false;
    }
  }

  // Serialize TTS calls, chain playback, pace chunks at 20ms.
  function speak(state, text) {
    const run = state.speakChain.then(() => playTts(state, text)).catch((err) => {
      logErr('speak failed:', err.message);
    });
    state.speakChain = run;
    return run;
  }

  async function playTts(state, text) {
    if (!text || !state.ws || state.ws.readyState !== 1) return;
    const key = serverApiKey();
    let chunks;
    try {
      const wav = await tts({ apiKey: key, text });
      const { pcm, sampleRate } = parseWav(wav);
      const pcm8k = resampleLinear(pcm, sampleRate, 8000);
      chunks = to8kMulawChunks(pcm8k, 8000, CHUNK_SAMPLES);
    } catch (err) {
      logErr('TTS pipeline failed:', err.message);
      return;
    }
    if (!chunks.length) return;

    state.playing = true;
    state.vad.reset();
    state.lookback = [];
    sendMark(state, 'speak-start');
    sendJson(state.ws, { event: 'clear' }); // drop stale caller audio before talking

    await new Promise((resolve) => {
      // The resolver is kept on the state so an interrupting caller (or a closed
      // socket) can settle it: otherwise the speak chain stays pending forever
      // and the agent can never speak again after a barge-in.
      state.playResolve = resolve;
      let i = 0;
      state.playTimer = setInterval(() => {
        if (state.ws.readyState !== 1 || i >= chunks.length) {
          const finished = i >= chunks.length && state.ws.readyState === 1;
          haltPlayback(state);
          if (finished) sendMark(state, 'speak-end');
          return;
        }
        sendJson(state.ws, { event: 'media', media: { chunk: chunks[i].toString('base64') } });
        i++;
      }, 20);
    });
  }

  // Stop the outbound audio pump. Never emits speak-end: playback was cut short.
  function haltPlayback(state) {
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
    }
    state.playing = false;
    const resolve = state.playResolve;
    state.playResolve = null;
    if (resolve) resolve();
  }

  let markCounter = 0;
  function sendMark(wsState, tag) {
    sendJson(wsState.ws, { event: 'mark', custom: `${tag}-${Date.now()}-${markCounter++}` });
  }

  function sendJson(ws, obj) {
    try {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch (err) {
      logErr('ws send failed:', err.message);
    }
  }

  function callTime(state) {
    const s = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const { accountSid, authToken } = twilioConfig();
  return {
    router,
    attachWebSocket,
    twilioConfigured: Boolean(accountSid && authToken),
    lifecycle
  };
}
