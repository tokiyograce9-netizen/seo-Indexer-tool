import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { ServiceAccount, UrlLog, SystemStatus } from '../lib/types';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_FILE = path.resolve(DATA_DIR, 'openindex-storage.json');

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
  private localStore: LocalStore = {
    service_accounts: [],
    url_logs: [],
  };
  private isConnectedToSupabase = false;
  private activeUrl: string | null = null;

  constructor() {
    this.loadLocalStore();
    this.initSupabase();
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

  public initSupabase(customUrl?: string, customKey?: string): boolean {
    const url = customUrl || this.localStore.customSupabaseConfig?.url || process.env.SUPABASE_URL;
    const key = customKey || this.localStore.customSupabaseConfig?.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (url && key && !url.includes('your-supabase-project')) {
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

  public setCustomSupabaseConfig(url: string, key: string): boolean {
    this.localStore.customSupabaseConfig = { url, key };
    this.saveLocalStore();
    return this.initSupabase(url, key);
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Auto-reset quotas if date changed
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

    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Check for midnight resets
          const updated: ServiceAccount[] = [];
          for (const acc of data) {
            if (acc.last_reset_date !== today) {
              await this.supabase
                .from('service_accounts')
                .update({ daily_count: 0, last_reset_date: today })
                .eq('id', acc.id);
              updated.push({ ...acc, daily_count: 0, last_reset_date: today });
            } else {
              updated.push(acc);
            }
          }
          return updated;
        } else {
          console.warn('[Database] Supabase fetch error, using local fallback:', error?.message);
        }
      } catch (e) {
        console.warn('[Database] Supabase exception, using local fallback:', e);
      }
    }

    // Local Fallback
    this.localStore.service_accounts = this.localStore.service_accounts.map(acc => this.checkAndResetQuotas(acc));
    this.saveLocalStore();
    return [...this.localStore.service_accounts];
  }

  public async getAccountById(id: string): Promise<ServiceAccount | null> {
    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) {
          return this.checkAndResetQuotas(data);
        }
      } catch (e) {
        console.warn('[Database] Supabase getAccountById error:', e);
      }
    }

    const found = this.localStore.service_accounts.find(a => a.id === id);
    if (found) {
      return this.checkAndResetQuotas(found);
    }
    return null;
  }

  public async getActiveAccountsWithQuota(quotaLimit = 200): Promise<ServiceAccount[]> {
    const accounts = await this.getAccounts();
    return accounts
      .filter(a => a.is_active && (a.daily_count < quotaLimit))
      .sort((a, b) => a.daily_count - b.daily_count); // lowest used first
  }

  public async saveAccount(account: Omit<ServiceAccount, 'id' | 'created_at'> & { id?: string }): Promise<ServiceAccount> {
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

    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .insert([newAccount])
          .select()
          .single();
        if (!error && data) {
          return data;
        } else {
          console.warn('[Database] Supabase insert error, saving to local fallback:', error?.message);
        }
      } catch (e) {
        console.warn('[Database] Supabase exception during save:', e);
      }
    }

    // Save to local
    this.localStore.service_accounts.unshift(newAccount);
    this.saveLocalStore();
    return newAccount;
  }

  public async updateAccount(id: string, updates: Partial<ServiceAccount>): Promise<ServiceAccount | null> {
    const now = new Date().toISOString();
    const fullUpdates = { ...updates, updated_at: now };

    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { data, error } = await this.supabase
          .from('service_accounts')
          .update(fullUpdates)
          .eq('id', id)
          .select()
          .single();
        if (!error && data) {
          return data;
        }
      } catch (e) {
        console.warn('[Database] Supabase update error:', e);
      }
    }

    const index = this.localStore.service_accounts.findIndex(a => a.id === id);
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
    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { error } = await this.supabase
          .from('service_accounts')
          .delete()
          .eq('id', id);
        if (!error) return true;
      } catch (e) {
        console.warn('[Database] Supabase delete error:', e);
      }
    }

    const initialLen = this.localStore.service_accounts.length;
    this.localStore.service_accounts = this.localStore.service_accounts.filter(a => a.id !== id);
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

    if (this.supabase && this.isConnectedToSupabase) {
      try {
        const { data, error } = await this.supabase
          .from('url_logs')
          .insert([newLog])
          .select()
          .single();
        if (!error && data) {
          return data;
        }
      } catch (e) {
        console.warn('[Database] Supabase log insert error:', e);
      }
    }

    // Keep max 500 logs locally
    this.localStore.url_logs.unshift(newLog);
    if (this.localStore.url_logs.length > 500) {
      this.localStore.url_logs = this.localStore.url_logs.slice(0, 500);
    }
    this.saveLocalStore();
    return newLog;
  }

  public async getUrlLogs(limit = 100, statusFilter?: string, search?: string): Promise<UrlLog[]> {
    if (this.supabase && this.isConnectedToSupabase) {
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
          query = query.ilike('url', `%${search}%`);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data;
        }
      } catch (e) {
        console.warn('[Database] Supabase logs fetch error:', e);
      }
    }

    let logs = [...this.localStore.url_logs];
    if (statusFilter && statusFilter !== 'ALL') {
      logs = logs.filter(l => l.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l => l.url.toLowerCase().includes(q) || (l.used_project_name && l.used_project_name.toLowerCase().includes(q)));
    }
    return logs.slice(0, limit);
  }

  public async clearLogs(): Promise<void> {
    if (this.supabase && this.isConnectedToSupabase) {
      try {
        await this.supabase.from('url_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('[Database] Supabase clear logs error:', e);
      }
    }
    this.localStore.url_logs = [];
    this.saveLocalStore();
  }

  public async getSystemStatus(quotaPerAccount = 200): Promise<SystemStatus> {
    const accounts = await this.getAccounts();
    const activeAccounts = accounts.filter(a => a.is_active);
    const totalDailyQuota = activeAccounts.length * quotaPerAccount;
    const usedDailyQuota = activeAccounts.reduce((sum, a) => sum + (a.daily_count || 0), 0);
    const remainingDailyQuota = Math.max(0, totalDailyQuota - usedDailyQuota);

    return {
      isSupabaseConnected: this.isConnectedToSupabase,
      supabaseUrl: this.activeUrl,
      storageMode: this.isConnectedToSupabase ? 'supabase' : 'local_fallback',
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      totalDailyQuota,
      usedDailyQuota,
      remainingDailyQuota,
      adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
      defaultOtpConfigured: Boolean(process.env.OTP_CODE),
    };
  }

  public async seedDemoAccounts(): Promise<void> {
    const today = this.getTodayDateString();
    const demoAccounts: Omit<ServiceAccount, 'id' | 'created_at'>[] = [
      {
        project_name: 'openindex-prod-alpha-982',
        client_email: 'indexer-service@openindex-prod-alpha-982.iam.gserviceaccount.com',
        credentials: {
          type: 'service_account',
          project_id: 'openindex-prod-alpha-982',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\n[DEMO_KEY_MOCK_SIGNATURE_ALPHA]\n-----END RSA PRIVATE KEY-----\n',
          client_email: 'indexer-service@openindex-prod-alpha-982.iam.gserviceaccount.com',
        },
        daily_count: 42,
        last_reset_date: today,
        is_active: true,
      },
      {
        project_name: 'seo-cluster-node-bravo',
        client_email: 'fast-indexer@seo-cluster-node-bravo.iam.gserviceaccount.com',
        credentials: {
          type: 'service_account',
          project_id: 'seo-cluster-node-bravo',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\n[DEMO_KEY_MOCK_SIGNATURE_BRAVO]\n-----END RSA PRIVATE KEY-----\n',
          client_email: 'fast-indexer@seo-cluster-node-bravo.iam.gserviceaccount.com',
        },
        daily_count: 188,
        last_reset_date: today,
        is_active: true,
      },
      {
        project_name: 'growth-indexer-charlie',
        client_email: 'bot-auto@growth-indexer-charlie.iam.gserviceaccount.com',
        credentials: {
          type: 'service_account',
          project_id: 'growth-indexer-charlie',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\n[DEMO_KEY_MOCK_SIGNATURE_CHARLIE]\n-----END RSA PRIVATE KEY-----\n',
          client_email: 'bot-auto@growth-indexer-charlie.iam.gserviceaccount.com',
        },
        daily_count: 12,
        last_reset_date: today,
        is_active: true,
      },
    ];

    for (const acc of demoAccounts) {
      await this.saveAccount(acc);
    }
  }
}

export const db = new DatabaseAdapter();
