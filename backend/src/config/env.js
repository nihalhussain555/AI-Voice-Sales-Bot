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

// Sessions ride on cookies, so a credentialed CORS response must echo an exact
// origin — '*' is illegal together with Access-Control-Allow-Credentials and the
// browser rejects it anyway. An unset/wildcard CORS_ORIGIN therefore means
// "same-origin only", which is how local dev (Vite proxy) and single-port
// deploys already work; a split frontend must list its origin explicitly.
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsOriginAllowed(origin) {
  if (!origin) return false;
  if (serverConfig.env !== 'production' && DEV_ORIGIN_RE.test(origin)) return true;
  if (serverConfig.corsOrigin === '*') return false;
  return serverConfig.corsOrigin
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .includes(origin.replace(/\/+$/, ''));
}

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

// ── Authentication ──────────────────────────────────────────────────────────
// Sessions are opaque random tokens (never JWTs) so they can be revoked
// immediately; only a SHA-256 hash of the token is stored, so a data-file leak
// cannot be replayed against the API.
export const SESSION_COOKIE = 'vp_session';

const duration = (value, fallbackMs) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60000) : fallbackMs;
};

export const authConfig = {
  // Idle window: an active session is extended while it is used.
  sessionTtlMs: duration(process.env.SESSION_TTL_MINUTES, 12 * 60 * 60 * 1000),
  // "Remember me" gets a longer idle window, still revoked on logout/password change.
  rememberTtlMs: duration(process.env.REMEMBER_TTL_MINUTES, 30 * 24 * 60 * 60 * 1000),
  resetTtlMs: duration(process.env.RESET_TTL_MINUTES, 30 * 60 * 1000),
  cookieName: SESSION_COOKIE,
  // 'lax' blocks the cookie on cross-site XHR (CSRF) and is what same-origin
  // dev and single-port deploys need. Only set 'none' for a split-domain
  // deployment, and only over HTTPS — 'none' without Secure is rejected.
  cookieSameSite: ['lax', 'strict', 'none'].includes(process.env.COOKIE_SAME_SITE)
    ? process.env.COOKIE_SAME_SITE
    : 'lax',
  cookieSecure: enabled(process.env.COOKIE_SECURE, (process.env.NODE_ENV || 'development') === 'production'),
  maxUsers: positiveInt(process.env.MAX_USERS, 0), // 0 = unlimited
  passwordMinLength: positiveInt(process.env.PASSWORD_MIN_LENGTH, 8),
  // Login throttling per email+IP, and looser per-IP limits for signup and
  // password-reset requests. The env vars are minutes; the fallbacks are already
  // milliseconds, matching duration()'s contract.
  loginWindowMs: duration(process.env.LOGIN_RATE_WINDOW_MINUTES, 15 * 60 * 1000),
  loginMax: positiveInt(process.env.LOGIN_RATE_MAX, 8),
  signupWindowMs: duration(process.env.SIGNUP_RATE_WINDOW_MINUTES, 60 * 60 * 1000),
  signupMax: positiveInt(process.env.SIGNUP_RATE_MAX, 10),
  forgotWindowMs: duration(process.env.FORGOT_RATE_WINDOW_MINUTES, 15 * 60 * 1000),
  forgotMax: positiveInt(process.env.FORGOT_RATE_MAX, 5)
};

// Password-reset mail. Without SMTP the reset flow still mints a real, stored,
// single-use token — it just cannot be delivered, so the API reports a
// configuration error instead of pretending an email went out.
export const mailConfig = () => ({
  host: process.env.SMTP_HOST || '',
  port: positiveInt(process.env.SMTP_PORT, 587),
  secure: enabled(process.env.SMTP_SECURE, false),
  user: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASSWORD || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || 'VoicePitch AI <no-reply@voicepitch.local>',
  // Where a reset link points. Falls back to the Twilio public URL, then the
  // local dev server, so the flow is testable without extra configuration.
  appBaseUrl: (process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  // Development convenience only: prints the reset link to the server console
  // when there is no SMTP transport. Never included in an HTTP response.
  echoInConsole: enabled(process.env.AUTH_ECHO_RESET_LINK, (process.env.NODE_ENV || 'development') !== 'production')
});

export function mailConfigured() {
  const m = mailConfig();
  return Boolean(m.host && m.from);
}

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
