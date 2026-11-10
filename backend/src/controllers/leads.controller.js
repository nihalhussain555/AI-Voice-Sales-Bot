import { getLeads, saveLead, updateLead, deleteLead, extractLeadFromCall } from '../models/leads.js';

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
