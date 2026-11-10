// Live configuration status — the Settings page reads this to show which AI
// provider and telephony mode the server is actually running in.

import { GROQ_CHAT_MODEL } from '../services/groqClient.js';
import { groqConfig, twilioConfig } from '../config/env.js';

export function health(req, res) {
  const twilio = twilioConfig();
  res.json({
    ok: true,
    provider: 'groq',
    chatModel: GROQ_CHAT_MODEL,
    groqKeyConfigured: Boolean(groqConfig.apiKey()),
    twilioConfigured: Boolean(twilio.accountSid && twilio.authToken),
    publicBaseUrl: twilio.publicBaseUrl || null,
    version: '2.1.0'
  });
}
