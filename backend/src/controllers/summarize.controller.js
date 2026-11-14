import { generateConversationSummary } from '../services/summarizer.js';

// Post-call intelligence: overview, requirements, objections, next steps,
// deal probability and sales status classification.
//
// The transcript is summarised with the server's own Groq key — the request body
// no longer chooses which key is billed.
export async function summarize(req, res) {
  try {
    const {
      transcript = [],
      product = 'DevPulse AI'
    } = req.body;

    if (!Array.isArray(transcript) || !transcript.length) {
      return res.status(400).json({ error: 'A transcript is required to summarise a call' });
    }

    const summaryData = await generateConversationSummary({ transcript, product });
    res.json(summaryData);
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({ error: 'Failed to generate conversation summary' });
  }
}
