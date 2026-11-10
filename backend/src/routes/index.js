// Every HTTP route the API exposes, mounted under one place.

import healthRoutes from './health.routes.js';
import catalogRoutes from './catalog.routes.js';
import chatRoutes from './chat.routes.js';
import summarizeRoutes from './summarize.routes.js';
import callsRoutes from './calls.routes.js';
import analyticsRoutes from './analytics.routes.js';
import leadsRoutes from './leads.routes.js';
import exportRoutes from './export.routes.js';
import recordingsRoutes from './recordings.routes.js';

export default function registerRoutes(app, { telephonyRouter } = {}) {
  app.use('/api/health', healthRoutes);
  app.use('/api/products', catalogRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/summarize', summarizeRoutes);
  app.use('/api/calls', callsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/leads', leadsRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api', recordingsRoutes);

  // Twilio webhooks + media stream endpoints live in the telephony service and
  // must mount before any SPA catch-all.
  if (telephonyRouter) app.use(telephonyRouter);
}
