import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { router } from './routes.js';

export function createServer() {
  const app = express();
  const staticDir = path.resolve(process.cwd(), 'public');

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use(express.static(staticDir));
  app.use(router);

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(staticDir, 'index.html'), err => (err ? next(err) : undefined));
  });

  return app;
}
