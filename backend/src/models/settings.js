// Per-user agent configuration: which product the agent pitches and the custom
// products that user authored. This used to live in browser localStorage, which
// meant it followed the device rather than the person — and a second user on the
// same machine inherited the first one's products.

import { readCollection, writeCollection } from './store.js';

export const MAX_CUSTOM_PRODUCTS = 10;

const DEFAULTS = {
  productKey: 'devpulse',
  customProducts: []
};

const text = (value, max) => String(value ?? '').trim().slice(0, max);

// A custom product is interpolated into the agent's system prompt, so every
// field is length-capped: an unbounded "pitch" is an unbounded token bill.
function normaliseProduct(raw) {
  const name = text(raw?.name, 80);
  if (!name) return { error: 'A product needs a name' };
  const pitch = text(raw?.pitch, 1200);
  if (!pitch) return { error: 'A product needs a core pitch' };

  const features = Array.isArray(raw?.features)
    ? raw.features.map((f) => text(f, 200)).filter(Boolean).slice(0, 12)
    : [];

  return {
    product: {
      id: text(raw?.id, 40) || `custom-${Date.now()}`,
      name,
      tagline: text(raw?.tagline, 140) || 'Custom SaaS Product',
      pitch,
      pricing: text(raw?.pricing, 300) || 'Custom pricing',
      features,
      targetCustomer: text(raw?.targetCustomer, 160) || 'B2B Teams',
      custom: true
    },
    error: null
  };
}

export function getSettings(userId) {
  const stored = readCollection(userId, 'settings', DEFAULTS);
  const raw = typeof stored === 'object' && stored ? stored : {};
  return {
    productKey: text(raw.productKey, 60) || DEFAULTS.productKey,
    customProducts: (Array.isArray(raw.customProducts) ? raw.customProducts : [])
      .map((p) => normaliseProduct(p).product)
      .filter(Boolean)
  };
}

export function saveSettings(userId, patch = {}) {
  const current = getSettings(userId);
  const next = { ...current };

  if (patch.productKey !== undefined) {
    const key = text(patch.productKey, 60);
    const known = key === DEFAULTS.productKey
      || key.startsWith('custom-')
      || /^[a-z]+$/.test(key);
    if (known) next.productKey = key || DEFAULTS.productKey;
  }

  if (Array.isArray(patch.customProducts)) {
    const parsed = [];
    for (const raw of patch.customProducts.slice(0, MAX_CUSTOM_PRODUCTS)) {
      const { product, error } = normaliseProduct(raw);
      if (error) return { error, settings: null };
      parsed.push(product);
    }
    next.customProducts = parsed;
  }

  return writeCollection(userId, 'settings', next)
    ? { settings: next, error: null }
    : { settings: null, error: 'Could not save the workspace configuration' };
}

export function addCustomProduct(userId, raw) {
  const { product, error } = normaliseProduct(raw);
  if (error) return { error, product: null };

  const current = getSettings(userId);
  if (current.customProducts.some((p) => p.name.toLowerCase() === product.name.toLowerCase())) {
    return { error: 'You already have a product with that name', product: null };
  }
  if (current.customProducts.length >= MAX_CUSTOM_PRODUCTS) {
    return { error: `Custom products are capped at ${MAX_CUSTOM_PRODUCTS}`, product: null };
  }

  const next = [product, ...current.customProducts];
  const saved = saveSettings(userId, { customProducts: next });
  if (saved.error) return { error: saved.error, product: null };
  return { product, error: null };
}

export function removeCustomProduct(userId, id) {
  const current = getSettings(userId);
  const next = current.customProducts.filter((p) => p.id !== id);
  if (next.length === current.customProducts.length) return false;
  saveSettings(userId, { customProducts: next });
  return true;
}

// Catalog keys and this user's own custom products only: a guessed id from
// another workspace resolves to nothing.
export function resolveUserProduct(userId, productKey) {
  const settings = getSettings(userId);
  return settings.customProducts.find((p) => p.id === productKey) || null;
}
