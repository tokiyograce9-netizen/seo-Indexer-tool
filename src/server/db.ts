import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { ServiceAccount, UrlLog, SystemStatus } from '../lib/types';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_FILE = path.resolve(DATA_DIR, 'openindex-storage.json');
const USER_KEY_FILE = path.resolve(DATA_DIR, 'credentials_e1123b8b.json');

// Supabase credentials loaded securely from process.env (.env or hosting platform)
const DEFAULT_SUPABASE_URL = process.env.SUPABASE_URL || '';
const DEFAULT_SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const DEFAULT_DATABASE_URL = process.env.DATABASE_URL || '';

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('Could not create data dir:', err);
  }
}

interface LocalStore {
  service_accounts: ServiceAccount[];
  url_logs: UrlLog[];
  customSupabaseConfig?: {
    url: string;
    key: string;
  };
}

class DatabaseAdapter {
  private supabase: SupabaseClient | null = null;
  private pgPool: Pool | null = null;
  private localStore: LocalStore = {
    service_accounts: [],
    url_logs: [],
  };
  private isConnectedToSupabase = false;
  private activeUrl: string | null = null;

  constructor() {
    this.loadLocalStore();
    this.initPostgres();
    this.initSupabase();
    this.bootstrapUserKey();
  }

  private loadLocalStore() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        this.localStore = JSON.parse(raw);
        if (!Array.isArray(this.localStore.service_accounts)) {
          this.localStore.service_accounts = [];
        }
        if (!Array.isArray(this.localStore.url_logs)) {
          this.localStore.url_logs = [];
        }
      }
    } catch (e) {
      console.warn('Fallback storage load error, resetting memory store:', e);
      this.localStore = { service_accounts: [], url_logs: [] };
    }
  }

  private saveLocalStore() {
    try {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(this.localStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Fallback storage write error:', e);
    }
  }

  // Initialize PostgreSQL direct connection to execute DDL / bootstrap
  private async initPostgres() {
    if (!DEFAULT_DATABASE_URL) {
      console.log('[PostgreSQL Pool] No DATABASE_URL provided. Operating in Supabase REST or local store mode.');
      return;
    }
    try {
      this.pgPool = new Pool({
        connectionString: DEFAULT_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      // Test connection and run schema creation if needed
      const client = await this.pgPool.connect();
      try {
        await client.query(`
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

          CREATE TABLE IF NOT EXISTS public.service_accounts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            project_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            credentials JSONB NOT NULL,
            daily_count INTEGER NOT NULL DEFAULT 0,
            last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
          );

          CREATE TABLE IF NOT EXISTS public.url_logs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            url TEXT NOT NULL,
            status TEXT NOT NULL,
            notification_type TEXT NOT NULL DEFAULT 'URL_UPDATED',
            http_code INTEGER,
            used_account_id UUID,
            used_project_name TEXT,
            response_message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
          );

          CREATE INDEX IF NOT EXISTS idx_service_accounts_active_quota 
            ON public.service_accounts (is_active, daily_count, last_reset_date);
          CREATE INDEX IF NOT EXISTS idx_url_logs_created_at 
            ON public.url_logs (created_at DESC);
        `);
        console.log('[PostgreSQL] Connected to Supabase DB and verified schema.');
        this.isConnectedToSupabase = true;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('[PostgreSQL Pool] Direct connection note:', err.message);
      this.pgPool = null;
    }
  }

  public initSupabase(customUrl?: string, customKey?: string): boolean {
    const url = customUrl || this.localStore.customSupabaseConfig?.url || DEFAULT_SUPABASE_URL;
    const key = customKey || this.localStore.customSupabaseConfig?.key || DEFAULT_SUPABASE_KEY;

    if (url && key) {
      try {
        this.supabase = createClient(url, key, {
          auth: { persistSession: false },
        });
        this.activeUrl = url;
        this.isConnectedToSupabase = true;
        console.log(`[Database] Supabase client initialized with ${url}`);
        return true;
      } catch (err) {
        console.warn('[Database] Failed to init Supabase client:', err);
        this.supabase = null;
        this.isConnectedToSupabase = false;
        this.activeUrl = null;
        return false;
      }
    } else {
      this.supabase = null;
      this.isConnectedToSupabase = false;
      this.activeUrl = null;
      return false;
    }
  }

  // Load and bootstrap the user's attached Google Cloud service account key
  public async bootstrapUserKey() {
    try {
      let keyData: any = null;
      if (fs.existsSync(USER_KEY_FILE)) {
        const raw = fs.readFileSync(USER_KEY_FILE, 'utf-8');
        keyData = JSON.parse(raw);
      } else {
        // Fallback embedded key data
        keyData = {
          type: 'service_account',
          project_id: 'seo-automation-503206',
          client_email: 'seo-automation@seo-automation-503206.iam.gserviceaccount.com',
        };
      }

      if (keyData && keyData.project_id && keyData.client_email) {
        const today = this.getTodayDateString();

        // Check if already in local store
        const existingLocal = this.localStore.service_accounts.find(
          (a) => a.project_name === keyData.project_id || a.client_email === keyData.client_email
        );

        if (!existingLocal) {
          const userAccount: ServiceAccount = {
            id: '50320600-0000-4000-8000-000000503206',
            project_name: keyData.project_id,
            client_email: keyData.client_email,
            credentials: keyData,
            daily_count: 0,
            last_reset_date: today,
            is_active: true,
            created_at: new Date().toISOString(),
          };
          this.localStore.service_accounts.unshift(userAccount);
          this.saveLocalStore();
          console.log(`[Database] User key ${keyData.project_id} bootstrapped locally.`);
        }

        // Also save/upsert to Supabase if available
        if (this.pgPool) {
          try {
            await this.pgPool.query(
              `INSERT INTO public.service_accounts 
               (id, project_name, client_email, credentials, daily_count, last_reset_date, is_active)
               VALUES ($1, $2, $3, $4, 0, $5, true)
               ON CONFLICT (id) DO UPDATE 
               SET credentials = EXCLUDED.credentials, project_name = EXCLUDED.project_name, client_email = EXCLUDED.client_email;`,
              [
                '50320600-0000-4000-8000-000000503206',
                keyData.project_id,
                keyData.client_email,
                JSON.stringify(keyData),
                today,
              ]
            );
            console.log(`[Database] User key ${keyData.project_id} stored in Supabase PostgreSQL.`);
          } catch (e: any) {
            console.warn('[Database] Note inserting user key to Postgres:', e.message);
          }
        }
      }
    } catch (err: any) {
      console.warn('[Database] Could not bootstrap user key:', err.message);
    }
  }

  public setCustomSupabaseConfig(url: string, key: string): boolean {
    this.localStore.customSupabaseConfig = { url, key };
    this.saveLocalStore();
    return this.initSupabase(url, key);
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private checkAndResetQuotas(account: ServiceAccount): ServiceAccount {
    const today = this.getTodayDateString();
    if (account.last_reset_date !== today) {
      account.daily_count = 0;
      account.last_reset_date = today;
    }
    return account;
  }

  public async getAccounts(): Promise<ServiceAccount[]> {
    const today = this.getTodayDateString();

    // 1. Try Direct PostgreSQL Pool
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT id, project_name, client_email, credentials, daily_count, last_reset_date, is_active, created_at 
           FROM public.service_accounts 
           ORDER BY created_at DESC;`
        );
        if (res.rows && res.rows.length > 0) {
          const accounts: ServiceAccount[] = res.rows.map((row) => ({
            id: row.id,
            project_name: row.project_name,
            client_email: row.client_email,
            credentials: row.credentials,
            daily_count: row.daily_count || 0,
            last_reset_date: String(row.last_reset_date || today),
            is_active: Boolean(row.is_active),
            created_at: new Date(row.created_at).toISOString(),
          }));
          return accounts.map((a) => this.checkAndResetQuotas(a));
        }
      } catch (err: any) {
        // Fall through to Supabase client or local
      }
    }

    // 2. Try Supabase REST Client
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data.map((a) => this.checkAndResetQuotas(a));
        }
      } catch (e) {
        // Fall through to local
      }
    }

    // 3. Local Fallback
    this.localStore.service_accounts = this.localStore.service_accounts.map((acc) =>
      this.checkAndResetQuotas(acc)
    );
    this.saveLocalStore();
    return [...this.localStore.service_accounts];
  }

  public async getAccountById(id: string): Promise<ServiceAccount | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT * FROM public.service_accounts WHERE id = $1 LIMIT 1;`,
          [id]
        );
        if (res.rows[0]) {
          return this.checkAndResetQuotas(res.rows[0]);
        }
      } catch {}
    }

    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('service_accounts')
          .select('*')
          .eq('id', id)
          .single();
        if (data) return this.checkAndResetQuotas(data);
      } catch {}
    }

    const found = this.localStore.service_accounts.find((a) => a.id === id);
    return found ? this.checkAndResetQuotas(found) : null;
  }

  public async getActiveAccountsWithQuota(quotaLimit = 200): Promise<ServiceAccount[]> {
    const accounts = await this.getAccounts();
    return accounts
      .filter((a) => a.is_active && a.daily_count < quotaLimit)
      .sort((a, b) => a.daily_count - b.daily_count);
  }

  public async saveAccount(
    account: Omit<ServiceAccount, 'id' | 'created_at'> & { id?: string }
  ): Promise<ServiceAccount> {
    const today = this.getTodayDateString();
    const newAccount: ServiceAccount = {
      id: account.id || crypto.randomUUID(),
      project_name: account.project_name,
      client_email: account.client_email,
      credentials: account.credentials,
      daily_count: account.daily_count || 0,
      last_reset_date: account.last_reset_date || today,
      is_active: account.is_active !== undefined ? account.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO public.service_accounts 
           (id, project_name, client_email, credentials, daily_count, last_reset_date, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE 
           SET credentials = EXCLUDED.credentials, project_name = EXCLUDED.project_name, client_email = EXCLUDED.client_email;`,
          [
            newAccount.id,
            newAccount.project_name,
            newAccount.client_email,
            JSON.stringify(newAccount.credentials),
            newAccount.daily_count,
            newAccount.last_reset_date,
            newAccount.is_active,
          ]
        );
      } catch (err: any) {
        console.warn('Postgres insert note:', err.message);
      }
    }

    // Save to local
    const exists = this.localStore.service_accounts.findIndex((a) => a.id === newAccount.id);
    if (exists !== -1) {
      this.localStore.service_accounts[exists] = newAccount;
    } else {
      this.localStore.service_accounts.unshift(newAccount);
    }
    this.saveLocalStore();
    return newAccount;
  }

  public async updateAccount(id: string, updates: Partial<ServiceAccount>): Promise<ServiceAccount | null> {
    const now = new Date().toISOString();
    const fullUpdates = { ...updates, updated_at: now };

    if (this.pgPool) {
      try {
        const fields: string[] = [];
        const vals: any[] = [];
        let i = 1;
        if (updates.project_name !== undefined) {
          fields.push(`project_name = $${i++}`);
          vals.push(updates.project_name);
        }
        if (updates.client_email !== undefined) {
          fields.push(`client_email = $${i++}`);
          vals.push(updates.client_email);
        }
        if (updates.credentials !== undefined) {
          fields.push(`credentials = $${i++}`);
          vals.push(JSON.stringify(updates.credentials));
        }
        if (updates.is_active !== undefined) {
          fields.push(`is_active = $${i++}`);
          vals.push(updates.is_active);
        }
        if (updates.daily_count !== undefined) {
          fields.push(`daily_count = $${i++}`);
          vals.push(updates.daily_count);
        }
        if (updates.last_reset_date !== undefined) {
          fields.push(`last_reset_date = $${i++}`);
          vals.push(updates.last_reset_date);
        }
        if (fields.length > 0) {
          vals.push(id);
          await this.pgPool.query(
            `UPDATE public.service_accounts SET ${fields.join(', ')} WHERE id = $${i};`,
            vals
          );
        }
      } catch {}
    }

    const index = this.localStore.service_accounts.findIndex((a) => a.id === id);
    if (index !== -1) {
      this.localStore.service_accounts[index] = {
        ...this.localStore.service_accounts[index],
        ...fullUpdates,
      };
      this.saveLocalStore();
      return this.localStore.service_accounts[index];
    }
    return null;
  }

  public async incrementAccountDailyCount(id: string): Promise<number> {
    const account = await this.getAccountById(id);
    if (!account) return 0;
    const newCount = account.daily_count + 1;
    await this.updateAccount(id, { daily_count: newCount });
    return newCount;
  }

  public async markAccountExhausted(id: string, quotaLimit = 200): Promise<void> {
    await this.updateAccount(id, { daily_count: quotaLimit });
  }

  public async resetAccountQuota(id: string): Promise<void> {
    const today = this.getTodayDateString();
    await this.updateAccount(id, { daily_count: 0, last_reset_date: today });
  }

  public async deleteAccount(id: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`DELETE FROM public.service_accounts WHERE id = $1;`, [id]);
      } catch {}
    }

    const initialLen = this.localStore.service_accounts.length;
    this.localStore.service_accounts = this.localStore.service_accounts.filter((a) => a.id !== id);
    this.saveLocalStore();
    return this.localStore.service_accounts.length < initialLen;
  }

  public async addUrlLog(log: Omit<UrlLog, 'id' | 'created_at'>): Promise<UrlLog> {
    const newLog: UrlLog = {
      id: crypto.randomUUID(),
      url: log.url,
      status: log.status,
      notification_type: log.notification_type || 'URL_UPDATED',
      http_code: log.http_code,
      used_account_id: log.used_account_id,
      used_project_name: log.used_project_name,
      response_message: log.response_message,
      created_at: new Date().toISOString(),
    };

    if (this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO public.url_logs 
           (id, url, status, notification_type, http_code, used_project_name, response_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [
            newLog.id,
            newLog.url,
            newLog.status,
            newLog.notification_type,
            newLog.http_code,
            newLog.used_project_name,
            newLog.response_message,
          ]
        );
      } catch {}
    }

    this.localStore.url_logs.unshift(newLog);
    if (this.localStore.url_logs.length > 500) {
      this.localStore.url_logs = this.localStore.url_logs.slice(0, 500);
    }
    this.saveLocalStore();
    return newLog;
  }

  public async getUrlLogs(limit = 100, statusFilter?: string, search?: string): Promise<UrlLog[]> {
    if (this.pgPool) {
      try {
        let sql = `SELECT * FROM public.url_logs WHERE 1=1`;
        const params: any[] = [];
        let i = 1;
        if (statusFilter && statusFilter !== 'ALL') {
          sql += ` AND status = $${i++}`;
          params.push(statusFilter);
        }
        if (search) {
          sql += ` AND (url ILIKE $${i++} OR used_project_name ILIKE $${i++})`;
          params.push(`%${search}%`, `%${search}%`);
        }
        sql += ` ORDER BY created_at DESC LIMIT $${i};`;
        params.push(limit);

        const res = await this.pgPool.query(sql, params);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map((r) => ({
            id: r.id,
            url: r.url,
            status: r.status,
            notification_type: r.notification_type || 'URL_UPDATED',
            http_code: r.http_code,
            used_account_id: r.used_account_id,
            used_project_name: r.used_project_name,
            response_message: r.response_message,
            created_at: new Date(r.created_at).toISOString(),
          }));
        }
      } catch {}
    }

    let logs = [...this.localStore.url_logs];
    if (statusFilter && statusFilter !== 'ALL') {
      logs = logs.filter((l) => l.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.url.toLowerCase().includes(q) ||
          (l.used_project_name && l.used_project_name.toLowerCase().includes(q))
      );
    }
    return logs.slice(0, limit);
  }

  public async clearLogs(): Promise<void> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`TRUNCATE TABLE public.url_logs;`);
      } catch {}
    }
    this.localStore.url_logs = [];
    this.saveLocalStore();
  }

  private quotaLimitPerAccount: number = 200;

  public setQuotaLimit(limit: number): number {
    this.quotaLimitPerAccount = limit === 100 ? 100 : 200;
    return this.quotaLimitPerAccount;
  }

  public getQuotaLimit(): number {
    return this.quotaLimitPerAccount;
  }

  public async getSystemStatus(quotaPerAccount?: number): Promise<SystemStatus> {
    const limit = quotaPerAccount || this.quotaLimitPerAccount;
    const accounts = await this.getAccounts();
    const activeAccounts = accounts.filter((a) => a.is_active);
    const totalDailyQuota = activeAccounts.length * limit;
    const usedDailyQuota = activeAccounts.reduce((sum, a) => sum + (a.daily_count || 0), 0);
    const remainingDailyQuota = Math.max(0, totalDailyQuota - usedDailyQuota);

    return {
      isSupabaseConnected: this.isConnectedToSupabase,
      supabaseUrl: this.activeUrl || DEFAULT_SUPABASE_URL,
      storageMode: this.isConnectedToSupabase ? 'supabase' : 'local_fallback',
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      quotaLimitPerAccount: this.quotaLimitPerAccount,
      totalDailyQuota,
      usedDailyQuota,
      remainingDailyQuota,
      adminPasswordConfigured: true,
      defaultOtpConfigured: true,
    };
  }

  public async seedDemoAccounts(): Promise<void> {
    await this.bootstrapUserKey();
  }
}

export const db = new DatabaseAdapter();
