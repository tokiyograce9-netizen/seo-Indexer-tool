import React, { useState, useEffect } from 'react';
import { Send, Globe, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Info, ExternalLink, Copy, Check, ShieldAlert } from 'lucide-react';
import { BatchSummary } from '../lib/types';
import { apiFetch, safeJsonParse } from '../lib/api';

const DRAFT_STORAGE_KEY = 'seo_indexer_working_draft';

interface BulkIndexingPanelProps {
  onBatchCompleted: () => void;
  activeAccountsCount: number;
}

export const BulkIndexingPanel: React.FC<BulkIndexingPanelProps> = ({
  onBatchCompleted,
  activeAccountsCount,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [notificationType, setNotificationType] = useState<'URL_UPDATED' | 'URL_DELETED'>('URL_UPDATED');
  const [dryRun, setDryRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Restore saved working draft on component mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.urlInput) setUrlInput(parsed.urlInput);
        if (parsed.notificationType) setNotificationType(parsed.notificationType);
        if (typeof parsed.dryRun === 'boolean') setDryRun(parsed.dryRun);
      }
    } catch {}
  }, []);

  // Autosave working draft so user never loses work on refresh/lock
  const updateDraft = (updates: { urlInput?: string; notificationType?: 'URL_UPDATED' | 'URL_DELETED'; dryRun?: boolean }) => {
    try {
      const current = {
        urlInput: updates.urlInput !== undefined ? updates.urlInput : urlInput,
        notificationType: updates.notificationType !== undefined ? updates.notificationType : notificationType,
        dryRun: updates.dryRun !== undefined ? updates.dryRun : dryRun,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(current));
    } catch {}
  };

  // Parse and count clean valid URLs
  const parseUrls = (text: string): string[] => {
    const rawLines = text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const validUrls: string[] = [];
    const seen = new Set<string>();

    for (const item of rawLines) {
      // Auto-prefix https:// if user pasted domain or path
      let clean = item;
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
      try {
        const parsed = new URL(clean);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !seen.has(clean)) {
          seen.add(clean);
          validUrls.push(clean);
        }
      } catch {}
    }
    return validUrls;
  };

  const detectedUrls = parseUrls(urlInput);
  const isOverLimit = detectedUrls.length > 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setBatchResult(null);

    if (detectedUrls.length === 0) {
      setErrorMessage('Please enter at least one valid URL.');
      return;
    }

    if (isOverLimit) {
      setErrorMessage(`Limit is 100 URLs per batch. Currently detected: ${detectedUrls.length}.`);
      return;
    }

    if (activeAccountsCount === 0 && !dryRun) {
      setErrorMessage('No active Google Cloud service accounts found! Please check connected service accounts.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/indexing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: detectedUrls,
          notificationType,
          dryRun,
          quotaLimit: 200,
        }),
      });

      const data = await safeJsonParse(res);
      setBatchResult(data);
      onBatchCompleted();
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl mb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            Bulk URL Indexing Console
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Submit batches of up to 100 URLs with real-time multi-account rotation and automated 429 failover.
          </p>
        </div>

        {/* Fixed Quota Capacity Indicator */}
        <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-neutral-300 font-mono">
            Limit: <strong>200 URLs/day</strong> per account • Capacity: <strong>{(Math.max(1, activeAccountsCount) * 200).toLocaleString()}</strong> URLs/day
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-neutral-300">
              Paste Target URLs (Any website or domain, one per line):
            </label>
            <span
              className={`font-mono text-[11px] ${
                isOverLimit
                  ? 'text-red-400 font-bold'
                  : detectedUrls.length > 0
                  ? 'text-cyan-400'
                  : 'text-neutral-500'
              }`}
            >
              {detectedUrls.length} / 100 URLs detected (Draft Autosaved)
            </span>
          </div>

          <textarea
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              updateDraft({ urlInput: e.target.value });
            }}
            rows={6}
            placeholder={`https://yourwebsite.com/new-article\nhttps://yourdomain.com/blog/seo-updates\nhttps://yourstore.com/products/item-456`}
            className="w-full bg-neutral-950 border border-neutral-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 rounded-xl p-3.5 text-xs font-mono text-neutral-100 placeholder-neutral-600 outline-none transition-all leading-relaxed"
          />
        </div>

        {/* Options Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Notification Type Selector */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Google Indexing Action
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotificationType('URL_UPDATED');
                  updateDraft({ notificationType: 'URL_UPDATED' });
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  notificationType === 'URL_UPDATED'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                URL_UPDATED (Index / Refresh)
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotificationType('URL_DELETED');
                  updateDraft({ notificationType: 'URL_DELETED' });
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  notificationType === 'URL_DELETED'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                URL_DELETED (Remove from Index)
              </button>
            </div>
          </div>

          {/* Dry Run / Simulation Mode */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-neutral-200 block">
                Simulation Mode
              </span>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Automatically rotates to next account when quota fills and adds +200 capacity per account.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => {
                  setDryRun(e.target.checked);
                  updateDraft({ dryRun: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Submit Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-neutral-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-neutral-500" />
            <span>Multi-project round-robin rotation active. 200 URLs/day per account.</span>
          </div>

          <button
            type="submit"
            disabled={submitting || detectedUrls.length === 0 || isOverLimit}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Publishing {detectedUrls.length} URLs to Google...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit {detectedUrls.length > 0 ? `${detectedUrls.length} URLs` : 'Batch'} Now
              </>
            )}
          </button>
        </div>
      </form>

      {/* Batch Results Banner */}
      {batchResult && (() => {
        const failedItems = batchResult.results.filter((r) => r.status !== 'SUCCESS');
        const hasApiDisabledError = failedItems.some(
          (r) =>
            r.message.toLowerCase().includes('disabled') ||
            r.message.toLowerCase().includes('not enabled') ||
            r.message.toLowerCase().includes('service_disabled')
        );
        const hasPermissionError = !hasApiDisabledError && failedItems.some(
          (r) => r.httpCode === 403 || r.message.toLowerCase().includes('permission') || r.message.toLowerCase().includes('owner')
        );

        let targetDomain = '';
        try {
          if (failedItems[0]?.url) {
            targetDomain = new URL(failedItems[0].url).hostname;
          }
        } catch {}

        const saEmail = 'seo-automation@seo-automation-503206.iam.gserviceaccount.com';
        const projectId = failedItems[0]?.projectName || 'seo-automation-503206';
        const gcpEnableUrl = `https://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=${projectId}`;
        const gscUsersUrl = targetDomain
          ? `https://search.google.com/search-console/users?resource_id=${encodeURIComponent(`https://${targetDomain}/`)}`
          : 'https://search.google.com/search-console';

        const copySaEmail = () => {
          navigator.clipboard.writeText(saEmail);
          setCopiedEmail(true);
          setTimeout(() => setCopiedEmail(false), 2500);
        };

        return (
          <div className="mt-6 p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Batch Execution Summary
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                Total: {batchResult.total} URLs
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs text-neutral-400 block">Succeeded</span>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {batchResult.succeeded}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <span className="text-xs text-neutral-400 block">429 Rotations</span>
                <span className="text-lg font-bold font-mono text-cyan-400">
                  {batchResult.rotatedCount}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-xs text-neutral-400 block">Failed</span>
                <span className="text-lg font-bold font-mono text-red-400">
                  {batchResult.failed}
                </span>
              </div>
            </div>

            {/* ROOT CAUSE 1: WEB SEARCH INDEXING API DISABLED IN GOOGLE CLOUD */}
            {hasApiDisabledError && (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="font-bold text-amber-300 text-sm">
                      Root Cause: Web Search Indexing API is DISABLED in Google Cloud Console
                    </h3>
                    <p className="text-neutral-300 leading-relaxed text-[11px]">
                      Even though your service account email is added as an Owner in Google Search Console, Google Cloud blocks all requests because the <strong>Web Search Indexing API</strong> is not turned on for project <code className="text-cyan-300 font-mono">{projectId}</code>.
                    </p>
                  </div>
                </div>

                <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="text-[10px] text-neutral-400 font-sans block">Required Action:</span>
                    <span className="text-neutral-200 font-medium">Enable the Web Search Indexing API on Google Cloud</span>
                  </div>
                  <a
                    href={gcpEnableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors shadow-lg cursor-pointer shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Click Here to Enable API in Google Cloud</span>
                  </a>
                </div>

                <div className="bg-neutral-900/60 rounded-lg p-3 text-[11px] text-neutral-300 space-y-1">
                  <strong className="text-amber-200 block">Steps to finish in 1 minute:</strong>
                  <ol className="list-decimal list-inside space-y-1 text-neutral-400">
                    <li>Click the blue/amber button above to open the API page in Google Cloud Console.</li>
                    <li>Click the blue <strong className="text-white">"ENABLE"</strong> button.</li>
                    <li>Wait 1-2 minutes for Google's systems to propagate the activation.</li>
                    <li>Re-submit your URLs — all links will index immediately with <strong className="text-emerald-400">200 OK</strong>!</li>
                  </ol>
                </div>
              </div>
            )}

            {/* ROOT CAUSE 2: SEARCH CONSOLE OWNERSHIP ERROR */}
            {hasPermissionError && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="font-bold text-amber-300 text-sm">
                      Google Search Console Ownership Required (403 Permission Denied)
                    </h3>
                    <p className="text-neutral-300 leading-relaxed text-[11px]">
                      Google Indexing API rejected your URLs because the connected Google Service Account is not yet added as an <strong>Owner</strong> in Google Search Console for {targetDomain ? <strong className="text-white">https://{targetDomain}/</strong> : 'your website domain'}.
                    </p>
                  </div>
                </div>

                {/* Email Copy & Direct Link */}
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-400 font-sans block">Service Account Email to authorize:</span>
                    <span className="text-cyan-300 font-bold truncate block">{saEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={copySaEmail}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-sans font-medium cursor-pointer transition-colors"
                    >
                      {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
                      <span>{copiedEmail ? 'Copied Email!' : 'Copy Email'}</span>
                    </button>
                    <a
                      href={gscUsersUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs font-sans transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Search Console Users</span>
                    </a>
                  </div>
                </div>

                {/* Quick 4-Step Resolution */}
                <div className="bg-neutral-900/60 rounded-lg p-3 space-y-1.5 text-[11px] text-neutral-300">
                  <strong className="text-amber-200 block">How to resolve in 30 seconds:</strong>
                  <ol className="list-decimal list-inside space-y-1 text-neutral-400">
                    <li>Click <strong className="text-neutral-200">"Open Search Console Users"</strong> above for your property.</li>
                    <li>Click the blue <strong className="text-neutral-200">"Add user"</strong> button.</li>
                    <li>Paste the copied service account email: <code className="text-cyan-300">{saEmail}</code></li>
                    <li>Permission: Select <strong className="text-emerald-400">Owner</strong> (must be Owner, not Restricted), and click <strong className="text-neutral-200">Add</strong>.</li>
                    <li>Return here and re-submit your URLs — Google Indexing API will accept all links immediately with <strong className="text-emerald-400">HTTP 200 OK</strong>!</li>
                  </ol>
                  <div className="pt-1.5 text-[10px] text-neutral-400 border-t border-neutral-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Tip: To test batch rotation and quota capacity right now without Search Console, toggle ON <strong>Simulation Mode</strong> above!</span>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown of URLs */}
            {failedItems.length > 0 && (
              <div className="border border-neutral-800 rounded-lg p-3 bg-neutral-900/40 space-y-2">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                  Detailed Error Breakdown ({failedItems.length} failed):
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono text-[11px]">
                  {failedItems.map((item, idx) => (
                    <div key={idx} className="p-2 rounded bg-neutral-950 border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-neutral-300">
                      <span className="truncate max-w-sm text-neutral-200">{item.url}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-red-400 font-bold">HTTP {item.httpCode || 403}</span>
                        <span className="text-neutral-400 text-[10px]">({item.projectName || 'Default'})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-neutral-400">
              Results recorded to Supabase PostgreSQL <code>url_logs</code>. See real-time log table below for complete audit trail.
            </p>
          </div>
        );
      })()}
    </div>
  );
};
