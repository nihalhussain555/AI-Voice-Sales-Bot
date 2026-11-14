// Client-side mirrors of the rules in backend/src/utils/validate.js.
//
// These exist so a form can answer immediately, not so the server can be
// trusted less: every one of them is re-checked on the way in, and the wording
// is deliberately the same. Change one side, change the other.

export const EMAIL_RE = /^[^\s@,;:"]+@[^\s@.,;:"][0-9a-zA-Z-]*[^\s@,;:"]*\.[A-Za-z]{2,}$/;
export const PHONE_RE = /^\+?[0-9][0-9 ()\-.]{5,19}\d$/;

export function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Email is required';
  if (email.length > 254) return 'Email is too long';
  if (!EMAIL_RE.test(email)) return 'Email is not a valid email address';
  return null;
}

export function validateName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Full name is required';
  if (name.length < 2) return 'Full name must be at least 2 characters';
  if (name.length > 80) return 'Full name must be 80 characters or fewer';
  return null;
}

// Phone is optional on an account; anything supplied must be dial-able.
export function validatePhone(value, { required = false } = {}) {
  const phone = String(value || '').trim();
  if (!phone) return required ? 'Phone number is required' : null;
  if (!PHONE_RE.test(phone)) return 'Enter a valid phone number with country code, e.g. +91 98765 43210';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'Phone number must have 8 to 15 digits';
  return null;
}

export function validatePassword(value, { minLength = 8 } = {}) {
  const password = typeof value === 'string' ? value : '';
  if (!password) return 'Password is required';
  if (password.length < minLength) return `Password must be at least ${minLength} characters`;
  // bcrypt truncates at 72 bytes, so a longer password silently stops existing.
  if (new TextEncoder().encode(password).length > 72) return 'Password must be 72 bytes or fewer';
  if (/^[a-z\s]+$/i.test(password)) return `Add a number or symbol — ${minLength} letters alone is too easy to guess`;
  return null;
}

// A cheap, honest strength read-out: it scores the things that actually slow a
// guess down rather than pretending to be entropy analysis.
export function passwordStrength(value) {
  const password = typeof value === 'string' ? value : '';
  if (!password) return { score: 0, label: 'Empty' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  const labels = ['Very weak', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[Math.min(score, 5)] };
}

export function firstError(...errors) {
  return errors.filter(Boolean)[0] || null;
}

// Mirrors validateUrl() on the server: an avatar link is fetched by the browser,
// so a javascript: or data: URL is a script execution risk, not a picture.
export function validateUrl(value, { field = 'Link' } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return `${field} is not a valid URL`; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `${field} must start with http:// or https://`;
  }
  if (parsed.href.length > 512) return `${field} is too long`;
  return null;
}

// Turns a backend ApiError into the field it complained about, so a server-side
// rejection lands next to the input rather than in a generic banner.
export function fieldErrorsFrom(error) {
  const message = error?.message || 'Something went wrong. Please try again.';
  const map = { email_taken: 'email' };
  if (error?.code && map[error.code]) return { [map[error.code]]: message };

  const patterns = [
    ['email', /email/i],
    ['password', /password/i],
    ['fullName', /name/i],
    ['phone', /phone/i],
    ['acceptedTerms', /terms/i]
  ];
  for (const [field, pattern] of patterns) {
    if (pattern.test(message)) return { [field]: message };
  }
  return { form: message };
}
