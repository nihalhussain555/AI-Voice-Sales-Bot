// Preferences that genuinely belong to a device rather than an account: how the
// console is displayed to the person sitting in front of it.
//
// Everything that used to be here as a stand-in for an account — the operator's
// name and role, the custom products they authored — now lives on the server
// against their user record, because a second login on this machine must not
// inherit the first one's workspace.

const COLLAPSE_KEY = 'vp_sidebar_collapsed';

// Listed verbatim on the Profile page so nothing this console writes is hidden
// in localStorage.
export const LOCAL_DATA = [
  { key: 'vp_theme', label: 'Light or dark theme' },
  { key: COLLAPSE_KEY, label: 'Sidebar collapsed preference' },
  { key: 'vp_notifications_seen', label: 'Which notifications were already read' }
];

export function getSidebarCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

// The rail belongs to AppShell, so a change made on the Profile page is pushed
// through an event instead of keeping a second copy of the state here.
export const SIDEBAR_EVENT = 'vp:sidebar';

export function setSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    /* private-mode localStorage throws; the session still works */
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: collapsed }));
}

export function clearLocalPreferences() {
  LOCAL_DATA.forEach(({ key }) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* non-fatal */
    }
  });
}
