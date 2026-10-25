import type { Request, Response } from 'express';
import app from '../src/server/app';

export default function handler(req: Request, res: Response) {
  if (req.url) {
    if (req.url.startsWith('/api/index.ts')) {
      req.url = req.url.replace(/^\/api\/index\.ts/, '') || '/';
    } else if (req.url.startsWith('/api/index')) {
      req.url = req.url.replace(/^\/api\/index/, '') || '/';
    }
  }
  return app(req, res);
}
