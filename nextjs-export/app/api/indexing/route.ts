import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const DAILY_LIMIT = 200;

export async function POST(req: NextRequest) {
  try {
    const { urls, notificationType = 'URL_UPDATED' } = await req.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'Array of URLs (up to 100) is required.' }, { status: 400 });
    }

    const cleanUrls = Array.from(new Set(urls.map((u: string) => u.trim()))).slice(0, 100);
    const today = new Date().toISOString().split('T')[0];

    // Fetch active service accounts
    const { data: accounts, error: accError } = await supabase
      .from('service_accounts')
      .select('*')
      .eq('is_active', true)
      .order('daily_count', { ascending: true });

    if (accError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No active Google Cloud service accounts found in database.' }, { status: 400 });
    }

    // Auto-reset daily counters if date has changed
    let availableAccounts = [];
    for (const acc of accounts) {
      if (acc.last_reset_date !== today) {
        await supabase
          .from('service_accounts')
          .update({ daily_count: 0, last_reset_date: today })
          .eq('id', acc.id);
        acc.daily_count = 0;
        acc.last_reset_date = today;
      }
      if (acc.daily_count < DAILY_LIMIT) {
        availableAccounts.push(acc);
      }
    }

    const results = [];
    let accIndex = 0;

    for (const url of cleanUrls) {
      let isSuccess = false;
      let rotated = false;
      let lastErrMessage = '';

      while (!isSuccess && availableAccounts.length > 0) {
        if (accIndex >= availableAccounts.length) accIndex = 0;
        const currentAccount = availableAccounts[accIndex];

        try {
          // Initialize Google JWT client
          const jwtClient = new google.auth.JWT({
            email: currentAccount.credentials.client_email,
            key: currentAccount.credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/indexing'],
          });

          const indexing = google.indexing({ version: 'v3', auth: jwtClient });

          // Publish notification
          await indexing.urlNotifications.publish({
            requestBody: {
              url,
              type: notificationType,
            },
          });

          // Quota increment
          const newCount = currentAccount.daily_count + 1;
          currentAccount.daily_count = newCount;
          await supabase
            .from('service_accounts')
            .update({ daily_count: newCount })
            .eq('id', currentAccount.id);

          if (newCount >= DAILY_LIMIT) {
            availableAccounts = availableAccounts.filter((a) => a.id !== currentAccount.id);
          }

          // Log success to Supabase
          await supabase.from('url_logs').insert([
            {
              url,
              status: 'SUCCESS',
              notification_type: notificationType,
              http_code: 200,
              used_account_id: currentAccount.id,
              used_project_name: currentAccount.project_name,
              response_message: 'Indexed successfully by Google Indexing API',
            },
          ]);

          results.push({
            url,
            status: 'SUCCESS',
            account: currentAccount.project_name,
            rotated,
          });
          isSuccess = true;
          accIndex = (accIndex + 1) % Math.max(1, availableAccounts.length);
        } catch (apiError: any) {
          const status = apiError?.status || apiError?.code || 500;
          const msg = apiError?.message || 'Google API error';

          // Automated Fallback: 429 Too Many Requests or Quota Exceeded
          if (status === 429 || msg.toLowerCase().includes('quota')) {
            console.warn(`[Auto-Rotate] Project ${currentAccount.project_name} reached 429 quota. Rotating to next account.`);
            await supabase
              .from('service_accounts')
              .update({ daily_count: DAILY_LIMIT })
              .eq('id', currentAccount.id);

            availableAccounts = availableAccounts.filter((a) => a.id !== currentAccount.id);
            rotated = true;
            lastErrMessage = msg;
            // Retries url with next account
          } else {
            // Non-quota error (e.g. 403 permission denied)
            lastErrMessage = msg;
            break;
          }
        }
      }

      if (!isSuccess) {
        // Log failure
        await supabase.from('url_logs').insert([
          {
            url,
            status: availableAccounts.length === 0 ? 'QUOTA_EXHAUSTED' : 'FAILED',
            notification_type: notificationType,
            http_code: 429,
            response_message: lastErrMessage || 'All accounts exhausted',
          },
        ]);

        results.push({
          url,
          status: 'FAILED',
          message: lastErrMessage,
        });
      }
    }

    return NextResponse.json({
      total: cleanUrls.length,
      processed: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
