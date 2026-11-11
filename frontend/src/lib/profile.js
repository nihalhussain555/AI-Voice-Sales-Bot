// There is no backend user record in this build, so the operator profile lives in
// this browser only. Everything that reads it labels it as local rather than
// pretending an account exists.
const PROFILE_KEY = 'vp_profile';
const COLLAPSE_KEY = 'vp_sidebar_collapsed';
const CUSTOM_PRODUCTS_KEY = 'vp_custom_products';

export const DEFAULT_PROFILE = {
  name: 'Sales operator',
  role: 'Growth'
};

// The preferences this console keeps on the device, shown verbatim on the
// Profile page so nothing is hidden in localStorage.
export const LOCAL_DATA = [
  { key: PROFILE_KEY, label: 'Operator name and role' },
  { key: 'vp_theme', label: 'Light or dark theme' },
  { key: 'vp_product', label: 'Product selected for the next pitch' },
  { key: CUSTOM_PRODUCTS_KEY, label: 'Custom products created in this browser' },
  { key: COLLAPSE_KEY, label: 'Sidebar collapsed preference' },
  { key: 'vp_notifications_seen', label: 'Which notifications were already read' }
];

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...(read(PROFILE_KEY, {})) };
}

// The header renders the name, so a write from the Profile page is announced
// instead of the two places caching it separately.
export const PROFILE_EVENT = 'vp:profile';

export function saveProfile(patch) {
  const next = { ...getProfile(), ...(patch || {}) };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Private-mode localStorage throws; the session still works.
  }
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
  return next;
}

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
    /* non-fatal */
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: collapsed }));
}

export function getCustomProducts() {
  const stored = read(CUSTOM_PRODUCTS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

// The product list is held by AppShell, so writes are announced rather than
// cached twice.
export const CUSTOM_PRODUCTS_EVENT = 'vp:custom-products';

export function saveCustomProducts(list) {
  try {
    localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* non-fatal */
  }
  window.dispatchEvent(new CustomEvent(CUSTOM_PRODUCTS_EVENT));
}

export function clearLocalWorkspace() {
  LOCAL_DATA.forEach(({ key }) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* non-fatal */
    }
  });
}
