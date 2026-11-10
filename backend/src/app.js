// Express application assembly: middleware, routes, static assets. No listen()
// here — that belongs to server.js so tests can import the app without a port.

import express from 'express';
import cors from 'cors';
import path from 'path';

import { serverConfig, paths, ensureDataDirs } from './config/env.js';
import registerRoutes from './routes/index.js';
import { notFound, apiError } from './middleware/error-handler.js';

export function createApp({ telephonyRouter } = {}) {
  ensureDataDirs();

  const app = express();

  app.use(cors({ origin: serverConfig.corsOrigin }));
  app.use(express.json({ limit: serverConfig.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: serverConfig.bodyLimit }));

  // Call recordings are read back from here by both the SPA and the phone pipeline.
  app.use('/recordings', express.static(paths.recordings));

  registerRoutes(app, { telephonyRouter });

  // Single-port local runs only: on a split deployment the frontend is hosted
  // elsewhere and this directory does not exist, so the block is skipped.
  if (serverConfig.serveFrontend) {
    app.use(express.static(paths.frontendDist));
    app.get('*', (req, res, next) => {
      // API and audio paths must fall through to the JSON 404 handler, never
      // answer with index.html (that silently broke client error reporting).
      if (req.path.startsWith('/api/') || req.path.startsWith('/recordings/')) return next();
      res.sendFile(path.join(paths.frontendDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(apiError);

  return app;
}
