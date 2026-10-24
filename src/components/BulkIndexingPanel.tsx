import React, { useState } from 'react';
import { Send, Globe, RefreshCw, CheckCircle2, AlertTriangle, Play, Sparkles, Check, Info } from 'lucide-react';
import { BatchSummary } from '../lib/types';

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

  // Parse and count clean valid URLs
  const parseUrls = (text: string): string[] => {
    const rawLines = text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const validUrls: string[] = [];
    const seen = new Set<string>();

    for (const item of rawLines) {
      try {
        const parsed = new URL(item);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !seen.has(item)) {
          seen.add(item);
          validUrls.push(item);
        }
      } catch {
        // Ignore malformed text until user fixes it
      }
    }
    return validUrls;
  };

  const detectedUrls = parseUrls(urlInput);
  const isOverLimit = detectedUrls.length > 100;

  const loadSampleUrls = () => {
    const sample = [
      'https://example.com/blog/google-indexing-api-guide',
      'https://example.com/products/seo-rotation-cluster',
      'https://example.com/news/instant-url-indexing-2025',
      'https://example.com/docs/supabase-multi-account-setup',
      'https://example.com/tools/bulk-crawler-verification',
    ].join('\n');
    setUrlInput(sample);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setBatchResult(null);

    if (detectedUrls.length === 0) {
      setErrorMessage('Please enter at least one valid HTTP or HTTPS URL.');
      return;
    }

    if (isOverLimit) {
      setErrorMessage(`Limit is 100 URLs per batch. Currently detected: ${detectedUrls.length}.`);
      return;
    }

    if (activeAccountsCount === 0 && !dryRun) {
      setErrorMessage('No active Google Cloud service accounts found! Please upload a key or seed demo accounts first.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/indexing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: detectedUrls,
          notificationType,
          dryRun,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Batch submission failed');
      }

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
            Submit batches of up to 100 URLs with real-time project rotation and 429 failover.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSampleUrls}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Load Sample URLs
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-neutral-300">
              Paste Target URLs (One per line):
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
              {detectedUrls.length} / 100 URLs detected
            </span>
          </div>

          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={6}
            placeholder={`https://yourwebsite.com/new-article\nhttps://yourwebsite.com/product/item-123\nhttps://yourwebsite.com/pricing`}
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
                onClick={() => setNotificationType('URL_UPDATED')}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  notificationType === 'URL_UPDATED'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                URL_UPDATED (Index)
              </button>
              <button
                type="button"
                onClick={() => setNotificationType('URL_DELETED')}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  notificationType === 'URL_DELETED'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                URL_DELETED (Deindex)
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
                Simulate quota tracking & failover without consuming live GCP requests.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
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
            <span>Multi-project round-robin rotation active. 429 errors auto-failover.</span>
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
      {batchResult && (
        <div className="mt-6 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Batch Execution Summary
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              Total: {batchResult.total} URLs
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center mb-3">
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

          <p className="text-[11px] text-neutral-400">
            Results recorded to Supabase PostgreSQL <code>url_logs</code>. See real-time log table below for per-URL account mapping.
          </p>
        </div>
      )}
    </div>
  );
};
