import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { db } from './src/server/db';
import {
  handleLogin,
  handleVerifyOtp,
  handleCheckSession,
  handleLogout,
  requireAuth,
} from './src/server/auth';
import { executeBulkIndexing, testServiceAccountKey } from './src/server/indexing';
import { ServiceAccountCredentials } from './src/lib/types';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());

  // CORS / security headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // -------------------------------------------------------------
  // AUTHENTICATION ROUTES
  // -------------------------------------------------------------
  app.post('/api/auth/login', handleLogin);
  app.post('/api/auth/verify-otp', handleVerifyOtp);
  app.get('/api/auth/session', handleCheckSession);
  app.post('/api/auth/logout', handleLogout);

  // -------------------------------------------------------------
  // SYSTEM & DATABASE STATUS
  // -------------------------------------------------------------
  app.get('/api/system/status', async (req: Request, res: Response) => {
    try {
      const status = await db.getSystemStatus();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch status' });
    }
  });

  app.post('/api/system/config-supabase', requireAuth, (req: Request, res: Response) => {
    const { url, key } = req.body;
    if (!url || !key) {
      return res.status(400).json({ error: 'Supabase URL and Key are required.' });
    }
    const success = db.setCustomSupabaseConfig(url, key);
    return res.json({
      success,
      message: success
        ? 'Connected to Supabase PostgreSQL successfully!'
        : 'Could not connect to Supabase with provided credentials.',
    });
  });

  app.get('/api/schema-sql', (req: Request, res: Response) => {
    try {
      const sqlPath = path.resolve(process.cwd(), 'schema.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        return res.type('text/plain').send(sql);
      }
      return res.status(404).send('schema.sql not found');
    } catch {
      return res.status(500).send('Error reading schema.sql');
    }
  });

  // -------------------------------------------------------------
  // SERVICE ACCOUNTS ROUTES (Protected)
  // -------------------------------------------------------------
  app.get('/api/accounts', requireAuth, async (req: Request, res: Response) => {
    try {
      const accounts = await db.getAccounts();
      // Mask private key in response for security
      const safeAccounts = accounts.map((a) => ({
        id: a.id,
        project_name: a.project_name,
        client_email: a.client_email,
        daily_count: a.daily_count,
        last_reset_date: a.last_reset_date,
        is_active: a.is_active,
        created_at: a.created_at,
        has_credentials: Boolean(a.credentials?.private_key),
      }));
      return res.json(safeAccounts);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/accounts/upload', requireAuth, async (req: Request, res: Response) => {
    try {
      const { files, rawJson } = req.body;
      const uploadedAccounts = [];

      let payloads: any[] = [];
      if (Array.isArray(files) && files.length > 0) {
        payloads = files;
      } else if (rawJson) {
        const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
        payloads = Array.isArray(parsed) ? parsed : [parsed];
      }

      if (payloads.length === 0) {
        return res.status(400).json({ error: 'No valid service account JSON payload provided.' });
      }

      for (const item of payloads) {
        const creds = item.credentials || item;
        const projectId = creds.project_id || creds.projectId || creds.project_name || 'unknown-project';
        const clientEmail = creds.client_email || creds.clientEmail || '';
        const privateKey = creds.private_key || creds.privateKey || '';

        if (!clientEmail || !privateKey) {
          continue; // Skip invalid
        }

        const credentialsObj: ServiceAccountCredentials = {
          type: creds.type || 'service_account',
          project_id: projectId,
          private_key_id: creds.private_key_id,
          private_key: privateKey,
          client_email: clientEmail,
          client_id: creds.client_id,
          auth_uri: creds.auth_uri,
          token_uri: creds.token_uri,
        };

        const saved = await db.saveAccount({
          project_name: projectId,
          client_email: clientEmail,
          credentials: credentialsObj,
          daily_count: 0,
          last_reset_date: new Date().toISOString().split('T')[0],
          is_active: true,
        });

        uploadedAccounts.push({
          id: saved.id,
          project_name: saved.project_name,
          client_email: saved.client_email,
        });
      }

      if (uploadedAccounts.length === 0) {
        return res.status(400).json({
          error: 'Could not extract valid Google Cloud service account keys (missing client_email or private_key).',
        });
      }

      return res.json({
        success: true,
        count: uploadedAccounts.length,
        accounts: uploadedAccounts,
        message: `Successfully registered ${uploadedAccounts.length} Google service account key(s).`,
      });
    } catch (err: any) {
      return res.status(400).json({ error: 'Failed to process service account JSON: ' + err.message });
    }
  });

  app.patch('/api/accounts/:id/toggle', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const account = await db.getAccountById(id);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
      const updated = await db.updateAccount(id, { is_active: !account.is_active });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/accounts/:id/test', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const account = await db.getAccountById(id);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
      const testResult = await testServiceAccountKey(account);
      return res.json(testResult);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/accounts/:id/reset-quota', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await db.resetAccountQuota(id);
      return res.json({ success: true, message: 'Daily quota reset to 0' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/accounts/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await db.deleteAccount(id);
      return res.json({ success: deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/accounts/demo-seed', requireAuth, async (req: Request, res: Response) => {
    try {
      await db.seedDemoAccounts();
      return res.json({ success: true, message: 'Seeded 3 demo accounts for preview and testing.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // BULK INDEXING & ROTATION ENGINE
  // -------------------------------------------------------------
  app.post('/api/indexing/publish', requireAuth, async (req: Request, res: Response) => {
    try {
      const { urls, notificationType, dryRun } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of URLs to index (max 100).' });
      }

      const summary = await executeBulkIndexing(
        urls,
        notificationType === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED',
        Boolean(dryRun)
      );

      return res.json(summary);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Indexing batch failed' });
    }
  });

  // -------------------------------------------------------------
  // URL LOGS ROUTES
  // -------------------------------------------------------------
  app.get('/api/logs', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt((req.query.limit as string) || '150', 10);
      const status = req.query.status as string;
      const search = req.query.search as string;

      const logs = await db.getUrlLogs(limit, status, search);
      return res.json(logs);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/logs', requireAuth, async (req: Request, res: Response) => {
    try {
      await db.clearLogs();
      return res.json({ success: true, message: 'Logs cleared.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/logs/export', requireAuth, async (req: Request, res: Response) => {
    try {
      const logs = await db.getUrlLogs(1000);
      const csvRows = [
        ['Timestamp', 'URL', 'Status', 'Notification Type', 'HTTP Code', 'Project Name', 'Message'].join(','),
      ];
      for (const log of logs) {
        csvRows.push([
          `"${log.created_at}"`,
          `"${log.url}"`,
          `"${log.status}"`,
          `"${log.notification_type}"`,
          `"${log.http_code || ''}"`,
          `"${(log.used_project_name || '').replace(/"/g, '""')}"`,
          `"${(log.response_message || '').replace(/"/g, '""')}"`,
        ].join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="openindex_logs.csv"');
      return res.send(csvRows.join('\n'));
    } catch (err: any) {
      return res.status(500).send('Export error: ' + err.message);
    }
  });

  // -------------------------------------------------------------
  // VITE DEV SERVER / STATIC ASSETS
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenIndex Server online on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
