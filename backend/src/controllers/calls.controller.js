import { db } from '../models/db.js';

// Call history for the signed-in user. `req.user.id` is the only thing that
// decides which workspace is read or written — nothing in the request body can
// point these handlers at another account.
export function listCalls(req, res) {
  try {
    res.json({ calls: db.getCalls(req.user.id) });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
}

export function createCall(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'A call object is required' });
    }
    res.json({ call: db.saveCall(req.user.id, req.body) });
  } catch (error) {
    console.error('Error saving call:', error);
    res.status(500).json({ error: 'Failed to save call' });
  }
}

export function removeCall(req, res) {
  try {
    const removed = db.deleteCall(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Call not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting call:', error);
    res.status(500).json({ error: 'Failed to delete call' });
  }
}
