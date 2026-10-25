import React, { useState } from 'react';
import { Rocket, Copy, Check, FileCode, CheckCircle2, ChevronRight, Layers, Shield, Database } from 'lucide-react';

interface DeployGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeployGuideModal: React.FC<DeployGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'INDEXING_ROUTE' | 'ACCOUNTS_ROUTE' | 'AUTH_ROUTE' | 'ENV'>('OVERVIEW');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyCode = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const codeSnippets = {
    indexingRoute: `// app/api/indexing/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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
    const { data: accounts } = await supabase
      .from('service_accounts')
      .select('*')
      .eq('is_active', true)
      .order('daily_count', { ascending: true });

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No active Google Cloud service accounts found.' }, { status: 400 });
    }

    let availableAccounts = [];
    for (const acc of accounts) {
      if (acc.last_reset_date !== today) {
        await supabase
          .from('service_accounts')
          .update({ daily_count: 0, last_reset_date: today })
          .eq('id', acc.id);
        acc.daily_count = 0;
      }
      if (acc.daily_count < DAILY_LIMIT) availableAccounts.push(acc);
    }

    const results = [];
    let accIndex = 0;

    for (const url of cleanUrls) {
      let isSuccess = false;
      let rotated = false;
      let lastErr = '';

      while (!isSuccess && availableAccounts.length > 0) {
        if (accIndex >= availableAccounts.length) accIndex = 0;
        const currentAccount = availableAccounts[accIndex];

        try {
          const jwtClient = new google.auth.JWT({
            email: currentAccount.credentials.client_email,
            key: currentAccount.credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/indexing'],
          });

          const indexing = google.indexing({ version: 'v3', auth: jwtClient });
          await indexing.urlNotifications.publish({
            requestBody: { url, type: notificationType },
          });

          // Quota increment
          const newCount = currentAccount.daily_count + 1;
          currentAccount.daily_count = newCount;
          await supabase.from('service_accounts').update({ daily_count: newCount }).eq('id', currentAccount.id);

          if (newCount >= DAILY_LIMIT) {
            availableAccounts = availableAccounts.filter(a => a.id !== currentAccount.id);
          }

          await supabase.from('url_logs').insert([{
            url,
            status: 'SUCCESS',
            http_code: 200,
            used_account_id: currentAccount.id,
            used_project_name: currentAccount.project_name,
            response_message: 'Indexed successfully by Google Indexing API',
          }]);

          results.push({ url, status: 'SUCCESS', account: currentAccount.project_name, rotated });
          isSuccess = true;
          accIndex = (accIndex + 1) % Math.max(1, availableAccounts.length);
        } catch (apiError: any) {
          const status = apiError?.status || apiError?.code || 500;
          const msg = apiError?.message || 'Google API error';

          // Automated Fallback: 429 Too Many Requests or Quota Exceeded
          if (status === 429 || msg.toLowerCase().includes('quota')) {
            console.warn(\`[Auto-Rotate] Project \${currentAccount.project_name} hit 429 quota. Rotating.\`);
            await supabase.from('service_accounts').update({ daily_count: DAILY_LIMIT }).eq('id', currentAccount.id);
            availableAccounts = availableAccounts.filter(a => a.id !== currentAccount.id);
            rotated = true;
            lastErr = msg;
          } else {
            lastErr = msg;
            break;
          }
        }
      }

      if (!isSuccess) {
        await supabase.from('url_logs').insert([{
          url,
          status: availableAccounts.length === 0 ? 'QUOTA_EXHAUSTED' : 'FAILED',
          http_code: 429,
          response_message: lastErr || 'All accounts exhausted',
        }]);
        results.push({ url, status: 'FAILED', message: lastErr });
      }
    }

    return NextResponse.json({ total: cleanUrls.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`,

    accountsRoute: `// app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  const { data, error } = await supabase
    .from('service_accounts')
    .select('id, project_name, client_email, daily_count, last_reset_date, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const creds = body.credentials || body;

    if (!creds.project_id || !creds.client_email || !creds.private_key) {
      return NextResponse.json({ error: 'Missing service account fields.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('service_accounts')
      .insert([{
        project_name: creds.project_id,
        client_email: creds.client_email,
        credentials: creds,
        daily_count: 0,
        last_reset_date: new Date().toISOString().split('T')[0],
        is_active: true,
      }])
      .select('id, project_name, client_email, daily_count, is_active')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, account: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`,

