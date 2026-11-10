import { db } from '../models/db.js';
import { callsCsv, leadsCsv } from '../models/leads.js';

// Spreadsheet/JSON downloads for CRM and reporting tools.
export function callsCsvFile(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calls.csv"');
  res.send(callsCsv());
}

export function callsJsonFile(req, res) {
  res.setHeader('Content-Disposition', 'attachment; filename="calls.json"');
  res.json({ calls: db.getCalls() });
}

export function leadsCsvFile(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(leadsCsv());
}
