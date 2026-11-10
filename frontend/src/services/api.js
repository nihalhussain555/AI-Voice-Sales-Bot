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

export function getStoredKey() {
  return localStorage.getItem('vp_groq_key') || '';
}

export function setStoredKey(key) {
  if (key) localStorage.setItem('vp_groq_key', key);
  else localStorage.removeItem('vp_groq_key');
}

export const api = {
  health: () => request(apiUrl('/api/health')),

  products: () => request(apiUrl('/api/products')),

  chat: ({ message, history, product, language }) =>
    request(apiUrl('/api/chat'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        message,
        history,
        productKey: product?.id || 'devpulse',
        customProduct: product,
        language,
        apiKey: getStoredKey()
      })
    }),

  summarize: ({ transcript, product }) =>
    request(apiUrl('/api/summarize'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        transcript,
        product: product?.name || 'DevPulse AI',
        apiKey: getStoredKey()
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

  updateLead: (id, patch) =>
    request(apiUrl(`/api/leads/${id}`), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }),

  deleteLead: (id) => request(apiUrl(`/api/leads/${id}`), { method: 'DELETE' }),

  extractLead: (callId) =>
    request(apiUrl('/api/leads/extract'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ callId, apiKey: getStoredKey() })
    }),

  twilioStatus: () => request(apiUrl('/api/twilio/status')),

  twilioCall: (to) =>
    request(apiUrl('/api/twilio/call-out'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ to })
    })
};

// Export endpoints return files, not JSON — plain links, opened by the browser.
export const exportUrls = {
  callsCsv: apiUrl('/api/export/calls.csv'),
  callsJson: apiUrl('/api/export/calls.json'),
  leadsCsv: apiUrl('/api/export/leads.csv')
};
