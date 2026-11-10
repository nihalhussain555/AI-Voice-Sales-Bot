// Twilio phone telephony: inbound voice webhook, Media Streams websocket audio
// pipeline (VAD -> STT -> sales turn -> TTS with barge-in), click-to-call,
// and call persistence into the shared calls DB.

import express from 'express';
import { WebSocketServer } from 'ws';
import Twilio from 'twilio';
import { groqTranscribe, groqTts } from './groqClient.js';
import { generateTurn, resolveProduct } from './salesTurn.js';
import { generateConversationSummary } from './summarizer.js';
import { db } from '../models/db.js';
import { groqConfig, twilioConfig } from '../config/env.js';
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

// ---------------------------------------------------------------------------
// createTelephony
// ---------------------------------------------------------------------------
export function createTelephony() {
  const {
    accountSid,
    authToken,
    phoneNumber,
    publicBaseUrl,
    validate: doValidate,
    maxCallMinutes
  } = twilioConfig();
  const twilioConfigured = Boolean(accountSid && authToken);

  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  // Pending inbound call metadata pushed by the /voice webhook, consumed FIFO
  // by arriving media-stream websockets.
  const pendingCalls = [];
  // callSid -> live session
  const sessions = new Map();
  let lastIncomingMeta = null;

  const notConfigured = (req, res) =>
    res.status(501).json({ error: 'Telephony not configured — set TWILIO_* env vars' });

  // ------------------------------------------------------------------ routes

  router.post('/api/twilio/voice', (req, res) => {
    if (!twilioConfigured) return notConfigured(req, res);
    try {
      const signature = req.headers['x-twilio-signature'];
      if (doValidate && publicBaseUrl) {
        const url = `${publicBaseUrl}/api/twilio/voice`;
        let valid = false;
        try {
          valid = Twilio.validateRequest(authToken, signature, url, req.body || {});
        } catch (err) {
          logErr('signature validation threw:', err.message);
        }
        if (!valid) {
          log('rejected voice webhook: bad or missing X-Twilio-Signature');
          return res.status(403).type('text/plain').send('Invalid Twilio signature');
        }
      }

      const callSid = req.body.CallSid;
      const meta = {
        callSid,
        from: req.body.From || '',
        to: req.body.To || phoneNumber,
        customerName: req.body.CustomerName || (req.body.From ? `Caller ${req.body.From}` : 'Phone prospect'),
        queuedAt: Date.now()
      };
      if (callSid) {
        pendingCalls.push(meta);
        lastIncomingMeta = meta;
        // Expire metadata whose websocket never arrived.
        setTimeout(() => {
          const idx = pendingCalls.indexOf(meta);
          if (idx !== -1) pendingCalls.splice(idx, 1);
        }, 30000).unref();
      }

      const vr = new Twilio.twiml.VoiceResponse();
      const connect = vr.connect();
      connect.stream({ url: mediaStreamUrl(req) });
      return res.type('text/xml').send(vr.toString());
    } catch (err) {
      logErr('voice webhook error:', err);
      return res.status(500).type('text/plain').send('Voice webhook error');
    }
  });

  router.post('/api/twilio/status', async (req, res) => {
    if (!twilioConfigured) return notConfigured(req, res);
    try {
      const { CallSid, CallStatus, Direction, CallDuration } = req.body || {};
      log(`status callback: ${CallStatus} dir=${Direction} sid=${CallSid} duration=${CallDuration}`);
      const session = (CallSid && sessions.get(CallSid)) || lastIncomingMeta && sessions.get(lastIncomingMeta.callSid);
      if (session && ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
        await finalizeSession(session, 'status-callback');
      }
      return res.status(200).type('text/xml').send('<Response/>');
    } catch (err) {
      logErr('status callback error:', err);
      return res.status(200).type('text/xml').send('<Response/>');
    }
  });

  router.get('/api/twilio/status', (req, res) => {
    if (!twilioConfigured) return res.json({ configured: false });
    return res.json({
      configured: true,
      phoneNumber: phoneNumber || null,
      webhookHint: publicBaseUrl ? `${publicBaseUrl}/api/twilio/voice` : null,
      activeCalls: sessions.size
    });
  });

  router.post('/api/twilio/call-out', async (req, res) => {
    if (!twilioConfigured) return notConfigured(req, res);
    try {
      const to = (req.body && req.body.to || '').trim();
      if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });
      const webhook = publicBaseUrl ? `${publicBaseUrl}/api/twilio/voice` : null;
      if (!webhook) return res.status(500).json({ error: 'PUBLIC_BASE_URL not configured — Twilio needs a public voice webhook URL' });
      if (!phoneNumber) return res.status(500).json({ error: 'TWILIO_PHONE_NUMBER not configured' });

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const form = new URLSearchParams({ To: to, From: phoneNumber, Url: webhook });
      const twRes = await fetch(
        `https://api.twilio.com/2019-07-31/Accounts/${encodeURIComponent(accountSid)}/Calls.json`,
        { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() }
      );
      const text = await twRes.text().catch(() => '');
      if (!twRes.ok) {
        logErr(`call-out failed (${twRes.status}): ${text.slice(0, 300)}`);
        return res.status(502).json({ error: 'Twilio rejected the outbound call', detail: text.slice(0, 300) });
      }
      const data = JSON.parse(text);
      log(`call-out placed: ${data.sid} to ${to}`);
      return res.json({ ok: true, callSid: data.sid, from: phoneNumber, to });
    } catch (err) {
      logErr('call-out error:', err);
      return res.status(500).json({ error: 'Outbound call failed' });
    }
  });

  function mediaStreamUrl(req) {
    // PUBLIC_BASE_URL host wins; fall back to the request host for LAN/demo use.
    const base = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
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
    // Associate this websocket with the most recent unassigned inbound call.
    // LIMITATION: TwiML <Stream> cannot carry a callSid query param, so the
    // webhook->socket pairing is FIFO by arrival order. That is reliable for a
    // demo with low concurrency, but two inbound calls racing could cross tags.
    const meta = pendingCalls.shift() || lastIncomingMeta || { callSid: null, from: '', to: '' };
    const state = {
      ws,
      callSid: meta.callSid,
      from: meta.from,
      to: meta.to,
      customerName: meta.customerName,
      startedAt: Date.now(),
      vad: new EnergyVad({ sampleRate: 8000 }),
      transcript: [],
      productKey: PRODUCT_KEY,
      playing: false,
      playTimer: null,
      busy: false,
      speakChain: Promise.resolve(),
      lookback: [],
      finalized: false,
      maxTimer: null,
      pendingTtsBuffer: null
    };
    if (state.callSid) sessions.set(state.callSid, state);
    log(`media websocket connected for call ${state.callSid || '(unassigned)'}`);

    ws.on('message', (raw) => {
      handleWsMessage(state, raw).catch((err) => logErr('ws message error:', err));
    });
    ws.on('close', () => {
      clearInterval(state.playTimer);
      state.playTimer = null;
      clearTimeout(state.maxTimer);
      finalizeSession(state, 'ws-close').catch((err) => logErr('finalize error:', err));
      if (state.callSid) sessions.delete(state.callSid);
    });
    ws.on('error', (err) => logErr('ws error:', err.message));
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
      case 'start':
        state.startedAt = Date.now();
        startMaxCallTimer(state);
        await speak(state, greetingText(state));
        break;
      case 'media':
        handleMediaChunk(state, msg.media && msg.media.chunk);
        break;
      case 'stop':
        clearInterval(state.playTimer);
        state.playTimer = null;
        await finalizeSession(state, 'stop-event');
        break;
      case 'mark':
      default:
        break;
    }
  }

  function startMaxCallTimer(state) {
    const ms = Math.max(1, maxCallMinutes) * 60000;
    state.maxTimer = setTimeout(() => {
      log(`call ${state.callSid} hit MAX_CALL_MINUTES, wrapping up`);
      sendJson(state.ws, { event: 'clear' });
      speak(state, 'I need to let you go now. Thanks for your time!')
        .finally(() => setTimeout(() => { try { state.ws.close(); } catch { /* ignore */ } }, 800));
    }, ms);
    state.maxTimer.unref();
  }

  async function greetingText(state) {
    try {
      const { reply } = await generateTurn({
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
          clearInterval(state.playTimer);
          state.playTimer = null;
          state.playing = false;
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
      if (!key) {
        log('no GROQ_API_KEY — apologizing and ending the call');
        await speak(state, 'Sorry, our voice assistant is not available right now. Goodbye.');
        try { state.ws.close(); } catch { /* ignore */ }
        return;
      }

      const trimmed = trimSilence(utterancePcm, state.vad.gate, 8000, 200);
      if (trimmed.length < 800) return; // <100ms: noise, not speech

      let text = '';
      try {
        text = await groqTranscribe({ apiKey: key, audioBuffer: buildWav(trimmed, 8000), filename: 'utterance.wav' });
      } catch (err) {
        logErr('STT failed:', err.message);
        return;
      }
      if (!text || !text.trim()) return;

      state.transcript.push({ sender: 'customer', text: text.trim(), time: callTime(state) });
      log(`call ${state.callSid} caller: ${text.trim()}`);

      let reply = FALLBACK_REPLY;
      try {
        const turn = await generateTurn({
          message: text.trim(),
          history: state.transcript.slice(0, -1),
          productKey: state.productKey,
          language: 'English',
          apiKey: null
        });
        reply = turn.reply;
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
      const wav = await groqTts({ apiKey: key, text });
      const { pcm, sampleRate } = parseWav(wav);
      const pcm8k = resampleLinear(pcm, sampleRate, 8000);
      chunks = to8kMulawChunks(pcm8k, 8000, CHUNK_SAMPLES);
    } catch (err) {
      logErr('TTS pipeline failed:', err.message);
      return;
    }
    if (!chunks.length) return;

    state.pendingTtsBuffer = wav; // most recent bot audio, kept for future recording upload
    state.playing = true;
    state.vad.reset();
    state.lookback = [];
    sendMark(state, 'speak-start');
    sendJson(state.ws, { event: 'clear' }); // drop stale caller audio before talking

    await new Promise((resolve) => {
      let i = 0;
      state.playTimer = setInterval(() => {
        try {
          if (state.ws.readyState !== 1) { clearInterval(state.playTimer); state.playTimer = null; resolve(); return; }
          if (i >= chunks.length) {
            clearInterval(state.playTimer);
            state.playTimer = null;
            state.playing = false;
            sendMark(state, 'speak-end');
            resolve();
            return;
          }
          sendJson(state.ws, { event: 'media', media: { chunk: chunks[i].toString('base64') } });
          i++;
        } catch (err) {
          clearInterval(state.playTimer);
          state.playTimer = null;
          state.playing = false;
          resolve();
        }
      }, 20);
    });
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

  async function finalizeSession(state, reason) {
    if (state.finalized) return;
    state.finalized = true;
    if (state.transcript.length <= 1) {
      log(`call ${state.callSid || '(none)'} ended (${reason}) with no real conversation — not persisted`);
      return;
    }
    try {
      const duration = Math.floor((Date.now() - state.startedAt) / 1000);
      const product = resolveProduct(state.productKey, null);
      const productName = product && product.name ? product.name : 'DevPulse AI';
      const summary = await generateConversationSummary({
        transcript: state.transcript,
        product: productName,
        apiKey: serverApiKey()
      });
      const saved = db.saveCall({
        id: `call-phone-${Date.now()}`,
        channel: 'phone',
        customerName: state.customerName || 'Phone prospect',
        company: '—',
        from: state.from,
        to: state.to,
        language: 'English',
        product: productName,
        duration,
        status: summary.status,
        transcript: state.transcript,
        summary,
        recordingUrl: null
      });
      log(`call ${state.callSid} persisted (${reason}) id=${saved.id} status=${summary.status} turns=${state.transcript.length}`);
    } catch (err) {
      logErr('failed to persist call:', err);
    }
  }

  return { router, attachWebSocket, twilioConfigured };
}
