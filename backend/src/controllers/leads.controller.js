import { getLeads, saveLead, updateLead, deleteLead, extractLeadFromCall, importLeads, PIPELINE } from '../models/leads.js';
import { parseCsvTable } from '../utils/csv.js';
import { validateEmail, validatePhone } from '../utils/validate.js';

// CRM-lite lead store, scoped to the signed-in user.

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

// Field-by-field coercion: a lead ends up interpolated into an LLM prompt and
// into CSV exports, so length and shape are fixed here rather than trusted.
function leadFromBody(body = {}, { partial = false } = {}) {
  const patch = {};
  const set = (key, value) => { patch[key] = value; };

  if (!partial || body.name !== undefined) {
    const name = clip(body.name, 120);
    if (!name) return { error: 'A customer name is required' };
    set('name', name);
  }
  if (body.company !== undefined) set('company', clip(body.company, 120));
  if (body.product !== undefined) set('product', clip(body.product, 120));
  if (body.notes !== undefined) set('notes', clip(body.notes, 2000));
  if (body.intent !== undefined) {
    const intent = clip(body.intent, 12).toLowerCase();
    set('intent', ['hot', 'warm', 'cold', 'unknown'].includes(intent) ? intent : 'unknown');
  }
  if (body.pipelineStatus !== undefined) {
    if (!PIPELINE.includes(body.pipelineStatus)) return { error: `pipelineStatus must be one of ${PIPELINE.join(', ')}` };
    set('pipelineStatus', body.pipelineStatus);
  }
  if (body.objections !== undefined) {
    set('objections', Array.isArray(body.objections) ? body.objections.map((o) => clip(o, 300)).filter(Boolean).slice(0, 10) : []);
  }
  if (body.phone !== undefined) {
    const phone = validatePhone(body.phone);
    if (phone.error) return { error: phone.error };
    set('phone', phone.value);
  }
  if (body.email !== undefined && body.email !== '') {
    const email = validateEmail(body.email, { field: 'Email' });
    if (email.error) return { error: email.error };
    set('email', email.value);
  } else if (body.email !== undefined) {
    set('email', '');
  }
  return { patch };
}

export function listLeads(req, res) {
  res.json({ leads: getLeads(req.user.id) });
}

export function createLead(req, res) {
  const { patch, error } = leadFromBody(req.body);
  if (error) return res.status(400).json({ error, code: 'invalid_input' });
  res.json({ lead: saveLead(req.user.id, patch) });
}

export function patchLead(req, res) {
  const { patch, error } = leadFromBody(req.body, { partial: true });
  if (error) return res.status(400).json({ error, code: 'invalid_input' });
  const lead = updateLead(req.user.id, req.params.id, patch);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ lead });
}

export function removeLead(req, res) {
  if (!deleteLead(req.user.id, req.params.id)) return res.status(404).json({ error: 'Lead not found' });
  res.json({ success: true });
}

// Pull structured contact/requirement data out of a call transcript.
export async function extractLead(req, res) {
  try {
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ error: 'callId is required' });
    res.json(await extractLeadFromCall(req.user.id, callId));
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
    const result = importLeads(req.user.id, rows, { dryRun });

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
