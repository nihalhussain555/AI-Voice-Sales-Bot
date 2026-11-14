import { generateTurn } from '../services/salesTurn.js';
import { getSettings } from '../models/settings.js';

// One conversational sales turn.
//
// The product is chosen by id and resolved against the signed-in user's own
// custom products; a request body used to be able to carry a whole product
// definition, which meant the agent's prompt came from the client instead of
// from the user's saved configuration.
export async function chat(req, res) {
  try {
    const {
      message,
      history = [],
      productKey = 'devpulse',
      language = 'English'
    } = req.body;

    const result = await generateTurn({
      message,
      history,
      productKey,
      language,
      userProducts: getSettings(req.user.id).customProducts
    });
    return res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    // A configured key that fails must NOT silently pretend the demo engine works.
    const status = error.name === 'GroqError' ? (error.status >= 400 && error.status < 600 ? error.status : 502) : 500;
    res.status(status).json({
      error: error.message || 'Failed to process chat message',
      provider: 'groq'
    });
  }
}
