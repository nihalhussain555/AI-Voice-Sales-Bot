// The session cookie, in one place, so the attributes that decide whether a
// sign-in survives a reload (HttpOnly, SameSite, Secure, Path) cannot drift
// between the login, reset and logout handlers.

import { authConfig } from '../config/env.js';

// Scoping the cookie to /api keeps it off static SPA asset requests; every
// authenticated endpoint lives under that prefix.
export const COOKIE_PATH = '/api';

export function cookieOptions({ remember = false, expiresAt = null } = {}) {
  const options = {
    httpOnly: true,
    sameSite: authConfig.cookieSameSite,
    secure: authConfig.cookieSecure,
    path: COOKIE_PATH,
    // A session cookie (no maxAge) dies with the browser, which is what
    // "remember me" unchecked means; the server still enforces an expiry.
    maxAge: remember ? authConfig.rememberTtlMs : undefined
  };
  if (expiresAt && options.maxAge) {
    options.maxAge = Math.max(0, Number(expiresAt) - Date.now());
  }
  return options;
}

export function clearSessionCookie(res) {
  res.clearCookie(authConfig.cookieName, {
    path: COOKIE_PATH,
    sameSite: authConfig.cookieSameSite,
    secure: authConfig.cookieSecure
  });
}
