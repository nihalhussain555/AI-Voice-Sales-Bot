// Login throttling. express-rate-limit's MemoryStore is the right fit here:
// this API runs as a single Node process with its data on the local filesystem,
// so there is no cluster to coordinate counters across.

import { rateLimit } from 'express-rate-limit';

import { authConfig } from '../config/env.js';
import { normalizeEmail } from '../utils/validate.js';

// An IPv6 subscriber rotates through the whole /64 block its ISP hands out, so
// counting each full address separately makes the limit trivially bypassable.
// Node/Express reports IPv4 clients as '::ffff:a.b.c.d', which is collapsed back
// to the plain address here rather than grouped with unrelated traffic.
export function clientKey(req) {
  const ip = String(req.ip || '');
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::/64`;
  return ip || 'unknown';
}

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // The limit itself is not a bug to report, and the message must not hint at
  // whether the account exists.
  message: { error: 'Too many attempts. Wait a moment and try again.', code: 'rate_limited' }
};

// Keyed on email *and* address, so one burst against a single address cannot
// lock every other customer out of the same shared IP, and one address cannot
// walk a list of passwords across many accounts unchecked.
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: authConfig.loginWindowMs,
  limit: authConfig.loginMax,
  keyGenerator: (req) => `login:${clientKey(req)}:${normalizeEmail(req.body?.email) || 'no-email'}`
});

export const signupLimiter = rateLimit({
  ...shared,
  windowMs: authConfig.signupWindowMs,
  limit: authConfig.signupMax,
  keyGenerator: (req) => `signup:${clientKey(req)}`,
  message: { error: 'Too many accounts created from here. Try again later.', code: 'rate_limited' }
});

// The most valuable target: each request mails a reset link, so it is limited
// twice — per address for volume, per email so one address cannot be spammed.
export const forgotLimiter = rateLimit({
  ...shared,
  windowMs: authConfig.forgotWindowMs,
  limit: authConfig.forgotMax,
  keyGenerator: (req) => `forgot:${clientKey(req)}:${normalizeEmail(req.body?.email) || 'no-email'}`,
  message: { error: 'Too many reset requests. Try again in a few minutes.', code: 'rate_limited' }
});

export const resetLimiter = rateLimit({
  ...shared,
  windowMs: authConfig.forgotWindowMs,
  limit: authConfig.forgotMax * 2,
  keyGenerator: (req) => `reset:${clientKey(req)}`
});

// A coarse ceiling for the credential-changing endpoints that follow a
// successful login, where a stolen cookie is already the bigger problem.
export const sensitiveLimiter = rateLimit({
  ...shared,
  windowMs: 60000,
  limit: 20,
  keyGenerator: (req) => `sensitive:${req.user?.id || clientKey(req)}`
});
