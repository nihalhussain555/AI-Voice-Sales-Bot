import { buildAnalytics } from '../services/analytics.js';
import { getLeads } from '../models/leads.js';

// Aggregated dashboard metrics for the selected window.
export function analytics(req, res) {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '30', 10)));
    res.json(buildAnalytics({
      days,
      from: req.query.from || null,
      to: req.query.to || null,
      leads: getLeads()
    }));
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to build analytics' });
  }
}
