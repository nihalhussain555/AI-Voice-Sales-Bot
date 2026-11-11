// Customer roll-ups derived from call records. The backend counts distinct
// customers for the KPIs, but the pages need the per-customer rows too, so the
// same identity rule (phone number, then email, then name) lives here.
export const STATUS_ORDER = [
  'Converted', 'Demo Requested', 'Interested', 'Follow-up Required', 'Not Interested', 'No Response'
];

const rank = (status) => {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
};

export function customerNumber(call) {
  return call.direction === 'inbound' ? call.from : call.to;
}

export function customerKey(call) {
  const digits = String(customerNumber(call) || '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length >= 7) return `p:${digits}`;
  const email = String(call.email || '').trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${String(call.customerName || 'unknown').trim().toLowerCase()}`;
}

export function customerName(call) {
  return call.customerName || call.company || 'Unknown prospect';
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

export function formatClock(seconds = 0) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function relativeTime(iso) {
  const at = Date.parse(iso || '') || 0;
  if (!at) return '—';
  const diff = Date.now() - at;
  if (diff < 60000) return 'just now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// One row per customer, newest interaction first.
export function groupByCustomer(calls = []) {
  const map = new Map();
  for (const call of calls) {
    const key = customerKey(call);
    const at = Date.parse(call.timestamp || '') || 0;
    const row = map.get(key) || {
      key,
      name: customerName(call),
      company: call.company || '',
      phone: customerNumber(call) || '',
      email: call.email || '',
      calls: 0,
      turns: 0,
      duration: 0,
      lastAt: 0,
      last: null,
      best: null,
      products: new Set()
    };
    row.calls += 1;
    row.turns += (call.transcript || []).length;
    row.duration += call.duration || 0;
    if (call.company && row.name === 'Unknown prospect') row.name = call.company;
    if (call.product) row.products.add(call.product);
    if (at >= row.lastAt) { row.lastAt = at; row.last = call; }
    if (!row.best || rank(call.status) < rank(row.best)) row.best = call.status;
    map.set(key, row);
  }

  return [...map.values()]
    .map(row => ({ ...row, products: [...row.products], avgDuration: row.calls ? row.duration / row.calls : 0 }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

// ---- CRM pipeline ------------------------------------------------------------

export const PIPELINE_STAGES = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'];

export const INTENT_META = {
  hot: { label: 'Hot', tone: 'success' },
  warm: { label: 'Warm', tone: 'amber' },
  cold: { label: 'Cold', tone: 'rose' },
  unknown: { label: 'Unranked', tone: 'slate' }
};

const digits = (value) => String(value || '').replace(/\D/g, '').replace(/^00/, '');

// Mirrors the backend identity rule: phone digits, then email, then name.
export function contactKey({ phone, email, name } = {}) {
  const d = digits(phone);
  if (d.length >= 7) return `p:${d}`;
  const e = String(email || '').trim().toLowerCase();
  if (e) return `e:${e}`;
  return `n:${String(name || 'unknown').trim().toLowerCase()}`;
}

// The CRM list and the call log describe the same people from two directions.
// Merging them keeps the Customers page honest: stage/notes come from the lead
// record, interaction history comes from the calls that actually happened.
export function mergeCustomers(leads = [], calls = []) {
  const rollup = groupByCustomer(calls);
  const historyByKey = new Map();
  for (const call of calls) {
    const key = customerKey(call);
    const list = historyByKey.get(key) || [];
    list.push(call);
    historyByKey.set(key, list);
  }
  const newestFirst = (a, b) => (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0);
  for (const list of historyByKey.values()) list.sort(newestFirst);

  const consumed = new Set();

  const rows = leads.map(lead => {
    const direct = contactKey(lead);
    // Browser-demo calls carry no number, so a lead whose phone was found later
    // in the transcript must still see its history: fall back to the name key.
    const byName = `n:${String(lead.name || '').trim().toLowerCase()}`;
    const chosen = historyByKey.has(direct) ? direct : (historyByKey.has(byName) ? byName : direct);
    consumed.add(chosen);
    const history = historyByKey.get(chosen) || [];
    const roll = rollup.find(r => r.key === chosen);
    return {
      key: chosen,
      lead,
      fromCrm: true,
      name: lead.name || roll?.name || 'Unknown prospect',
      company: lead.company || roll?.company || '',
      email: lead.email || roll?.email || '',
      phone: lead.phone || roll?.phone || '',
      intent: lead.intent || 'unknown',
      stage: PIPELINE_STAGES.includes(lead.pipelineStatus) ? lead.pipelineStatus : 'New',
      history,
      callCount: history.length,
      lastAt: history.length ? Date.parse(history[0].timestamp || '') || 0 : 0,
      lastStatus: history[0]?.status || '',
      products: [...new Set([lead.product, ...history.map(c => c.product)].filter(Boolean))],
      createdAt: lead.createdAt || lead.updatedAt || ''
    };
  });

  // Contacts that exist only in the call log — no CRM record was ever captured.
  const orphans = rollup
    .filter(row => !consumed.has(row.key))
    .map(row => ({
      key: row.key,
      lead: null,
      fromCrm: false,
      name: row.name,
      company: row.company,
      email: row.email,
      phone: row.phone,
      intent: 'unknown',
      stage: 'New',
      history: historyByKey.get(row.key) || [],
      callCount: row.calls,
      lastAt: row.lastAt,
      lastStatus: row.best || '',
      products: row.products,
      createdAt: ''
    }));

  return [...rows, ...orphans].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

