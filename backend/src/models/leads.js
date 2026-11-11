// CRM-lite: lead records extracted from calls, plus CSV/JSON export helpers.

import fs from 'fs';
import path from 'path';

import { db } from './db.js';
import { groqChat, parseJsonLoose, resolveApiKey } from '../services/groqClient.js';
import { paths } from '../config/env.js';

const LEADS_FILE = path.join(paths.data, 'leads.json');

const PIPELINE = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'];

function readLeads() {
  try {
    if (!fs.existsSync(LEADS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  try {
    fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
    return true;
  } catch (err) {
    console.error('leads: write failed:', err.message);
    return false;
  }
}

export function getLeads() {
  return readLeads().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

export function saveLead(patch) {
  const leads = readLeads();
  const now = new Date().toISOString();
  const existingIdx = patch.callId ? leads.findIndex(l => l.callId === patch.callId) : -1;

  if (existingIdx !== -1) {
    leads[existingIdx] = { ...leads[existingIdx], ...patch, updatedAt: now };
    writeLeads(leads);
    return leads[existingIdx];
  }

  const lead = {
    id: patch.id || `lead-${Date.now()}`,
    callId: patch.callId || null,
    name: patch.name || 'Unknown prospect',
    company: patch.company || '',
    email: patch.email || '',
    phone: patch.phone || '',
    product: patch.product || '',
    intent: patch.intent || 'unknown',
    objections: Array.isArray(patch.objections) ? patch.objections : [],
    notes: patch.notes || '',
    pipelineStatus: PIPELINE.includes(patch.pipelineStatus) ? patch.pipelineStatus : 'New',
    createdAt: now,
    updatedAt: now
  };
  leads.unshift(lead);
  writeLeads(leads);
  return lead;
}

export function updateLead(id, patch) {
  const leads = readLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  if (patch.pipelineStatus && !PIPELINE.includes(patch.pipelineStatus)) delete patch.pipelineStatus;
  leads[idx] = { ...leads[idx], ...patch, id, updatedAt: new Date().toISOString() };
  writeLeads(leads);
  return leads[idx];
}

export function deleteLead(id) {
  const leads = readLeads();
  const next = leads.filter(l => l.id !== id);
  if (next.length === leads.length) return false;
  writeLeads(next);
  return true;
}

// Extract structured lead info from a saved call's transcript.
export async function extractLeadFromCall(callId, bodyKey = null) {
  const call = db.getCalls().find(c => c.id === callId);
  if (!call) {
    const err = new Error('Call not found');
    err.status = 404;
    throw err;
  }

  const transcriptText = (call.transcript || [])
    .map(m => `${m.sender.toUpperCase()}: ${m.text}`)
    .join('\n');

  const apiKey = resolveApiKey(bodyKey);
  let extracted = null;

  if (apiKey && transcriptText) {
    try {
      const content = await groqChat({
        apiKey,
        messages: [
          { role: 'system', content: 'You extract CRM lead data from sales-call transcripts. Respond ONLY with valid JSON.' },
          {
            role: 'user',
            content: `From this sales call transcript, extract the prospect's details. Return JSON:
{"name": string|null, "company": string|null, "email": string|null, "phone": string|null, "intent": "hot"|"warm"|"cold"|"unknown", "objections": [string], "followUpNote": string}
If a field is not mentioned, use null.

TRANSCRIPT:
${transcriptText.slice(0, 6000)}`
          }
        ],
        maxTokens: 400,
        temperature: 0.1,
        json: true
      });
      extracted = parseJsonLoose(content);
    } catch (err) {
      console.warn('leads: Groq extraction failed, using regex fallback:', err.message);
    }
  }

  // Deterministic fallbacks (also fill gaps the LLM missed)
  const allText = transcriptText + ' ' + (call.customerName || '') + ' ' + (call.company || '');
  const emailMatch = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const phoneMatch = allText.match(/(\+?\d[\d\s\-().]{7,15}\d)/);
  // On a real phone call we already know who was on the line, so the dialled or
  // calling number beats a number the LLM may have invented from the transcript.
  const callerNumber = call.channel === 'phone'
    ? (call.direction === 'inbound' ? call.from : call.to) || ''
    : '';

  const lead = saveLead({
    callId: call.id,
    name: extracted?.name || call.customerName || 'Unknown prospect',
    company: extracted?.company || call.company || '',
    email: extracted?.email || emailMatch?.[0] || '',
    phone: callerNumber || extracted?.phone || phoneMatch?.[0]?.trim() || '',
    product: call.product,
    intent: ['hot', 'warm', 'cold'].includes(extracted?.intent) ? extracted.intent : inferIntent(call.status),
    objections: extracted?.objections || call.summary?.objections || [],
    notes: extracted?.followUpNote || call.summary?.nextSteps?.join(' · ') || '',
    pipelineStatus: 'New'
  });

  return { lead, message: `Lead captured for ${lead.name}` };
}

function inferIntent(status) {
  if (['Converted', 'Demo Requested'].includes(status)) return 'hot';
  if (status === 'Interested') return 'warm';
  if (['Not Interested', 'No Response'].includes(status)) return 'cold';
  return 'unknown';
}

// ---- Bulk import -------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INTENT_WORDS = {
  hot: 'hot', high: 'hot', 'high intent': 'hot', a: 'hot',
  warm: 'warm', medium: 'warm', b: 'warm', 'medium intent': 'warm',
  cold: 'cold', low: 'cold', c: 'cold', 'low intent': 'cold'
};

// Only digits count: "+1 (415) 555-0123" and "0014155550123" are the same
// customer and must not be imported twice.
const phoneKey = (value) => String(value || '').replace(/\D/g, '').replace(/^00/, '');

function normaliseRecord(raw) {
  const errors = [];
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ');
  const email = String(raw.email || '').trim().toLowerCase();
  const phone = String(raw.phone || '').trim();
  const company = String(raw.company || '').trim();
  const product = String(raw.product || '').trim();
  const notes = String(raw.notes || '').trim();

  if (!name) errors.push('No customer name');
  if (!phoneKey(phone) && !email) errors.push('Needs a phone number or an email to be callable');
  if (phone && phoneKey(phone).length < 7) errors.push('Phone number too short to dial');
  if (email && !EMAIL_RE.test(email)) errors.push(`Email is not valid (${email})`);

  const intentWord = String(raw.intent || '').trim().toLowerCase();
  const pipelineWord = String(raw.pipelineStatus || '').trim().toLowerCase();

  return {
    errors,
    name,
    company,
    email,
    phone,
    product,
    notes,
    intent: INTENT_WORDS[intentWord] || (['hot', 'warm', 'cold', 'unknown'].includes(intentWord) ? intentWord : 'unknown'),
    pipelineStatus: PIPELINE.find((p) => p.toLowerCase() === pipelineWord) || 'New'
  };
}

// Validate a CSV batch against the store and optionally write it.
// dryRun is what the import preview calls, so the numbers shown before
// confirming are produced by exactly the same rules as the real import.
export function importLeads(records, { dryRun = false, limit = 5000 } = {}) {
  const input = Array.isArray(records) ? records.slice(0, limit) : [];
  const leads = readLeads();
  const byEmail = new Map(leads.filter(l => l.email).map(l => [String(l.email).toLowerCase(), l]));
  const byPhone = new Map(leads.filter(l => l.phone).map(l => [phoneKey(l.phone), l]));

  const result = {
    dryRun,
    total: Array.isArray(records) ? records.length : 0,
    valid: 0,
    imported: 0,
    truncated: Array.isArray(records) && records.length > limit ? records.length - limit : 0,
    invalid: [],
    duplicates: [],
    created: [],
    sample: []
  };

  const accepted = [];
  for (const [index, raw] of input.entries()) {
    const record = normaliseRecord(raw);
    const line = raw.__line ?? index + 2;

    if (record.errors.length) {
      result.invalid.push({ line, name: record.name, reason: record.errors.join('; ') });
      continue;
    }

    const emailMatch = record.email ? byEmail.get(record.email) : null;
    const phoneMatch = record.phone ? byPhone.get(phoneKey(record.phone)) : null;
    if (emailMatch || phoneMatch) {
      const match = emailMatch || phoneMatch;
      result.duplicates.push({
        line,
        name: record.name,
        matchedOn: emailMatch ? 'email' : 'phone',
        existingId: match.id,
        existingName: match.name,
        reason: `Already in the customer list as ${match.name}`
      });
      continue;
    }

    // Reserve this row so a repeated contact inside one file is caught too.
    if (record.email) byEmail.set(record.email, { id: null, name: record.name });
    if (record.phone) byPhone.set(phoneKey(record.phone), { id: null, name: record.name });
    accepted.push(record);
  }

  result.valid = accepted.length;

  if (dryRun) {
    // Enough of the real parsed rows for the UI to show what will land,
    // produced by the same normalisation the commit runs.
    result.sample = accepted.slice(0, 8).map(({ name, company, email, phone, product, pipelineStatus }) => ({
      name, company, email, phone, product, pipelineStatus
    }));
  }
  if (dryRun || !accepted.length) return result;

  const now = new Date().toISOString();
  const stamp = Date.now();
  const newLeads = accepted.map((record, i) => ({
    id: `lead-${stamp}-${i}`,
    callId: null,
    name: record.name,
    company: record.company,
    email: record.email,
    phone: record.phone,
    product: record.product,
    intent: record.intent,
    objections: [],
    notes: record.notes,
    pipelineStatus: record.pipelineStatus,
    createdAt: now,
    updatedAt: now
  }));

  writeLeads([...newLeads, ...leads]);
  result.imported = newLeads.length;
  // Keep the response small; the UI only needs to show what landed.
  result.created = newLeads.slice(0, 50).map(({ id, name, company, email, phone }) => ({ id, name, company, email, phone }));
  return result;
}


// ---- Exports -----------------------------------------------------------------

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label || c.key)).join(',');
  const lines = rows.map(r => columns.map(c => csvEscape(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

export function callsCsv() {
  return toCsv(db.getCalls(), [
    { key: 'id' },
    { label: 'date', key: 'timestamp' },
    { key: 'customerName' },
    { key: 'company' },
    { key: 'product' },
    { key: 'channel' },
    { label: 'direction', key: 'direction' },
    { key: 'language' },
    { label: 'status', key: 'status' },
    { label: 'call_outcome', key: 'outcome' },
    { label: 'call_sid', key: 'callSid' },
    { label: 'from_number', key: 'from' },
    { label: 'to_number', key: 'to' },
    { label: 'twilio_error_code', key: 'twilioErrorCode' },
    { label: 'duration_seconds', key: 'duration' },
    { label: 'deal_score', get: c => c.summary?.dealScore ?? '' },
    { label: 'sentiment', get: c => c.summary?.sentiment ?? '' },
    { label: 'transcript_turns', get: c => (c.transcript || []).length },
    { label: 'recording_url', key: 'recordingUrl' }
  ]);
}

export function leadsCsv() {
  return toCsv(getLeads(), [
    { key: 'id' },
    { key: 'name' },
    { key: 'company' },
    { key: 'email' },
    { key: 'phone' },
    { key: 'product' },
    { key: 'intent' },
    { label: 'pipeline_status', key: 'pipelineStatus' },
    { label: 'objections', get: l => (l.objections || []).join(' | ') },
    { label: 'notes', key: 'notes' },
    { label: 'call_id', key: 'callId' },
    { label: 'created_at', key: 'createdAt' }
  ]);
}

export { PIPELINE };
