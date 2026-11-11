import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'vp_theme';
const ThemeContext = createContext(null);

function initialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private-mode localStorage throws; dark is the product default.
  }
  return 'dark';
}

// The attribute has to be on <html> before React renders, because chart colours
// read the computed variables during render — writing it from an effect would
// leave every chart one theme switch behind.
function applyTheme(next) {
  const value = next === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* non-fatal */
  }
  return value;
}

applyTheme(initialTheme());

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initialTheme);

  const setTheme = useCallback((next) => setThemeState(applyTheme(next)), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => applyTheme(prev === 'light' ? 'dark' : 'light')),
    []
  );

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

const TOKEN_VARS = [
  'canvas', 'surface', 'surface2', 'surface3', 'line', 'lineStrong',
  'ink', 'inkSoft', 'inkMuted', 'primary', 'violet', 'electric',
  'success', 'warn', 'danger', 'info'
];

const VAR_NAMES = {
  surface2: 'surface-2', surface3: 'surface-3', lineStrong: 'line-strong',
  inkSoft: 'ink-soft', inkMuted: 'ink-muted'
};

// SVG charts can only take colour strings, not Tailwind classes, so recharts
// reads the live token values instead of hardcoding hex — that is what keeps
// axes, grids and series correct when the theme flips.
export function useThemeTokens() {
  const { theme } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const out = {};
    for (const key of TOKEN_VARS) {
      const channels = style.getPropertyValue(`--${VAR_NAMES[key] || key}`).trim();
      out[key] = `rgb(${channels.split(/\s+/).join(' ')})`;
      out[`${key}Alpha`] = (alpha) => `rgb(${channels.split(/\s+/).join(' ')} / ${alpha})`;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
