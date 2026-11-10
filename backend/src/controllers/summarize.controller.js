import { generateConversationSummary } from '../services/summarizer.js';

// Post-call intelligence: overview, requirements, objections, next steps,
// deal probability and sales status classification.
export async function summarize(req, res) {
  try {
    const {
      transcript = [],
      product = 'DevPulse AI',
      apiKey = null
    } = req.body;

    const summaryData = await generateConversationSummary({ transcript, product, apiKey });
    res.json(summaryData);
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({ error: 'Failed to generate conversation summary' });
  }
}
