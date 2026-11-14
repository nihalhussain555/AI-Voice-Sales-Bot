// Express application assembly: middleware, routes, static assets. No listen()
// here — that belongs to server.js so tests can import the app without a port.

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';

import { serverConfig, paths, corsOriginAllowed } from './config/env.js';
import { authenticate, requireTrustedOrigin } from './middleware/require-auth.js';
import registerRoutes from './routes/index.js';
import { notFound, apiError } from './middleware/error-handler.js';

// Express accepts a hop count, a boolean, an IP or a subnet for 'trust proxy';
// TRUST_PROXY therefore has to be converted out of its env-string form.
function parseTrustProxy(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return 1;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}

export function createApp({ telephonyRouter, phoneService } = {}) {
  const app = express();

  if (phoneService) app.locals.phoneService = phoneService;

  // One proxy hop is the normal deployment shape (Render, nginx, a load
  // balancer). Without this every request would appear to come from the proxy,
  // and per-address login throttling would rate-limit the whole world at once.
  // An env var is always a string, so the common spellings are converted here —
  // passing 'false' through untouched would make proxy-addr try to parse it as
  // an IP address and crash on the first request.
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  // Sessions travel in a cookie, so an allowed origin must be echoed back
  // exactly — '*' cannot be combined with credentials. See corsOriginAllowed().
  app.use(cors({
    origin(origin, cb) {
      // No Origin header: a same-origin navigation, a mobile app, curl or
      // Twilio. Not a browser cross-origin request, so nothing to allow.
      if (!origin) return cb(null, true);
      return cb(null, corsOriginAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600
  }));

  app.use(express.json({ limit: serverConfig.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: serverConfig.bodyLimit }));
  app.use(cookieParser());
  // Attaches req.user when a valid session cookie is present; never rejects.
  app.use(authenticate);
  app.use('/api', requireTrustedOrigin);

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
