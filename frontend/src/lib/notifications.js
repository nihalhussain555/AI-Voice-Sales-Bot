import { OUTCOME_WORDS } from '../components/ui/badge.jsx';

// The bell has no backend of its own: every entry is derived from call records
// and leads that already exist, so it can never show a number the dashboard
// does not agree with.
const UNREACHED = ['busy', 'no-answer', 'canceled', 'rejected', 'not-callable'];
const BROKEN = ['failed'];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const SEEN_KEY = 'vp_notifications_seen';

const timeAgo = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function buildNotifications({ calls = [], leads = [] } = {}) {
  const items = [];
  const stamp = (value) => Date.parse(value || '') || 0;

  for (const call of calls) {
    const at = stamp(call.timestamp);
    if (!at || Date.now() - at > RECENT_MS) continue;
    const who = call.customerName || call.company || 'Unknown prospect';
    const when = new Date(at).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (call.status === 'Converted') {
      items.push({
        id: `won-${call.id}`,
        at,
        tone: 'success',
        title: `Deal won — ${who}`,
        detail: `${call.product || 'Pitch'} · ${when}`,
        to: `/history?call=${call.id}`
      });
      continue;
    }

    if (call.twilioErrorCode) {
      items.push({
        id: `err-${call.id}`,
        at,
        tone: 'danger',
        title: `Call failed — ${who}`,
        detail: `Twilio error ${call.twilioErrorCode} · ${when}`,
        to: `/history?call=${call.id}`
      });
      continue;
    }

    if (BROKEN.includes(call.outcome)) {
      items.push({
        id: `fail-${call.id}`,
        at,
        tone: 'danger',
        title: `Dropped call — ${who}`,
        detail: `${OUTCOME_WORDS[call.outcome] || call.outcome} · ${when}`,
        to: `/history?call=${call.id}`
      });
      continue;
    }

    if (UNREACHED.includes(call.outcome)) {
      items.push({
        id: `miss-${call.id}`,
        at,
        tone: 'warn',
        title: `Not reached — ${who}`,
        detail: `${OUTCOME_WORDS[call.outcome] || call.outcome} · ${when}`,
        to: `/history?call=${call.id}`
      });
    }
  }

  for (const lead of leads) {
    const at = stamp(lead.updatedAt || lead.createdAt);
    if (!at || Date.now() - at > RECENT_MS) continue;
    if (lead.intent !== 'hot' || lead.pipelineStatus !== 'New') continue;
    items.push({
      id: `lead-${lead.id}`,
      at,
      tone: 'info',
      title: `Hot lead waiting — ${lead.name}`,
      detail: [lead.company, lead.phone || lead.email].filter(Boolean).join(' · ') || 'Add to the calling list',
      to: `/customers?lead=${lead.id}`
    });
  }

  return items
    .sort((a, b) => b.at - a.at || a.title.localeCompare(b.title))
    .slice(0, 12)
    .map(item => ({ ...item, atLabel: timeAgo(item.at) }));
}

// A notification id is stable per record, so "read" survives refetches and page
// reloads without needing a server-side inbox.
export const NOTIFICATIONS_EVENT = 'vp:notifications';

const announce = () => window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));

export function readIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(raw) ? new Set(raw) : new Set();
  } catch {
    return new Set();
  }
}

export function markRead(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(ids)].slice(-200)));
  } catch {
    // Private-mode localStorage throws; the bell simply stays unread.
  }
  announce();
}

export function countUnread(items = [], seen = readIds()) {
  return items.filter(item => !seen.has(item.id)).length;
}

// Both the bell and the Profile page keep their own copy of the read set, so a
// write here is broadcast and neither can disagree with storage.
export function clearReadHistory() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* non-fatal */
  }
  announce();
}
