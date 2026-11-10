// Shared Groq API client (OpenAI-compatible surface).
// One module owns all Groq network access: chat, summarization JSON, STT, TTS.
// No SDK — plain fetch, so the runtime dependency footprint stays zero.

import { groqConfig } from '../config/env.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

// Verified production models (Nov 2026), overridable through backend/.env.
export const GROQ_CHAT_MODEL = groqConfig.chatModel;
export const GROQ_STT_MODEL = groqConfig.sttModel;
export const GROQ_TTS_MODEL = groqConfig.ttsModel;
export const GROQ_TTS_VOICE = groqConfig.ttsVoice;

// A key from the request body wins only if non-empty; otherwise fall back to env.
// This fixes the old bug where the client always sent apiKey:'' which shadowed env.
export function resolveApiKey(bodyKey) {
  if (typeof bodyKey === 'string' && bodyKey.trim()) return bodyKey.trim();
  return groqConfig.apiKey();
}

export function hasGroqKey(bodyKey) {
  return Boolean(resolveApiKey(bodyKey));
}

function extractErrText(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    return j?.error?.message || j?.error?.type || bodyText;
  } catch {
    return bodyText;
  }
}

// Core chat completion. Returns the assistant text. Throws GroqError on failure.
export async function groqChat({ apiKey, messages, maxTokens = 300, temperature = 0.7, json = false, timeoutMs = 20000 }) {
  if (!apiKey) throw new GroqError('No Groq API key configured', 401);

  const body = {
    model: GROQ_CHAT_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await withTimeout(
    fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    }),
    timeoutMs
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new GroqError(`Groq chat error (${res.status}): ${extractErrText(t)}`, res.status);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new GroqError('Groq returned an empty completion', 502);
  return content;
}

// Robust JSON extraction: models occasionally wrap JSON in prose or code fences.
export function parseJsonLoose(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

// Speech-to-text. Accepts a Buffer of audio (wav/mp3/ogg/etc), returns transcript text.
export async function groqTranscribe({ apiKey, audioBuffer, filename = 'audio.wav', language = null, timeoutMs = 15000 }) {
  if (!apiKey) throw new GroqError('No Groq API key configured', 401);

  const form = new FormData();
  // Blob is available globally in Node 18+.
  form.append('file', new Blob([audioBuffer]), filename);
  form.append('model', GROQ_STT_MODEL);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (language) form.append('language', language);

  const res = await withTimeout(
    fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    }),
    timeoutMs
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new GroqError(`Groq STT error (${res.status}): ${extractErrText(t)}`, res.status);
  }
  const data = await res.json();
  return (data?.text || '').trim();
}

// Text-to-speech. Returns a Buffer of WAV audio (Groq Orpheus output format).
export async function groqTts({ apiKey, text, voice = GROQ_TTS_VOICE, timeoutMs = 20000 }) {
  if (!apiKey) throw new GroqError('No Groq API key configured', 401);

  const res = await withTimeout(
    fetch(`${GROQ_BASE}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TTS_MODEL,
        input: text,
        voice,
        response_format: 'wav'
      })
    }),
    timeoutMs
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new GroqError(`Groq TTS error (${res.status}): ${extractErrText(t)}`, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

export class GroqError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
  }
}

async function withTimeout(promiseFactory, ms) {
  return await Promise.race([
    promiseFactory,
    new Promise((_, rej) => setTimeout(() => rej(new GroqError(`Groq request timed out after ${ms}ms`, 504)), ms))
  ]);
}
