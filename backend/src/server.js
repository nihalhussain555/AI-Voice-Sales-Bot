// Backend entrypoint: build the app, open the port, wire the phone websocket.

import { createApp } from './app.js';
import { createTelephony } from './services/telephony.js';
import { serverConfig, groqConfig, twilioConfig } from './config/env.js';

const twilio = twilioConfig();
const telephony = createTelephony();
const app = createApp({ telephonyRouter: telephony.router });

const server = app.listen(serverConfig.port, () => {
  console.log(`🚀 VoicePitch AI API on http://localhost:${serverConfig.port} [${serverConfig.env}]`);
  console.log(`   ai provider: groq (${groqConfig.chatModel}) — key ${groqConfig.apiKey() ? 'configured' : 'missing, demo engine active'}`);
  console.log(`   telephony:   ${telephony.twilioConfigured ? `Twilio number ${twilio.phoneNumber || 'not set'}` : 'disabled (set TWILIO_* env vars)'}`);
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
