import { SAAS_PRODUCTS, buildSalesSystemPrompt } from '../services/salesEngine.js';
import { getSettings } from '../models/settings.js';

// Read-only view of the prompt the agent really runs with, so the UI never keeps
// its own copy that could drift from the code. No conversation logic lives here.
//
// A custom product is identified by id and looked up in the signed-in user's own
// saved configuration — the prompt can only ever be built from a product this
// account owns.
export function persona(req, res) {
  const source = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const productKey = String(source.productKey || 'devpulse').toLowerCase();
  const language = String(source.language || 'English').slice(0, 40);
  const custom = getSettings(req.user.id).customProducts.find((p) => p.id === productKey) || null;
  const product = custom || SAAS_PRODUCTS[productKey] || SAAS_PRODUCTS['devpulse'];

  res.json({
    name: 'Jordan',
    role: 'Consultative Senior Sales Account Executive',
    product: product.name,
    productKey: custom ? 'custom' : productKey,
    language,
    systemPrompt: buildSalesSystemPrompt(product, language),
    sourceFile: 'backend/src/services/salesEngine.js',
    editableInUi: false,
    note: 'The prompt is generated in code and is identical on the browser demo and the phone line. Change it in the source file, then restart the backend.'
  });
}
