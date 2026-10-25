import type { Request, Response } from 'express';
import app from './_server/app.js';

export default function handler(req: Request, res: Response) {
  try {
    if (req.url) {
      // Vercel might pass /api/index.ts/some/path or /api/index/some/path
      // We only want to strip the actual handler file name if present
      if (req.url.startsWith('/api/index.ts')) {
        const remaining = req.url.substring(13);
        if (!remaining || remaining.startsWith('/')) {
          req.url = remaining || '/';
        }
      } else if (req.url.startsWith('/api/index')) {
        const remaining = req.url.substring(10);
        if (!remaining || remaining.startsWith('/')) {
          req.url = remaining || '/';
        }
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
