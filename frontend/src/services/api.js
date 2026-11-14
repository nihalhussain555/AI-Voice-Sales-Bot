// Single API layer: every backend call in the app goes through here.
//
// VITE_API_BASE_URL is empty during local dev (Vite proxies /api to the backend)
// and set to the deployed origin in production, so the same bundle works against
// localhost and against Render.
//
// Authentication is a session cookie, so *every* request must be sent with
// credentials — a forgotten one reads as "signed out" on exactly one endpoint
// and is miserable to debug. That is why it lives here and not at the call sites.

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// Recording URLs are persisted relative (/api/recordings/<user>/<file>) so they
// survive a backend host change; prefix them here for playback from another origin.
export function resolveAsset(path) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return apiUrl(path);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// The auth context registers this so any call that finds a dead session can end
// the screensaver gracefully: clear the user, toast, redirect to /login.
// Endpoints that *expect* a 401 (the sign-in form, the bootstrap probe) opt out.
let unauthorized = null;

export function setUnauthorizedHandler(fn) {
  unauthorized = typeof fn === 'function' ? fn : null;
}

class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request(url, { expectAuthFailure = false, ...options } = {}) {
  let res;
  try {
    res = await fetch(url, { credentials: 'include', ...options });
  } catch {
    throw new ApiError('The server is unreachable. Check that the backend is running.', { status: 0 });
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const err = new ApiError(data?.error || `${res.status} ${res.statusText}`, {
      status: res.status,
      code: data?.code || null,
      data
    });
    // 401 on a workspace call means the session ended while the tab was open.
    if (res.status === 401 && !expectAuthFailure && unauthorized) unauthorized(err);
    throw err;
  }
  return data;
}

const post = (url, body, opts) => request(url, {
  method: 'POST',
  headers: JSON_HEADERS,
  body: body === undefined ? undefined : JSON.stringify(body),
  ...opts
});

// API keys are never handled here: the backend reads GROQ_API_KEY (and the
// Twilio credentials) from its own environment, so no secret reaches the bundle.

export const api = {
  // ── Account ────────────────────────────────────────────────────────────────
  // All four of these can legitimately answer 401/400, so none of them may
  // trigger the global "your session ended" redirect.
  authConfig: () => request(apiUrl('/api/auth/config'), { expectAuthFailure: true }),

  login: ({ email, password, remember }) =>
    post(apiUrl('/api/auth/login'), { email, password, remember: Boolean(remember) }, { expectAuthFailure: true }),

  register: (details) => post(apiUrl('/api/auth/register'), details, { expectAuthFailure: true }),

  // The bootstrap probe on page load: a 401 here just means "not signed in".
  me: () => request(apiUrl('/api/auth/me'), { expectAuthFailure: true }),

  logout: () => post(apiUrl('/api/auth/logout'), {}),

  updateProfile: (patch) => request(apiUrl('/api/auth/me'), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }),

  changePassword: (payload) => post(apiUrl('/api/auth/change-password'), payload, { expectAuthFailure: true }),

  forgotPassword: (email) => post(apiUrl('/api/auth/forgot-password'), { email }),

  resetPassword: (payload) => post(apiUrl('/api/auth/reset-password'), payload),

  // ── Workspace configuration (per account, no longer per device) ────────────
  workspace: () => request(apiUrl('/api/workspace/settings')),

  saveWorkspace: (patch) => request(apiUrl('/api/workspace/settings'), { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(patch) }),

  addCustomProduct: (product) => post(apiUrl('/api/workspace/products'), product),

  removeCustomProduct: (id) => request(apiUrl(`/api/workspace/products/${id}`), { method: 'DELETE' }),

  // ── Provider facts ─────────────────────────────────────────────────────────
  health: () => request(apiUrl('/api/health')),

  products: () => request(apiUrl('/api/products')),

  // The exact system prompt the server builds for a product — read-only. A
  // custom product is addressed by id; the backend resolves it inside the
  // signed-in account's own workspace.
  agentPersona: ({ productKey, language } = {}) => {
    const params = new URLSearchParams({ productKey: productKey || 'devpulse' });
    if (language) params.set('language', language);
    return request(apiUrl(`/api/agent/persona?${params}`));
  },

  chat: ({ message, history, productKey, language }) =>
    post(apiUrl('/api/chat'), { message, history, productKey, language }),

  summarize: ({ transcript, product }) =>
    post(apiUrl('/api/summarize'), { transcript, product: product?.name || 'DevPulse AI' }),

  calls: () => request(apiUrl('/api/calls')),

  saveCall: (call) => post(apiUrl('/api/calls'), call),

  deleteCall: (id) => request(apiUrl(`/api/calls/${id}`), { method: 'DELETE' }),

  uploadRecording: (blob) => {
    const form = new FormData();
    const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', blob, `call-recording.${ext}`);
    return request(apiUrl('/api/recordings/upload'), { method: 'POST', body: form });
  },

  analytics: (days = 30) => request(apiUrl(`/api/analytics?days=${days}`)),

  leads: () => request(apiUrl('/api/leads')),

  createLead: (lead) => post(apiUrl('/api/leads'), lead),

  updateLead: (id, patch) => request(apiUrl(`/api/leads/${id}`), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }),

  deleteLead: (id) => request(apiUrl(`/api/leads/${id}`), { method: 'DELETE' }),

  extractLead: (callId) => post(apiUrl('/api/leads/extract'), { callId }),

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
    post(apiUrl('/api/phone/dial'), { to, productKey, customerName }),

  phoneCalls: ({ activeOnly = false } = {}) =>
    request(apiUrl(`/api/phone/calls${activeOnly ? '?active=1' : ''}`)),

  phoneCall: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}`)),

  phoneRefresh: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}/refresh`), { method: 'POST' }),

  phoneHangup: (callSid) => request(apiUrl(`/api/phone/calls/${callSid}/hangup`), { method: 'POST' })
};

// Export endpoints return files, not JSON — plain links, opened by the browser.
// Same-site navigation sends the session cookie (SameSite=Lax covers top-level
// GETs), so these download without any extra work.
export const exportUrls = {
  callsCsv: apiUrl('/api/export/calls.csv'),
  callsJson: apiUrl('/api/export/calls.json'),
  leadsCsv: apiUrl('/api/export/leads.csv')
};

// A recordings URL cannot be dropped straight into <audio src> when the SPA is
// served from a different origin than the API: a subresource request is not a
// top-level navigation, so the browser would withhold the Lax cookie and the
// backend would answer 401. Fetching it as the logged-in user and handing back
// an object URL works on both single-port and split deployments.
export async function fetchAuthenticatedBlob(url) {
  const res = await fetch(resolveAsset(url), { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401 && unauthorized) {
      unauthorized(new ApiError('Your session has expired.', { status: 401, code: 'session_expired' }));
    }
    throw new ApiError('Could not load the recording.', { status: res.status });
  }
  return URL.createObjectURL(await res.blob());
}

export { ApiError };
