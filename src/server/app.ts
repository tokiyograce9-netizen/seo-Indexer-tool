import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { db } from './db';
import {
  handleLogin,
  handleVerifyOtp,
  handleCheckSession,
  handleLogout,
  requireAuth,
} from './auth';
import {
  executeBulkIndexing,
  testServiceAccountKey,
  verifyUrlForIndexing,
} from './indexing';
import { ServiceAccount, ServiceAccountCredentials } from '../lib/types';

dotenv.config();

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Create API router
const apiRouter = express.Router();

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------
apiRouter.post('/auth/login', handleLogin);
apiRouter.post('/auth/verify-otp', handleVerifyOtp);
apiRouter.get('/auth/session', handleCheckSession);
apiRouter.post('/auth/logout', handleLogout);

// -------------------------------------------------------------
// SYSTEM & DATABASE STATUS
// -------------------------------------------------------------
apiRouter.get('/system/status', async (req: Request, res: Response) => {
  try {
    const status = await db.getSystemStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch status' });
  }
});

apiRouter.post('/system/config-supabase', requireAuth, (req: Request, res: Response) => {
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

apiRouter.get('/schema-sql', (req: Request, res: Response) => {
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

apiRouter.post('/system/quota-limit', requireAuth, (req: Request, res: Response) => {
  const { limit } = req.body;
  const num = parseInt(limit, 10);
  const updated = db.setQuotaLimit(num === 100 ? 100 : 200);
  return res.json({ success: true, quotaLimitPerAccount: updated });
});

// -------------------------------------------------------------
// SERVICE ACCOUNTS ROUTES (Protected)
// -------------------------------------------------------------
apiRouter.get('/accounts', requireAuth, async (req: Request, res: Response) => {
  try {
    const accounts = await db.getAccounts();
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

apiRouter.post('/accounts/upload', requireAuth, async (req: Request, res: Response) => {
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
        continue;
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

apiRouter.patch('/accounts/:id/toggle', requireAuth, async (req: Request, res: Response) => {
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

apiRouter.post('/accounts/:id/test', requireAuth, async (req: Request, res: Response) => {
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

apiRouter.post('/accounts/:id/reset-quota', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.resetAccountQuota(id);
    return res.json({ success: true, message: 'Daily quota reset to 0' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/accounts/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await db.deleteAccount(id);
    return res.json({ success: deleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/accounts/demo-seed', requireAuth, async (req: Request, res: Response) => {
  try {
    await db.seedDemoAccounts();
    return res.json({ success: true, message: 'Seeded demo accounts for preview and testing.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/accounts/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { project_name, credentials, rawJson } = req.body;
    const existing = await db.getAccountById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updates: Partial<ServiceAccount> = {};
    if (project_name && typeof project_name === 'string') {
      updates.project_name = project_name.trim();
    }

    let parsedCreds = credentials;
    if (rawJson) {
      parsedCreds = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    }

    if (parsedCreds) {
      const creds = parsedCreds.credentials || parsedCreds;
      if (!creds.client_email || !creds.private_key) {
        return res.status(400).json({ error: 'Invalid service account JSON: missing client_email or private_key' });
      }
      updates.client_email = creds.client_email;
      if (creds.project_id) updates.project_name = creds.project_id;
      updates.credentials = {
        type: creds.type || 'service_account',
        project_id: creds.project_id || updates.project_name || existing.project_name,
        private_key_id: creds.private_key_id,
        private_key: creds.private_key,
        client_email: creds.client_email,
        client_id: creds.client_id,
        auth_uri: creds.auth_uri,
        token_uri: creds.token_uri,
      };
    }

    const updated = await db.updateAccount(id, updates);
    return res.json({
      success: true,
      account: {
        id: updated?.id,
        project_name: updated?.project_name,
        client_email: updated?.client_email,
        is_active: updated?.is_active,
      },
      message: 'Account credentials updated successfully.',
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'Update failed: ' + err.message });
  }
});

// -------------------------------------------------------------
// BULK INDEXING & ROTATION ENGINE
// -------------------------------------------------------------
apiRouter.post('/indexing/publish', requireAuth, async (req: Request, res: Response) => {
  try {
    const { urls, notificationType, dryRun, quotaLimit } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of URLs to index.' });
    }

    const summary = await executeBulkIndexing(
      urls,
      notificationType === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED',
      Boolean(dryRun),
      quotaLimit ? parseInt(quotaLimit, 10) : undefined
    );

    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Indexing batch failed' });
  }
});

apiRouter.post('/indexing/verify-url', requireAuth, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a URL to verify.' });
    }
    const result = await verifyUrlForIndexing(url);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Inspection failed' });
  }
});

// -------------------------------------------------------------
// URL LOGS ROUTES
// -------------------------------------------------------------
apiRouter.get('/logs', requireAuth, async (req: Request, res: Response) => {
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

apiRouter.delete('/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    await db.clearLogs();
    return res.json({ success: true, message: 'Logs cleared.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/logs/export', requireAuth, async (req: Request, res: Response) => {
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

// Mount router on both /api (standard) and / (if rewrite strips /api)
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Catch-all for API routes to guarantee JSON response and prevent SPA fallback to index.html
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl || req.url}` });
});

export default app;
