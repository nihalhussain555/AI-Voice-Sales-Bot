// Single API layer: every backend call in the app goes through here.
//
// VITE_API_BASE_URL is empty during local dev (Vite proxies /api and /recordings
// to the backend) and set to the deployed origin in production, so the same
// bundle works against localhost and against Render.

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// Recording URLs are persisted relative (/recordings/x.webm) so they survive a
// backend host change; prefix them here for playback from another origin.
export function resolveAsset(path) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return apiUrl(path);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// API keys are never handled here: the backend reads GROQ_API_KEY (and the
// Twilio credentials) from its own environment, so no secret reaches the bundle.

export const api = {
  health: () => request(apiUrl('/api/health')),

  products: () => request(apiUrl('/api/products')),

  // The exact system prompt the server builds for a product — read-only.
  agentPersona: ({ product, language } = {}) => {
    if (product?.custom) {
      return request(apiUrl('/api/agent/persona'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ customProduct: product, language })
      });
    }
    const params = new URLSearchParams({ productKey: product?.id || 'devpulse' });
    if (language) params.set('language', language);
    return request(apiUrl(`/api/agent/persona?${params}`));
  },

  chat: ({ message, history, product, language }) =>
    request(apiUrl('/api/chat'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        message,
        history,
        productKey: product?.id || 'devpulse',
        customProduct: product,
        language
      })
    }),

  summarize: ({ transcript, product }) =>
    request(apiUrl('/api/summarize'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        transcript,
        product: product?.name || 'DevPulse AI'
      })
    }),

  calls: () => request(apiUrl('/api/calls')),

  saveCall: (call) =>
    request(apiUrl('/api/calls'), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(call) }),

  deleteCall: (id) => request(apiUrl(`/api/calls/${id}`), { method: 'DELETE' }),

  uploadRecording: (blob) => {
    const form = new FormData();
    const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', blob, `call-recording.${ext}`);
    return request(apiUrl('/api/upload-recording'), { method: 'POST', body: form });
  },

  analytics: (days = 30) => request(apiUrl(`/api/analytics?days=${days}`)),

  leads: () => request(apiUrl('/api/leads')),

  createLead: (lead) =>
    request(apiUrl('/api/leads'), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(lead) }),

  updateLead: (id, patch) =>
    request(apiUrl(`/api/leads/${id}`), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }),

  deleteLead: (id) => request(apiUrl(`/api/leads/${id}`), { method: 'DELETE' }),

  extractLead: (callId) =>
    request(apiUrl('/api/leads/extract'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ callId })
    }),

  // Bulk CSV import. dryRun=true returns the same counts the real import will
  // produce, without writing anything.
  importCustomers: (file, { dryRun = false } = {}) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request(apiUrl(`/api/leads/import?dryRun=${dryRun ? 1 : 0}`), { method: 'POST', body: form });
  },

  // Real phone calling (Twilio). /api/phone/* is the app-facing side; Twilio
  // itself talks to /api/twilio/* directly.
  phoneConfig: () => request(apiUrl('/api/phone/config')),

  phoneDial: ({ to, productKey, customerName }) =>
    request(apiUrl('/api/phone/dial'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ to, productKey, customerName })
    }),

  phoneCalls: ({ activeOnly = false } = {}) =>
    request(apiUrl(`/api/phone/calls${activeOnly ? '?active=1' : ''}`)),

  phoneCall: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}`)),

  phoneRefresh: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}/refresh`), { method: 'POST' }),

  phoneHangup: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}/hangup`), { method: 'POST' })
};

// Export endpoints return files, not JSON — plain links, opened by the browser.
export const exportUrls = {
  callsCsv: apiUrl('/api/export/calls.csv'),
  callsJson: apiUrl('/api/export/calls.json'),
  leadsCsv: apiUrl('/api/export/leads.csv')
};
