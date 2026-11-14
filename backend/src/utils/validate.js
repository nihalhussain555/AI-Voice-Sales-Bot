// Input rules shared by the API (authoritative) and mirrored in the SPA for
// instant feedback. A mismatch here would show up as a form that accepts a
// value the server then refuses, so keep the two in step deliberately.

import { authConfig } from '../config/env.js';

// Deliberately permissive on the local part and strict on the shape: a real
// validator would need network access to confirm the domain exists, and
// rejecting a valid address is worse than accepting a typo.
const EMAIL_RE = /^[^\s@,;:"]+@[^\s@.,;:"][0-9a-zA-Z-]*[^\s@,;:"]*\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()\-.]{5,19}\d$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;
// Rejects 'aaaaaaaaaa' while still allowing a passphrase: needs length plus
// either a digit or a symbol.
const WEAK_RE = /^[a-z\s]+$/i;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export function validateEmail(value, { field = 'Email' } = {}) {
  const email = normalizeEmail(value);
  if (!email) return { value: email, error: `${field} is required` };
  if (email.length > 254) return { value: email, error: `${field} is too long` };
  if (!EMAIL_RE.test(email)) return { value: email, error: `${field} is not a valid email address` };
  return { value: email, error: null };
}

export function validateName(value, { field = 'Full name', required = true } = {}) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) return required ? { value: name, error: `${field} is required` } : { value: name, error: null };
  if (name.length < 2) return { value: name, error: `${field} must be at least 2 characters` };
  if (name.length > 80) return { value: name, error: `${field} must be 80 characters or fewer` };
  if (!NAME_RE.test(name)) return { value: name, error: `${field} contains characters we cannot accept` };
  return { value: name, error: null };
}

// Phone is optional on an account; when supplied it must be dial-able, because
// the whole product depends on calling these numbers.
export function validatePhone(value, { required = false } = {}) {
  const phone = String(value || '').trim();
  if (!phone) return { value: '', error: required ? 'Phone number is required' : null };
  if (!PHONE_RE.test(phone)) return { value: phone, error: 'Enter a valid phone number with country code, e.g. +91 98765 43210' };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { value: phone, error: 'Phone number must have 8 to 15 digits' };
  return { value: phone, error: null };
}

export function validatePassword(value) {
  const password = typeof value === 'string' ? value : '';
  const min = authConfig.passwordMinLength;
  if (!password) return { error: 'Password is required' };
  if (password.length < min) return { error: `Password must be at least ${min} characters` };
  // bcrypt silently truncates at 72 bytes; refusing is honest, truncating is a
  // user being locked out of an account whose password they no longer know.
  if (Buffer.byteLength(password, 'utf8') > 72) return { error: 'Password must be 72 bytes or fewer' };
  if (WEAK_RE.test(password)) return { error: `Add a number or symbol — ${min} letters alone is too easy to guess` };
  return { error: null };
}

// Only http(s) URLs are accepted: an avatar field is rendered into the DOM, so
// a 'javascript:' or 'data:text/html' value there would be stored XSS.
export function validateUrl(value, { field = 'Link' } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return { value: '', error: null };
  let parsed;
  try { parsed = new URL(raw); } catch { return { value: raw, error: `${field} is not a valid URL` }; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { value: raw, error: `${field} must start with http:// or https://` };
  }
  if (parsed.href.length > 512) return { value: raw, error: `${field} is too long` };
  return { value: parsed.href, error: null };
}

export function firstError(...errors) {
  return errors.filter(Boolean)[0] || null;
}
