import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { ServiceAccount, UrlLog, SystemStatus } from '../../src/lib/types.js';
import crypto from 'crypto';

// Detect Serverless environment (Vercel, AWS Lambda, Netlify)
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.NETLIFY
);

// Safe storage directory: /tmp on serverless environments to prevent EROFS read-only filesystem crash
const DATA_DIR = isServerless
  ? path.resolve('/tmp', 'openindex-data')
  : path.resolve(process.cwd(), 'data');

const STORAGE_FILE = path.resolve(DATA_DIR, 'openindex-storage.json');
const USER_KEY_FILE = path.resolve(DATA_DIR, 'credentials_e1123b8b.json');

// Supabase credentials loaded securely from process.env (.env or Vercel environment variables)
const DEFAULT_SUPABASE_URL = process.env.SUPABASE_URL || '';
const DEFAULT_SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

// Ensure data folder exists safely
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  // On read-only environments, continue gracefully with in-memory store
  console.warn('[Database] Storage dir init notice (safe fallback active):', err);
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
  private localStore: LocalStore = {
    service_accounts: [],
    url_logs: [],
  };
  private isConnectedToSupabase = false;
  private activeUrl: string | null = null;
  private quotaLimitPerAccount: number = 200;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Start initialization but don't block constructor
    this.initializationPromise = this.initialize();
  }

  private async initialize() {
    this.initSupabase();
    this.loadLocalStore();
    await this.bootstrapUserKey();
  }

  private async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
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
    } catch {
      this.localStore = { service_accounts: [], url_logs: [] };
    }
  }

  private saveLocalStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(this.localStore, null, 2), 'utf-8');
    } catch {
      // In-memory store remains intact even if disk is read-only
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

      // 1. Check local key file if available
      try {
        if (fs.existsSync(USER_KEY_FILE)) {
          const raw = fs.readFileSync(USER_KEY_FILE, 'utf-8');
          keyData = JSON.parse(raw);
        }
      } catch {}

      // 2. Fallback project metadata
      if (!keyData) {
        keyData = {
          type: 'service_account',
          project_id: 'seo-automation-503206',
          client_email: 'seo-automation@seo-automation-503206.iam.gserviceaccount.com',
        };
      }

      if (keyData && keyData.project_id && keyData.client_email) {
        const today = this.getTodayDateString();
        const bootstrapId = '50320600-0000-4000-8000-000000503206';

        // Check if already present in Supabase
        if (this.supabase) {
          try {
            const { data } = await this.supabase
              .from('service_accounts')
              .select('id, project_name')
              .or(`id.eq.${bootstrapId},project_name.eq.${keyData.project_id}`)
              .limit(1);

            const existing = data?.[0];

            if (!existing) {
              await this.supabase.from('service_accounts').insert({
                id: bootstrapId,
                project_name: keyData.project_id,
                client_email: keyData.client_email,
                credentials: keyData,
                daily_count: 0,
                last_reset_date: today,
                is_active: true,
              });
              console.log(`[Database] Bootstrapped user account into Supabase PostgreSQL.`);
            } else {
              // Ensure credentials are up to date in Supabase if it's the bootstrapped one
              // We use upsert here to be safe and ensure the ID matches
              await this.supabase.from('service_accounts').upsert({
                id: existing.id || bootstrapId,
                project_name: keyData.project_id,
                client_email: keyData.client_email,
                credentials: keyData,
                daily_count: 0,
                last_reset_date: today,
                is_active: true,
                updated_at: new Date().toISOString()
              });
            }
          } catch (e: any) {
            console.warn('[Database] Supabase bootstrap notice:', e.message);
          }
        }

        // Also preserve in local store
        const existingLocal = this.localStore.service_accounts.find(
          (a) => a.id === bootstrapId || a.project_name === keyData.project_id
        );
        if (!existingLocal) {
          const userAccount: ServiceAccount = {
            id: bootstrapId,
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
        }
      }
    } catch (err: any) {
      console.warn('[Database] Bootstrap notice:', err.message);
    }
  }

  public async setCustomSupabaseConfig(url: string, key: string): Promise<boolean> {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
    const today = this.getTodayDateString();

    // 1. Primary: Supabase REST API
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          // If Supabase has data, it is the source of truth
          if (data.length > 0) {
            const accounts: ServiceAccount[] = data.map((row) => ({
              id: row.id,
              project_name: row.project_name,
              client_email: row.client_email,
              credentials: row.credentials,
              daily_count: Number(row.daily_count || 0),
              last_reset_date: String(row.last_reset_date || today),
              is_active: Boolean(row.is_active),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            }));
            return accounts.map((a) => this.checkAndResetQuotas(a));
          }
          // If Supabase is connected but empty, fall through to check if we should bootstrap again
        }
      } catch (err: any) {
        console.warn('[Database] Supabase getAccounts notice:', err.message);
      }
    }

    // 2. Fallback: Local / Memory Store
    this.localStore.service_accounts = this.localStore.service_accounts.map((acc) =>
      this.checkAndResetQuotas(acc)
    );
    this.saveLocalStore();
    return [...this.localStore.service_accounts];
  }

  public async getAccountById(id: string): Promise<ServiceAccount | null> {
    await this.ensureInitialized();
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.checkAndResetQuotas({
            id: data.id,
            project_name: data.project_name,
            client_email: data.client_email,
            credentials: data.credentials,
            daily_count: Number(data.daily_count || 0),
            last_reset_date: String(data.last_reset_date || this.getTodayDateString()),
            is_active: Boolean(data.is_active),
            created_at: data.created_at || new Date().toISOString(),
          });
        }
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
    await this.ensureInitialized();
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

    // Save to Supabase
    if (this.supabase) {
      try {
        await this.supabase.from('service_accounts').upsert({
          id: newAccount.id,
          project_name: newAccount.project_name,
          client_email: newAccount.client_email,
          credentials: newAccount.credentials,
          daily_count: newAccount.daily_count,
          last_reset_date: newAccount.last_reset_date,
          is_active: newAccount.is_active,
          updated_at: newAccount.updated_at,
        });
      } catch (err: any) {
        console.warn('[Database] Supabase saveAccount notice:', err.message);
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
    await this.ensureInitialized();
    const now = new Date().toISOString();
    const fullUpdates = { ...updates, updated_at: now };

    if (this.supabase) {
      try {
        await this.supabase
          .from('service_accounts')
          .update(fullUpdates)
          .eq('id', id);
      } catch (err: any) {
        console.warn('[Database] Supabase updateAccount notice:', err.message);
      }
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
    await this.ensureInitialized();
    if (this.supabase) {
      try {
        await this.supabase.from('service_accounts').delete().eq('id', id);
      } catch (err: any) {
        console.warn('[Database] Supabase deleteAccount notice:', err.message);
      }
    }

    const initialLen = this.localStore.service_accounts.length;
    this.localStore.service_accounts = this.localStore.service_accounts.filter((a) => a.id !== id);
    this.saveLocalStore();
    return this.localStore.service_accounts.length < initialLen;
  }

  public async addUrlLog(log: Omit<UrlLog, 'id' | 'created_at'>): Promise<UrlLog> {
    await this.ensureInitialized();
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

    if (this.supabase) {
      try {
        await this.supabase.from('url_logs').insert({
          id: newLog.id,
          url: newLog.url,
          status: newLog.status,
          notification_type: newLog.notification_type,
          http_code: newLog.http_code,
          used_project_name: newLog.used_project_name,
          response_message: newLog.response_message,
          created_at: newLog.created_at,
        });
      } catch (err: any) {
        console.warn('[Database] Supabase addUrlLog notice:', err.message);
      }
    }

    this.localStore.url_logs.unshift(newLog);
    if (this.localStore.url_logs.length > 500) {
      this.localStore.url_logs = this.localStore.url_logs.slice(0, 500);
    }
    this.saveLocalStore();
    return newLog;
  }

  public async getUrlLogs(limit = 100, statusFilter?: string, search?: string): Promise<UrlLog[]> {
    await this.ensureInitialized();
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('url_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (statusFilter && statusFilter !== 'ALL') {
          query = query.eq('status', statusFilter);
        }

        if (search) {
          query = query.or(`url.ilike.%${search}%,used_project_name.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map((r) => ({
            id: r.id,
            url: r.url,
            status: r.status,
            notification_type: r.notification_type || 'URL_UPDATED',
            http_code: r.http_code,
            used_account_id: r.used_account_id,
            used_project_name: r.used_project_name,
            response_message: r.response_message,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          }));
        }
      } catch (err: any) {
        console.warn('[Database] Supabase getUrlLogs notice:', err.message);
      }
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
    await this.ensureInitialized();
    if (this.supabase) {
      try {
        await this.supabase
          .from('url_logs')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err: any) {
        console.warn('[Database] Supabase clearLogs notice:', err.message);
      }
    }
    this.localStore.url_logs = [];
    this.saveLocalStore();
  }

  public setQuotaLimit(limit: number): number {
    this.quotaLimitPerAccount = limit === 100 ? 100 : 200;
    return this.quotaLimitPerAccount;
  }

  public getQuotaLimit(): number {
    return this.quotaLimitPerAccount;
  }

  public async getSystemStatus(quotaPerAccount?: number): Promise<SystemStatus> {
    await this.ensureInitialized();
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
      adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
      defaultOtpConfigured: Boolean(process.env.OTP_CODE),
    };
  }

  public async seedDemoAccounts(): Promise<void> {
    await this.bootstrapUserKey();
  }
}

export const db = new DatabaseAdapter();
