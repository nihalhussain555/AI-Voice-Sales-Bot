import { db } from '../models/db.js';

// Call history store (JSON-file backed).
export function listCalls(req, res) {
  try {
    res.json({ calls: db.getCalls() });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
}

export function createCall(req, res) {
  try {
    res.json({ call: db.saveCall(req.body) });
  } catch (error) {
    console.error('Error saving call:', error);
    res.status(500).json({ error: 'Failed to save call' });
  }
}

export function removeCall(req, res) {
  try {
    if (db.deleteCall(req.params.id)) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Call not found' });
    }
  } catch (error) {
    console.error('Error deleting call:', error);
    res.status(500).json({ error: 'Failed to delete call' });
  }
}
