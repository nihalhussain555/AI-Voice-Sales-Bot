// Backend entrypoint: build the app, open the port, wire the phone websocket.

import { createApp } from './app.js';
import { createTelephony } from './services/telephony.js';
import { createCallLifecycle } from './services/callLifecycle.js';
import { createPhoneService } from './services/phoneService.js';
import { db } from './models/db.js';
import { generateConversationSummary } from './services/summarizer.js';
import { serverConfig, groqConfig, twilioConfig, twilioReadiness } from './config/env.js';

// One lifecycle instance shared by the Twilio-facing pipeline and the
// app-facing phone service: a call attempt has exactly one source of truth.
const lifecycle = createCallLifecycle({
  db,
  summarize: generateConversationSummary,
  config: twilioConfig,
  log: (...args) => console.log('[calls]', ...args)
});

const telephony = createTelephony({ lifecycle });
const phoneService = createPhoneService({ lifecycle });
const app = createApp({ telephonyRouter: telephony.router, phoneService });

const ready = twilioReadiness();
const server = app.listen(serverConfig.port, () => {
  console.log(`🚀 VoicePitch AI API on http://localhost:${serverConfig.port} [${serverConfig.env}]`);
  console.log(`   ai provider: groq (${groqConfig.chatModel}) — key ${groqConfig.apiKey() ? 'configured' : 'missing, demo engine active'}`);
  console.log(`   phone:       ${ready.mode === 'live'
    ? `LIVE calling on ${ready.phoneNumber} (webhook ${ready.webhookUrl})`
    : `demo only — live calling needs ${ready.dialMissing.join(', ') || 'TWILIO_* env vars'}`}`);
  if (ready.mode === 'live' && !ready.aiReady) {
    console.log('   phone:       GROQ_API_KEY missing — inbound calls will hang up, dials refused');
  }
  console.log(`   frontend:    ${serverConfig.serveFrontend ? 'served from this port' : 'hosted separately (set VITE_API_BASE_URL)'}`);
});

// Media Streams audio arrives over a websocket on the same port as the REST API.
telephony.attachWebSocket(server);

// Render/Vercel-style container shutdown.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} received — closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