    authRoute: `// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OTP_CODE = process.env.OTP_CODE || '0123456789';

export async function POST(req: NextRequest) {
  try {
    const { step, password, otp } = await req.json();

    if (step === 'CHECK_PASSWORD') {
      if (password === ADMIN_PASSWORD) {
        return NextResponse.json({ success: true, step: 'OTP_REQUIRED' });
      }
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    if (step === 'VERIFY_OTP') {
      if (otp === OTP_CODE) {
        const res = NextResponse.json({ success: true });
        res.cookies.set('openindex_session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
        return res;
      }
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`,

    envFile: `# .env for Vercel Deployment
ADMIN_PASSWORD="your-strong-admin-password"
OTP_CODE="0123456789"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
DAILY_QUOTA_PER_ACCOUNT="200"`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-neutral-950 font-bold">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Next.js (App Router) & Vercel 1-Click Guide</h3>
              <p className="text-xs text-neutral-400">Complete source code & architecture for standalone Vercel hosting</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm cursor-pointer p-1">
            ✕
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-neutral-800 gap-2 pt-3 shrink-0 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Deploy Steps
          </button>
          <button
            onClick={() => setActiveTab('INDEXING_ROUTE')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'INDEXING_ROUTE'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            app/api/indexing/route.ts
          </button>
          <button
            onClick={() => setActiveTab('ACCOUNTS_ROUTE')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'ACCOUNTS_ROUTE'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            app/api/accounts/route.ts
          </button>
          <button
            onClick={() => setActiveTab('AUTH_ROUTE')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'AUTH_ROUTE'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            app/api/auth/route.ts
          </button>
          <button
            onClick={() => setActiveTab('ENV')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'ENV'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            .env Variables
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">1</span>
                  Setup Supabase Database (Free Tier)
                </h4>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">Supabase</a>, create a free project, open the <strong>SQL Editor</strong>, and paste the contents of <code>schema.sql</code>. This creates the <code>service_accounts</code> and <code>url_logs</code> tables with indexes.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">2</span>
                  Deploy to Vercel (Hobby Tier - Zero Cost)
                </h4>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Import the repository into <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">Vercel</a>. Set the environment variables:
                </p>
                <div className="bg-neutral-900 p-2.5 rounded-lg font-mono text-[11px] text-cyan-300">
                  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, OTP_CODE
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">3</span>
                  Connect Google Cloud & Search Console
                </h4>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Enable the <strong>Web Search Indexing API</strong> in Google Cloud Console. Create service account(s) and download the <code>.json</code> key(s). Add each service account email as an <strong>Owner</strong> in Google Search Console for your site. Then drop the JSON keys into SEO INDEXER!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'INDEXING_ROUTE' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-mono text-neutral-400">app/api/indexing/route.ts</span>
                <button
                  onClick={() => copyCode('indexing', codeSnippets.indexingRoute)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                >
                  {copiedKey === 'indexing' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'indexing' ? 'Copied' : 'Copy Route'}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-96 leading-relaxed">
                {codeSnippets.indexingRoute}
              </pre>
            </div>
          )}

          {activeTab === 'ACCOUNTS_ROUTE' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-mono text-neutral-400">app/api/accounts/route.ts</span>
                <button
                  onClick={() => copyCode('accounts', codeSnippets.accountsRoute)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                >
                  {copiedKey === 'accounts' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'accounts' ? 'Copied' : 'Copy Route'}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-96 leading-relaxed">
                {codeSnippets.accountsRoute}
              </pre>
            </div>
          )}

          {activeTab === 'AUTH_ROUTE' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-mono text-neutral-400">app/api/auth/route.ts</span>
                <button
                  onClick={() => copyCode('auth', codeSnippets.authRoute)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                >
                  {copiedKey === 'auth' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'auth' ? 'Copied' : 'Copy Route'}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-96 leading-relaxed">
                {codeSnippets.authRoute}
              </pre>
            </div>
          )}

          {activeTab === 'ENV' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-mono text-neutral-400">.env.production</span>
                <button
                  onClick={() => copyCode('env', codeSnippets.envFile)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                >
                  {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'env' ? 'Copied' : 'Copy .env'}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-amber-300 overflow-x-auto leading-relaxed">
                {codeSnippets.envFile}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-neutral-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
