// Per-user workspace configuration: the product the agent pitches and the
// custom products this account authored. This state used to live in
// localStorage, which meant it belonged to a device — two accounts on one
// machine shared (and overwrote) each other's agent configuration.

import { getSettings, saveSettings, addCustomProduct, removeCustomProduct, MAX_CUSTOM_PRODUCTS } from '../models/settings.js';

export function readWorkspace(req, res) {
  res.json({
    settings: getSettings(req.user.id),
    limits: { maxCustomProducts: MAX_CUSTOM_PRODUCTS }
  });
}

// Partial update: send productKey, customProducts, or both.
export function updateWorkspace(req, res) {
  const body = req.body || {};
  if (body.productKey !== undefined && typeof body.productKey !== 'string') {
    return res.status(400).json({ error: 'productKey must be a string', code: 'invalid_input' });
  }
  if (body.customProducts !== undefined && !Array.isArray(body.customProducts)) {
    return res.status(400).json({ error: 'customProducts must be a list', code: 'invalid_input' });
  }

  const { settings, error } = saveSettings(req.user.id, {
    productKey: body.productKey,
    customProducts: body.customProducts
  });
  if (error) return res.status(400).json({ error, code: 'invalid_input' });
  res.json({ settings });
}

export function createCustomProduct(req, res) {
  const { product, error } = addCustomProduct(req.user.id, req.body || {});
  if (error) return res.status(400).json({ error, code: 'invalid_input' });
  res.status(201).json({ product, settings: getSettings(req.user.id) });
}

export function deleteCustomProduct(req, res) {
  const removed = removeCustomProduct(req.user.id, req.params.id);
  if (!removed) return res.status(404).json({ error: 'No such product in your workspace' });
  res.json({ success: true, settings: getSettings(req.user.id) });
}
