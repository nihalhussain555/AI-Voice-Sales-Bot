import { SAAS_PRODUCTS, buildSalesSystemPrompt } from '../services/salesEngine.js';

// Read-only view of the prompt the agent really runs with, so the UI never keeps
// its own copy that could drift from the code. No conversation logic lives here.
export function persona(req, res) {
  const source = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const productKey = String(source.productKey || 'devpulse').toLowerCase();
  const customProduct = source.customProduct && source.customProduct.name
    ? source.customProduct
    : null;
  const language = source.language || 'English';
  const product = customProduct || SAAS_PRODUCTS[productKey] || SAAS_PRODUCTS['devpulse'];

  res.json({
    name: 'Jordan',
    role: 'Consultative Senior Sales Account Executive',
    product: product.name,
    productKey: customProduct ? 'custom' : productKey,
    language,
    systemPrompt: buildSalesSystemPrompt(product, language),
    sourceFile: 'backend/src/services/salesEngine.js',
    editableInUi: false,
    note: 'The prompt is generated in code and is identical on the browser demo and the phone line. Change it in the source file, then restart the backend.'
  });
}
