// Single source of truth for every environment variable and filesystem path.
// Loads backend/.env by absolute path, so it works from any working directory
// and before any other module reads process.env.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SRC_DIR = path.resolve(HERE, '..');
export const BACKEND_ROOT = path.resolve(SRC_DIR, '..');
export const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const positiveInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const enabled = (value, fallback) =>
  value === undefined || value === '' ? fallback : value === 'true' || value === '1';

// DATA_DIR / RECORDINGS_DIR let a hosted filesystem (Render persistent disk)
// own the files; they default to the folders inside the repo.
const located = (envName, fallback) =>
  process.env[envName] ? path.resolve(process.env[envName]) : fallback;

export const paths = {
  src: SRC_DIR,
  data: located('DATA_DIR', path.join(SRC_DIR, 'data')),
  recordings: located('RECORDINGS_DIR', path.join(SRC_DIR, 'recordings')),
  frontendDist: path.join(PROJECT_ROOT, 'frontend', 'dist')
};

export const serverConfig = {
  env: process.env.NODE_ENV || 'development',
  port: positiveInt(process.env.PORT, 3001),
  bodyLimit: process.env.BODY_LIMIT || '50mb',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Local convenience only: in a split deployment the SPA is hosted separately
  // and this directory simply won't exist next to the backend.
  serveFrontend: enabled(process.env.SERVE_FRONTEND, true)
    && fs.existsSync(path.join(paths.frontendDist, 'index.html'))
};

export const groqConfig = {
  chatModel: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
  sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
  ttsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
  ttsVoice: process.env.GROQ_TTS_VOICE || 'troy',
  apiKey: () => (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) || null
};

// Read at call time, not module load, so telephony can be constructed (and
// unit-tested) under different environments in one process.
export const twilioConfig = () => ({
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  validate: (process.env.TWILIO_VALIDATE ?? 'true') !== 'false',
  maxCallMinutes: positiveInt(process.env.MAX_CALL_MINUTES, 15),
  // Ask Twilio to report live progress of each call.
  statusCallback: enabled(process.env.TWILIO_STATUS_CALLBACK, true),
  maxConcurrentCalls: positiveInt(process.env.TWILIO_MAX_CONCURRENT_CALLS, 3)
});

// What the phone feature can actually do right now, with the reason when it
// can't. Inbound needs only the API credentials (the number's webhook is set in
// the Twilio console); outbound dialing additionally needs the sender number and
// a public URL for Twilio to send audio and callbacks to.
export function twilioReadiness() {
  const c = twilioConfig();
  const need = (names) => names.filter(([, v]) => !v).map(([k]) => k);
  const credentials = [
    ['TWILIO_ACCOUNT_SID', c.accountSid],
    ['TWILIO_AUTH_TOKEN', c.authToken]
  ];
  const dialing = [
    ...credentials,
    ['TWILIO_PHONE_NUMBER', c.phoneNumber],
    ['PUBLIC_BASE_URL', c.publicBaseUrl]
  ];
  const inboundMissing = need(credentials);
  const dialMissing = need(dialing);
  return {
    mode: dialMissing.length ? 'off' : 'live',
    inboundReady: inboundMissing.length === 0,
    dialReady: dialMissing.length === 0,
    inboundMissing,
    dialMissing,
    aiReady: Boolean(groqConfig.apiKey()),
    webhookUrl: c.publicBaseUrl ? `${c.publicBaseUrl}/api/twilio/voice` : null,
    eventsUrl: c.publicBaseUrl ? `${c.publicBaseUrl}/api/twilio/events` : null,
    phoneNumber: c.phoneNumber || null,
    publicBaseUrl: c.publicBaseUrl || null,
    validate: c.validate,
    statusCallback: c.statusCallback,
    maxCallMinutes: c.maxCallMinutes,
    maxConcurrentCalls: c.maxConcurrentCalls
  };
}

export function ensureDataDirs() {
  for (const dir of [paths.data, paths.recordings]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}
