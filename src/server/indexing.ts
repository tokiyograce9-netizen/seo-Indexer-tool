import { google } from 'googleapis';
import { db } from './db';
import { IndexResultItem, BatchSummary, ServiceAccount } from '../lib/types';

const DAILY_QUOTA_LIMIT = parseInt(process.env.DAILY_QUOTA_PER_ACCOUNT || '200', 10);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check if credentials are mock/demo keys
function isMockCredential(account: ServiceAccount): boolean {
  const pk = account.credentials?.private_key || '';
  return pk.includes('[DEMO_KEY') || pk.includes('MOCK') || !account.credentials?.private_key;
}

// Test service account credentials
export async function testServiceAccountKey(account: ServiceAccount): Promise<{ success: boolean; message: string; details?: unknown }> {
  if (isMockCredential(account)) {
    return {
      success: true,
      message: 'Demo credentials signature validated (simulated test). To index real URLs, upload real GCP service account JSON.',
    };
  }

  try {
    const jwtClient = new google.auth.JWT({
      email: account.credentials?.client_email,
      key: account.credentials?.private_key,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    // Attempt to authorize and fetch access token
    const tokenResponse = await jwtClient.authorize();
    if (tokenResponse.access_token) {
      return {
        success: true,
        message: `Authentication successful! Connected to Google Indexing API with ${account.client_email}`,
        details: {
          token_type: tokenResponse.token_type,
          expires_in: tokenResponse.expiry_date,
        },
      };
    } else {
      return {
        success: false,
        message: 'Could not obtain access token from Google OAuth endpoint.',
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Failed to authenticate service account with Google APIs.',
      details: error?.response?.data || null,
    };
  }
}

// Core Single URL Indexing function with Google Indexing API v3
async function publishUrlToGoogle(
  url: string,
  account: ServiceAccount,
  notificationType: 'URL_UPDATED' | 'URL_DELETED',
  dryRun = false
): Promise<{ success: boolean; httpCode: number; message: string; isQuotaError: boolean }> {
  if (dryRun || isMockCredential(account)) {
    // Simulated run
    await sleep(80);
    // Simulate quota exhaustion if account is near limit
    if (account.daily_count >= DAILY_QUOTA_LIMIT) {
      return {
        success: false,
        httpCode: 429,
        message: 'Quota exceeded for quota metric "Publish requests" and limit "Publish requests per day"',
        isQuotaError: true,
      };
    }

    return {
      success: true,
      httpCode: 200,
      message: `Indexed via ${notificationType} (Simulated). Account ${account.project_name} quota incremented.`,
      isQuotaError: false,
    };
  }

  try {
    const jwtClient = new google.auth.JWT({
      email: account.credentials?.client_email,
      key: account.credentials?.private_key,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    const indexing = google.indexing({
      version: 'v3',
      auth: jwtClient,
    });

    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type: notificationType,
      },
    });

    const notifyTime = response.data.urlNotificationMetadata?.latestUpdate?.notifyTime;
    return {
      success: true,
      httpCode: 200,
      message: notifyTime
        ? `Successfully published to Google Index. Notify time: ${notifyTime}`
        : 'Google Indexing API accepted request (200 OK)',
      isQuotaError: false,
    };
  } catch (err: any) {
    const statusCode = err?.status || err?.code || err?.response?.status || 500;
    const errorBody = err?.response?.data?.error || err?.message || 'Unknown Google API error';
    const messageStr = typeof errorBody === 'object' ? JSON.stringify(errorBody) : String(errorBody);

    const isQuota =
      statusCode === 429 ||
      messageStr.toLowerCase().includes('quota') ||
      messageStr.toLowerCase().includes('rate limit') ||
      messageStr.toLowerCase().includes('resource has been exhausted');

    let userFriendlyMessage = messageStr;
    if (statusCode === 403 && messageStr.toLowerCase().includes('permission_denied')) {
      userFriendlyMessage = `Permission Denied (403): The service account email (${account.client_email}) must be added as an 'Owner' or 'Full User' of the site domain inside Google Search Console.`;
    }

    return {
      success: false,
      httpCode: statusCode,
      message: userFriendlyMessage,
      isQuotaError: isQuota,
    };
  }
}

// Bulk Indexing Engine with Multi-Project Automated Rotation & 429 Fallback
export async function executeBulkIndexing(
  urls: string[],
  notificationType: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED',
  dryRun = false
): Promise<BatchSummary> {
  const results: IndexResultItem[] = [];
  let succeededCount = 0;
  let failedCount = 0;
  let rotatedCount = 0;

  // Filter valid URLs
  const cleanUrls = Array.from(
    new Set(
      urls
        .map((u) => u.trim())
        .filter((u) => {
          try {
            const parsed = new URL(u);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        })
    )
  ).slice(0, 100);

  if (cleanUrls.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      rotatedCount: 0,
      results: [],
    };
  }

  // Fetch available accounts
  let availableAccounts = await db.getActiveAccountsWithQuota(DAILY_QUOTA_LIMIT);

  if (availableAccounts.length === 0) {
    // Record failure for all URLs
    for (const url of cleanUrls) {
      const item: IndexResultItem = {
        url,
        status: 'QUOTA_EXHAUSTED',
        httpCode: 429,
        accountId: null,
        projectName: null,
        message: 'All service accounts are exhausted (200/day limit) or inactive. Upload more service account keys to continue.',
        timestamp: new Date().toISOString(),
      };
      results.push(item);
      failedCount++;

      await db.addUrlLog({
        url,
        status: 'QUOTA_EXHAUSTED',
        notification_type: notificationType,
        http_code: 429,
        used_account_id: null,
        used_project_name: null,
        response_message: item.message,
      });
    }

    return {
      total: cleanUrls.length,
      succeeded: 0,
      failed: failedCount,
      rotatedCount: 0,
      results,
    };
  }

  let currentAccountIndex = 0;

  for (const url of cleanUrls) {
    let attemptSucceeded = false;
    let rotatedForThisUrl = false;
    let lastError: { httpCode: number; message: string } = {
      httpCode: 500,
      message: 'Unknown failure',
    };

    // Attempt with account rotation if quota errors occur
    while (!attemptSucceeded && availableAccounts.length > 0) {
      if (currentAccountIndex >= availableAccounts.length) {
        currentAccountIndex = 0;
      }

      const activeAccount = availableAccounts[currentAccountIndex];

      const res = await publishUrlToGoogle(url, activeAccount, notificationType, dryRun);

      if (res.success) {
        attemptSucceeded = true;
        succeededCount++;
        if (rotatedForThisUrl) rotatedCount++;

        // Increment daily count in DB
        await db.incrementAccountDailyCount(activeAccount.id);
        activeAccount.daily_count += 1;

        // If this account hit limit, remove from active pool
        if (activeAccount.daily_count >= DAILY_QUOTA_LIMIT) {
          availableAccounts = availableAccounts.filter((a) => a.id !== activeAccount.id);
        }

        const item: IndexResultItem = {
          url,
          status: 'SUCCESS',
          httpCode: res.httpCode,
          accountId: activeAccount.id,
          projectName: activeAccount.project_name,
          message: rotatedForThisUrl ? `[Rotated] ${res.message}` : res.message,
          rotated: rotatedForThisUrl,
          timestamp: new Date().toISOString(),
        };
        results.push(item);

        await db.addUrlLog({
          url,
          status: 'SUCCESS',
          notification_type: notificationType,
          http_code: res.httpCode,
          used_account_id: activeAccount.id,
          used_project_name: activeAccount.project_name,
          response_message: item.message,
        });

        // Rotate to next account for load balancing across available projects
        currentAccountIndex = (currentAccountIndex + 1) % Math.max(1, availableAccounts.length);
        break;
      } else if (res.isQuotaError) {
        // Quota exhausted (429 or quota limit)!
        console.warn(`[Rotation Engine] Account ${activeAccount.project_name} reached quota (429). Triggering auto-fallback rotation.`);
        await db.markAccountExhausted(activeAccount.id, DAILY_QUOTA_LIMIT);

        // Remove from available accounts list
        availableAccounts = availableAccounts.filter((a) => a.id !== activeAccount.id);
        rotatedForThisUrl = true;
        lastError = { httpCode: 429, message: res.message };

        // Loop continues to retry this same URL with the NEXT account in pool!
      } else {
        // Non-quota error (e.g. 403 permission denied, 400 invalid URL)
        lastError = { httpCode: res.httpCode, message: res.message };
        break;
      }
    }

    if (!attemptSucceeded) {
      failedCount++;
      const isExhausted = availableAccounts.length === 0;
      const status = isExhausted ? 'QUOTA_EXHAUSTED' : 'FAILED';
      const fallbackAccount = availableAccounts[currentAccountIndex] || null;

      const item: IndexResultItem = {
        url,
        status,
        httpCode: lastError.httpCode,
        accountId: fallbackAccount ? fallbackAccount.id : null,
        projectName: fallbackAccount ? fallbackAccount.project_name : null,
        message: isExhausted
          ? 'Quota exhausted across all available service accounts during rotation. Upload more accounts.'
          : lastError.message,
        rotated: rotatedForThisUrl,
        timestamp: new Date().toISOString(),
      };
      results.push(item);

      await db.addUrlLog({
        url,
        status,
        notification_type: notificationType,
        http_code: lastError.httpCode,
        used_account_id: fallbackAccount ? fallbackAccount.id : null,
        used_project_name: fallbackAccount ? fallbackAccount.project_name : null,
        response_message: item.message,
      });
    }

    // Rate pacing interval to avoid sudden burst throttling
    await sleep(120);
  }

  return {
    total: cleanUrls.length,
    succeeded: succeededCount,
    failed: failedCount,
    rotatedCount,
    results,
  };
}
