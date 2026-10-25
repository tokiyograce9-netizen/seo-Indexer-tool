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
    if (!tokenResponse.access_token) {
      return {
        success: false,
        message: 'Could not obtain access token from Google OAuth endpoint.',
      };
    }

    const projectId = account.project_name || account.credentials?.project_id || 'unknown-project';
    const enableUrl = `https://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=${projectId}`;

    // Test whether the Web Search Indexing API is actually enabled in Google Cloud
    try {
      const indexing = google.indexing({
        version: 'v3',
        auth: jwtClient,
      });
      await indexing.urlNotifications.getMetadata({ url: 'https://example.com' });
      return {
        success: true,
        message: `Authentication successful! Connected to Google Indexing API with ${account.client_email}. Web Search Indexing API is ENABLED and ready.`,
        details: {
          token_type: tokenResponse.token_type,
          expires_in: tokenResponse.expiry_date,
          apiEnabled: true,
        },
      };
    } catch (apiErr: any) {
      const errorData = apiErr?.response?.data?.error;
      const reason = errorData?.details?.[0]?.reason || errorData?.errors?.[0]?.reason || '';
      const msg = errorData?.message || apiErr?.message || '';

      if (reason === 'SERVICE_DISABLED' || msg.includes('has not been used in project') || msg.includes('is disabled')) {
        return {
          success: false,
          message: `CRITICAL: Web Search Indexing API is DISABLED in Google Cloud for project "${projectId}". You must enable it here: ${enableUrl}`,
          details: {
            apiDisabled: true,
            enableUrl,
            error: msg,
          },
        };
      }

      // If it returned ownership/permission error for example.com, that proves the Indexing API IS ENABLED!
      if (msg.includes('ownership') || msg.includes('Permission denied') || reason === 'forbidden') {
        return {
          success: true,
          message: `Authentication successful! Connected to Google Indexing API with ${account.client_email}. (Web Search Indexing API is ENABLED in Google Cloud. Make sure this service account is added as Owner in Google Search Console for your website).`,
          details: {
            token_type: tokenResponse.token_type,
            expires_in: tokenResponse.expiry_date,
            apiEnabled: true,
          },
        };
      }

      return {
        success: false,
        message: `Google API error: ${msg}`,
        details: errorData || null,
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
    const errorObj = err?.response?.data?.error;
    const errorBody = errorObj || err?.message || 'Unknown Google API error';
    const messageStr = typeof errorBody === 'object' ? JSON.stringify(errorBody) : String(errorBody);
    const reason = errorObj?.details?.[0]?.reason || errorObj?.errors?.[0]?.reason || '';
    const apiErrorMsg = errorObj?.message || messageStr;
    const projectId = account.project_name || account.credentials?.project_id || 'seo-automation-503206';
    const enableUrl = `https://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=${projectId}`;

    const isQuota =
      statusCode === 429 ||
      reason === 'rateLimitExceeded' ||
      messageStr.toLowerCase().includes('quota') ||
      messageStr.toLowerCase().includes('rate limit') ||
      messageStr.toLowerCase().includes('resource has been exhausted');

    let userFriendlyMessage = apiErrorMsg;

    if (reason === 'SERVICE_DISABLED' || apiErrorMsg.includes('has not been used in project') || apiErrorMsg.includes('is disabled')) {
      userFriendlyMessage = `Google Cloud API Disabled (403): The Web Search Indexing API is NOT enabled for project "${projectId}". Enable it in Google Cloud Console: ${enableUrl} (wait 1-2 minutes after enabling).`;
    } else if (apiErrorMsg.includes('ownership') || apiErrorMsg.includes('Permission denied') || reason === 'forbidden') {
      userFriendlyMessage = `Permission Denied (403): Service account (${account.client_email}) is not verified as an Owner in Google Search Console for this URL property. Add this email as 'Owner' under Settings -> Users and permissions in Search Console.`;
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
  dryRun = false,
  customQuotaLimit?: number
): Promise<BatchSummary> {
  const quotaLimit = customQuotaLimit || db.getQuotaLimit();
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
  let availableAccounts = await db.getActiveAccountsWithQuota(quotaLimit);

  if (availableAccounts.length === 0) {
    // Record failure for all URLs
    for (const url of cleanUrls) {
      const item: IndexResultItem = {
        url,
        status: 'QUOTA_EXHAUSTED',
        httpCode: 429,
        accountId: null,
        projectName: null,
        message: `All service accounts are exhausted (${quotaLimit}/day limit) or inactive. Upload more service account keys to continue.`,
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
        if (activeAccount.daily_count >= quotaLimit) {
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
        await db.markAccountExhausted(activeAccount.id, quotaLimit);

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

// Live URL Index & SERP Inspector
export async function verifyUrlForIndexing(targetUrl: string) {
  let cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const parsed = new URL(cleanUrl);
  const domain = parsed.hostname;
  const domainOrigin = `${parsed.protocol}//${parsed.hostname}/`;

  // Direct Live Google Search site: check link
  const googleSearchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(cleanUrl)}`;

  // Direct Search Console URL Inspection link for this property
  const googleSearchConsoleUrl = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(
    domainOrigin
  )}&id=${encodeURIComponent(cleanUrl)}`;

  let statusCode = 0;
  let isAccessible = false;
  let title: string | null = null;
  let hasNoIndex = false;
  let canonicalUrl: string | null = null;
  const recommendations: string[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    statusCode = response.status;
    isAccessible = response.status >= 200 && response.status < 400;

    const html = await response.text();

    // Check title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    // Check meta robots noindex
    const metaRobotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i);
    if (metaRobotsMatch && metaRobotsMatch[1].toLowerCase().includes('noindex')) {
      hasNoIndex = true;
      recommendations.push(
        'CRITICAL: Page contains a <meta name="robots" content="noindex"> tag! Google will NOT index this page until you remove the noindex directive.'
      );
    }

    // Check canonical tag
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonicalMatch) {
      canonicalUrl = canonicalMatch[1];
    }
  } catch (err: any) {
    recommendations.push(`Could not fetch page live: ${err?.message || 'Network timeout'}`);
  }

  // Recommendations for Search Console
  recommendations.push(
    `Make sure your service account email (seo-automation@seo-automation-503206.iam.gserviceaccount.com) is added as an OWNER under Settings -> Users and permissions in Google Search Console for property: ${domainOrigin}`
  );
  recommendations.push(
    `To verify live indexing on Google: Click 'Check on Google Search (site: operator)'. If Googlebot has crawled it, the search result snippet will appear.`
  );

  return {
    url: cleanUrl,
    domain,
    statusCode,
    isAccessible,
    title,
    hasNoIndex,
    canonicalUrl,
    googleSearchUrl,
    googleSearchConsoleUrl,
    recommendations,
  };
}
