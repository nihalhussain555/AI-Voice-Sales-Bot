import { getLeads, saveLead, updateLead, deleteLead, extractLeadFromCall, importLeads } from '../models/leads.js';
import { parseCsvTable } from '../utils/csv.js';

// CRM-lite lead store.
export function listLeads(req, res) {
  res.json({ leads: getLeads() });
}

export function createLead(req, res) {
  res.json({ lead: saveLead(req.body) });
}

export function patchLead(req, res) {
  const lead = updateLead(req.params.id, req.body);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ lead });
}

export function removeLead(req, res) {
  if (!deleteLead(req.params.id)) return res.status(404).json({ error: 'Lead not found' });
  res.json({ success: true });
}

// Pull structured contact/requirement data out of a call transcript.
export async function extractLead(req, res) {
  try {
    const { callId, apiKey = null } = req.body;
    if (!callId) return res.status(400).json({ error: 'callId is required' });
    res.json(await extractLeadFromCall(callId, apiKey));
  } catch (error) {
    console.error('Lead extract error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to extract lead' });
  }
}

// Bulk customer import from a CSV/TSV upload. dryRun=1 answers the preview
// question "what would happen" using the exact rules the real import applies.
export function importCustomers(req, res) {
  try {
    if (!req.file || !req.file.buffer || !req.file.buffer.length) {
      return res.status(400).json({ error: 'No file received', hint: 'Attach the CSV in the "file" field.' });
    }

    const text = req.file.buffer.toString('utf8');
    const { header, mapping, ignored, records, delimiter } = parseCsvTable(text);

    if (!header.length) {
      return res.status(400).json({ error: 'The file appears to be empty.' });
    }
    if (mapping.name === undefined) {
      return res.status(422).json({
        error: 'No customer name column found',
        hint: 'Rename one column to "name" (or "customer"/"contact").',
        detectedColumns: header
      });
    }

    const pick = (cells, field) => (mapping[field] === undefined ? '' : cells[mapping[field]] || '');
    const rows = records.map(({ cells, line }) => ({
      __line: line,
      name: pick(cells, 'name'),
      company: pick(cells, 'company'),
      email: pick(cells, 'email'),
      phone: pick(cells, 'phone'),
      product: pick(cells, 'product'),
      intent: pick(cells, 'intent'),
      pipelineStatus: pick(cells, 'pipelineStatus'),
      notes: pick(cells, 'notes')
    }));

    const dryRun = ['1', 'true', 'yes'].includes(String(req.query.dryRun ?? req.body?.dryRun ?? '').toLowerCase());
    const result = importLeads(rows, { dryRun });

    res.json({
      ...result,
      fileName: req.file.originalname,
      delimiter,
      detectedColumns: header,
      mappedColumns: Object.fromEntries(Object.entries(mapping).map(([field, index]) => [field, header[index]])),
      ignoredColumns: ignored
    });
  } catch (error) {
    console.error('Customer import error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to import customers' });
  }
}
