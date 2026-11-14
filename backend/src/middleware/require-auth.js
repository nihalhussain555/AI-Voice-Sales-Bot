// Session authentication.
//
// `authenticate` is soft (it decorates the request and always continues) so
// public endpoints can personalise themselves; `requireAuth` is the gate every
// protected route mounts. Ownership is derived from req.user.id only — never
// from anything the client sends.

import { authConfig, corsOriginAllowed } from '../config/env.js';
import { decodeSessionCookie, validateSession, touchSession } from '../models/sessions.js';
import { findUserById, publicUser } from '../models/users.js';

function readSession(req) {
  const cookie = req.cookies?.[authConfig.cookieName];
  if (!cookie) return { present: false };
  const parsed = decodeSessionCookie(cookie);
  if (!parsed) return { present: true };
  const result = validateSession(parsed.sessionId, parsed.token);
  if (!result) return { present: true };

  let { session } = result;
  if (result.needsRefresh) {
    session = touchSession(session.id) || session;
  }

  const user = findUserById(session.userId);
  if (!user || user.status !== 'active') return { present: true };
  return { present: true, user, session };
}

export function authenticate(req, _res, next) {
  const { user, session, present } = readSession(req);
  req.hasSessionCookie = present;
  if (user) {
    req.user = user;
    // Controllers return this shape; the hash never leaves the model layer.
    req.auth = publicUser(user);
    req.sessionId = session.id;
    req.sessionExpiresAt = session.expiresAt;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  // A cookie was sent but did not resolve: the session ended (idle timeout,
  // logout elsewhere, or a password change) rather than never having existed.
  const expired = req.hasSessionCookie;
  res.status(401).json({
    error: expired ? 'Your session has expired. Please sign in again.' : 'Sign in to continue',
    code: expired ? 'session_expired' : 'unauthenticated'
  });
}

// The session cookie is readable by our own SPA but sent automatically, so a
// foreign page could otherwise ride along in it. SameSite=Lax already stops the
// cross-site case for writes; this makes the intent explicit server-side and
// catches non-Lax configurations. A request with no Origin at all (curl, server
// to server) is not a browser and is left to the other controls.
export function requireTrustedOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();

  const self = `${req.protocol}://${req.get('host')}`;
  if (origin === self) return next();
  // A dev proxy rewrites Host, so the SPA's own origin legitimately differs from
  // the backend's; the CORS allow-list is the authoritative answer for that case.
  if (corsOriginAllowed(origin)) return next();

  return res.status(403).json({
    error: 'This request came from an origin this server does not recognise.',
    code: 'origin_not_allowed'
  });
}

// Redirect targets must stay on our own site, or a login form becomes an open
// redirect that hands a fresh session to an attacker's page.
export function safeRedirect(target) {
  if (typeof target !== 'string') return null;
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return null;
  try {
    const url = new URL(target, 'http://internal');
    if (url.origin !== 'http://internal') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
