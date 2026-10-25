export interface ServiceAccountCredentials {
  type?: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
  [key: string]: unknown;
}

export interface ServiceAccount {
  id: string;
  project_name: string;
  client_email: string;
  credentials?: ServiceAccountCredentials;
  daily_count: number;
  last_reset_date: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  has_credentials?: boolean;
  status_info?: string;
}

export interface UrlLog {
  id: string;
  url: string;
  status: 'SUCCESS' | 'FAILED' | 'QUOTA_EXHAUSTED' | 'RATE_LIMITED';
  notification_type: 'URL_UPDATED' | 'URL_DELETED';
  http_code: number | null;
  used_account_id: string | null;
  used_project_name: string | null;
  response_message: string;
  created_at: string;
}

export interface IndexBatchRequest {
  urls: string[];
  notificationType?: 'URL_UPDATED' | 'URL_DELETED';
  dryRun?: boolean;
  quotaLimit?: number; // 100 or 200 URLs per account
}

export interface IndexResultItem {
  url: string;
  status: 'SUCCESS' | 'FAILED' | 'QUOTA_EXHAUSTED';
  httpCode: number | null;
  accountId: string | null;
  projectName: string | null;
  message: string;
  rotated?: boolean;
  timestamp: string;
}

export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  rotatedCount: number;
  results: IndexResultItem[];
}

export interface SystemStatus {
  isSupabaseConnected: boolean;
  supabaseUrl: string | null;
  storageMode: 'supabase' | 'local_fallback';
  totalAccounts: number;
  activeAccounts: number;
  quotaLimitPerAccount: number; // 100 or 200
  totalDailyQuota: number;
  usedDailyQuota: number;
  remainingDailyQuota: number;
  adminPasswordConfigured: boolean;
  defaultOtpConfigured: boolean;
}

export interface UrlVerificationResult {
  url: string;
  statusCode: number;
  isAccessible: boolean;
  title: string | null;
  hasNoIndex: boolean;
  canonicalUrl: string | null;
  googleSearchUrl: string;
  googleSearchConsoleUrl: string;
  domain: string;
  recommendations: string[];
}
