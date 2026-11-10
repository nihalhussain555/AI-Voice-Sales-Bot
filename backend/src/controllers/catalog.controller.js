import { SAAS_PRODUCTS } from '../services/salesEngine.js';

// SaaS product catalog the sales agent can pitch.
export function listProducts(req, res) {
  res.json({ products: Object.values(SAAS_PRODUCTS) });
}
