// Backend entrypoint: build the app, open the port, wire the phone websocket.

import { createApp } from './app.js';
import { createTelephony } from './services/telephony.js';
import { createCallLifecycle } from './services/callLifecycle.js';
import { createPhoneService } from './services/phoneService.js';
import { db } from './models/db.js';
import { firstUserId, countUsers } from './models/users.js';
import { migrateLegacyWorkspaces } from './models/migrate.js';
import { mailStatus } from './services/mailer.js';
import { generateConversationSummary } from './services/summarizer.js';
import {
  ensureDataDirs, serverConfig, groqConfig, twilioConfig, twilioReadiness, authConfig, corsOriginAllowed
} from './config/env.js';

ensureDataDirs();

// Data that predates accounts has one home: the first registered user. Running
// this before the port opens means the very first request never sees a
// half-migrated workspace.
const migration = migrateLegacyWorkspaces();
if (migration.ran && migration.reason !== 'nothing-to-migrate') {
  console.log(`📦 adopted pre-auth data into account ${migration.ownerId}`);
}

// One lifecycle instance shared by the Twilio-facing pipeline and the
// app-facing phone service: a call attempt has exactly one source of truth.
//
// resolveUserId covers inbound calls, which arrive from Twilio with no session
// to attribute them to, so they land in the account that owns the number.
const lifecycle = createCallLifecycle({
  db,
  summarize: generateConversationSummary,
  config: twilioConfig,
  resolveUserId: firstUserId,
  log: (...args) => console.log('[calls]', ...args)
});

const telephony = createTelephony({ lifecycle });
const phoneService = createPhoneService({ lifecycle });
const app = createApp({ telephonyRouter: telephony.router, phoneService });

const ready = twilioReadiness();
const mail = mailStatus();
const server = app.listen(serverConfig.port, () => {
  console.log(`🚀 VoicePitch AI API on http://localhost:${serverConfig.port} [${serverConfig.env}]`);
  console.log(`   auth:        ${countUsers()} account(s); sessions ${Math.round(authConfig.sessionTtlMs / 60000)}m idle, cookie ${authConfig.cookieName}${authConfig.cookieSecure ? ' (Secure)' : ''}`);
  console.log(`   cors:        ${serverConfig.corsOrigin === '*'
    ? 'same-origin only (set CORS_ORIGIN for a separately hosted frontend)'
    : `allow-list: ${serverConfig.corsOrigin}`}`);
  console.log(`   mail:        ${mail.configured
    ? `SMTP ${mail.host}:${mail.port} — password reset emails enabled`
    : 'not configured — reset links print to this console' + (mail.echoInConsole ? '' : ' (disabled)')}`);
  console.log(`   ai provider: groq (${groqConfig.chatModel}) — key ${groqConfig.apiKey() ? 'configured' : 'missing, demo engine active'}`);
  console.log(`   phone:       ${ready.mode === 'live'
    ? `LIVE calling on ${ready.phoneNumber} (webhook ${ready.webhookUrl})`
    : `demo only — live calling needs ${ready.dialMissing.join(', ') || 'TWILIO_* env vars'}`}`);
  if (ready.mode === 'live' && !ready.aiReady) {
    console.log('   phone:       GROQ_API_KEY missing — inbound calls will hang up, dials refused');
  }
  console.log(`   frontend:    ${serverConfig.serveFrontend ? 'served from this port' : 'hosted separately (set VITE_API_BASE_URL)'}`);
  if (!authConfig.cookieSecure && serverConfig.env === 'production') {
    console.log('   ⚠ COOKIE_SECURE is off in production — the session cookie will travel over plain HTTP');
  }
  if (serverConfig.env === 'production' && corsOriginAllowed('http://example.invalid')) {
    console.log('   ⚠ CORS is accepting arbitrary localhost origins in production');
  }
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
