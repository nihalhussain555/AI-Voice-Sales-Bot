// Live configuration status — the Settings page reads this to show which AI
// provider and telephony mode the server is actually running in.

import { GROQ_CHAT_MODEL } from '../services/groqClient.js';
import { groqConfig, twilioReadiness } from '../config/env.js';

export function health(req, res) {
  const ready = twilioReadiness();
  res.json({
    ok: true,
    provider: 'groq',
    chatModel: GROQ_CHAT_MODEL,
    // Model names only — never the key, which stays in the server environment.
    voice: {
      sttModel: groqConfig.sttModel,
      ttsModel: groqConfig.ttsModel,
      ttsVoice: groqConfig.ttsVoice
    },
    groqKeyConfigured: Boolean(groqConfig.apiKey()),
    twilioConfigured: ready.inboundReady,
    publicBaseUrl: ready.publicBaseUrl,
    phone: {
      mode: ready.mode,
      dialReady: ready.dialReady,
      inboundReady: ready.inboundReady,
      missing: ready.dialMissing,
      phoneNumber: ready.phoneNumber,
      webhookUrl: ready.webhookUrl,
      eventsUrl: ready.eventsUrl
    },
    version: '2.1.0'
  });
}
