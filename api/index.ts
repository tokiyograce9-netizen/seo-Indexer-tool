import type { Request, Response } from 'express';
import app from '../src/server/app';

export default function handler(req: Request, res: Response) {
  try {
    if (req.url) {
      if (req.url.startsWith('/api/index.ts')) {
        req.url = req.url.replace(/^\/api\/index\.ts/, '') || '/';
      } else if (req.url.startsWith('/api/index')) {
        req.url = req.url.replace(/^\/api\/index/, '') || '/';
      }
    }
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler Crash]:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || 'Server error' });
    }
  }
}
