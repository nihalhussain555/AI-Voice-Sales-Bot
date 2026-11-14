// Every HTTP route the API exposes, mounted under one place.
//
// Public surface: /api/health (Render's health check) and /api/auth/*.
// Everything else carries a session cookie and is scoped to that account — the
// guard lives inside each router rather than on an /api prefix, so the Twilio
// webhooks mounted below cannot be caught by it.

import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import catalogRoutes from './catalog.routes.js';
import chatRoutes from './chat.routes.js';
import summarizeRoutes from './summarize.routes.js';
import callsRoutes from './calls.routes.js';
import analyticsRoutes from './analytics.routes.js';
import leadsRoutes from './leads.routes.js';
import exportRoutes from './export.routes.js';
import recordingsRoutes from './recordings.routes.js';
import phoneRoutes from './phone.routes.js';
import agentRoutes from './agent.routes.js';
import workspaceRoutes from './workspace.routes.js';

export default function registerRoutes(app, { telephonyRouter } = {}) {
  // Machine-facing and pre-sign-in endpoints. Twilio authenticates these with a
  // request signature, not a session, so they must never see requireAuth.
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  if (telephonyRouter) app.use(telephonyRouter);

  // Authenticated workspace surface.
  app.use('/api/products', catalogRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/summarize', summarizeRoutes);
  app.use('/api/calls', callsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/leads', leadsRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/recordings', recordingsRoutes);
  // Outbound dialing + live call status for the UI (needs app.locals.phoneService).
  app.use('/api/phone', phoneRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/workspace', workspaceRoutes);
}
