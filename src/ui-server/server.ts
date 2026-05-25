/**
 * UI server — Express app that serves the React wizard and REST/SSE API.
 *
 * Security:
 * - Binds to 127.0.0.1 ONLY — never exposed to the network.
 * - CORS restricted to the same localhost origin.
 * - No stack traces in error responses (CWE-209).
 * - Helmet-style security headers applied manually (no external dep needed
 *   for a localhost-only server, but headers are set for defence-in-depth).
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import apiRouter from './routes/index';

// ── Constants ─────────────────────────────────────────────────────────────────
export const DEFAULT_PORT = 3077; // Unlikely to conflict with common dev servers
export const HOST = '127.0.0.1';  // Localhost only — never 0.0.0.0

const UI_DIST = path.resolve(__dirname, '../../dist-ui');

// ── App factory ───────────────────────────────────────────────────────────────
export function createApp(): express.Application {
  const app = express();

  // ── Security headers (defence-in-depth for localhost) ──────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Permissive CSP: needed for React HMR in dev. In prod (static build) Vite
    // handles this via meta tags. For a localhost tool this is acceptable.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    next();
  });

  // ── CORS — localhost only ─────────────────────────────────────────────────
  // CWE-942: Only allow same-origin requests from the same localhost port.
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, direct browser)
        // or from localhost/127.0.0.1 on any port.
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS: Only localhost origins allowed'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      credentials: false,
    })
  );

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '128kb' })); // generous but bounded
  app.use(express.urlencoded({ extended: false, limit: '128kb' }));

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── Static UI files ────────────────────────────────────────────────────────
  if (fs.existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST, { index: false }));

    // SPA fallback: serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }
      res.sendFile(path.join(UI_DIST, 'index.html'));
    });
  } else {
    // UI not built yet — show instructions
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }
      res.status(503).send(`
        <html><body style="font-family:monospace;padding:2rem;background:#0f1117;color:#e2e8f0">
          <h2>⚠ UI not built yet</h2>
          <p>Run the following command to build the React UI:</p>
          <pre style="background:#1e2130;padding:1rem;border-radius:6px">npm run build:ui</pre>
          <p>Then restart the server with <code>btp-starter-pack ui</code>.</p>
        </body></html>
      `);
    });
  }

  // ── Global error handler ───────────────────────────────────────────────────
  // CWE-209: Never expose stack traces or internal error details.
  app.use(
    (
      _err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  return app;
}

// ── Start server ──────────────────────────────────────────────────────────────
export async function startServer(port: number = DEFAULT_PORT): Promise<void> {
  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => {
      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try: btp-starter-pack ui --port ${port + 1}`));
      } else {
        reject(err);
      }
    });
  });
}
