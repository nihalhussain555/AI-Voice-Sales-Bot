import { db } from '../models/db.js';
import { callsCsv, leadsCsv } from '../models/leads.js';

// Spreadsheet/JSON downloads for CRM and reporting tools. Scoped to the
// signed-in user, so an export can never contain another account's calls.
export function callsCsvFile(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calls.csv"');
  res.send(callsCsv(req.user.id));
}

export function callsJsonFile(req, res) {
  res.setHeader('Content-Disposition', 'attachment; filename="calls.json"');
  res.json({ calls: db.getCalls(req.user.id) });
}

export function leadsCsvFile(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(leadsCsv(req.user.id));
}
