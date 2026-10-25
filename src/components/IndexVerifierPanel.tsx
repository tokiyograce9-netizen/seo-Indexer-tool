import React, { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  Copy,
  Check,
} from 'lucide-react';
import { UrlVerificationResult } from '../lib/types';
import { apiFetch } from '../lib/api';

const LAST_VERIFIED_KEY = 'seo_indexer_last_verified_url';

export const IndexVerifierPanel: React.FC = () => {
  const [targetUrl, setTargetUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UrlVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore last verified URL from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_VERIFIED_KEY);
      if (saved) {
        setTargetUrl(saved);
      }
    } catch {}
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    let clean = targetUrl.trim();
    if (!clean) return;

    // Automatically normalize URL so user never has to worry about protocol
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
      setTargetUrl(clean);
    }

    setChecking(true);
    setError(null);
    setResult(null);

    // Save to localStorage
    try {
      localStorage.setItem(LAST_VERIFIED_KEY, clean);
    } catch {}

    try {
      const res = await apiFetch('/api/indexing/verify-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed');

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Verification error');
    } finally {
      setChecking(false);
    }
  };

  const getCleanGoogleSearchUrl = (url: string) => {
    return `https://www.google.com/search?q=site:${encodeURIComponent(url.trim())}`;
  };

  const getKeywordSearchUrl = (url: string, title?: string | null) => {
    const query = title ? `"${title}"` : url.replace(/https?:\/\/[^/]+\//, '').replace(/[-_/]/g, ' ');
    return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
  };

  const copyUrlForGsc = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl mb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Live Google Index & SERP Checker
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Check any website link to verify if it is indexed in Google, inspect live crawlability, and check SERP ranking.
          </p>
        </div>
      </div>

      {/* Input URL form */}
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="Paste any URL (e.g. https://yourwebsite.com/blog/article-name)"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={checking || !targetUrl.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {checking ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Analyzing Live Page...
              </>
            ) : (
              'Check Index Status'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Verification Result Display */}
      {result && (
        <div className="mt-6 p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800/80">
            <div>
              <span className="text-[11px] font-mono text-neutral-400">Target URL Analyzed:</span>
              <p className="font-mono text-emerald-300 text-xs break-all">{result.url}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold font-mono ${
                  result.isAccessible
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                HTTP {result.statusCode || 'ERROR'}
              </span>
              {result.hasNoIndex ? (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  NOINDEX DETECTED
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  INDEXABLE
                </span>
              )}
            </div>
          </div>

          {result.title && (
            <div>
              <span className="text-[11px] text-neutral-400 block mb-0.5">Page Title:</span>
              <p className="text-white font-medium text-xs">{result.title}</p>
            </div>
          )}

          {/* Action Links: Check live on Google without typing site: */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* 1. Live Google Search site: check */}
            <a
              href={getCleanGoogleSearchUrl(result.url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors group cursor-pointer"
            >
              <div>
                <span className="text-xs font-semibold text-white block group-hover:text-emerald-300">
                  1. Check Live on Google
                </span>
                <span className="text-[10px] text-neutral-400">Automatic site: search link</span>
              </div>
              <ExternalLink className="w-4 h-4 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
            </a>

            {/* 2. Direct Search Console Inspection Link */}
            <a
              href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(
                `https://${result.domain}/`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors group cursor-pointer"
            >
              <div>
                <span className="text-xs font-semibold text-white block group-hover:text-cyan-300">
                  2. Open Search Console
                </span>
                <span className="text-[10px] text-neutral-400">Opens property in GSC</span>
              </div>
              <ExternalLink className="w-4 h-4 text-neutral-500 group-hover:text-cyan-400 transition-colors" />
            </a>

            {/* 3. Title SERP ranking search */}
            <a
              href={getKeywordSearchUrl(result.url, result.title)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors group cursor-pointer"
            >
              <div>
                <span className="text-xs font-semibold text-white block group-hover:text-indigo-300">
                  3. Check Google Page Rank
                </span>
                <span className="text-[10px] text-neutral-400">Search exact post title</span>
              </div>
              <ExternalLink className="w-4 h-4 text-neutral-500 group-hover:text-indigo-400 transition-colors" />
            </a>
          </div>

          {/* Search Console 404 Fix & Guidance */}
          <div className="p-3 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-neutral-300">
              To inspect this URL in Google Search Console without 404 errors:
            </span>
            <button
              type="button"
              onClick={() => copyUrlForGsc(result.url)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied URL!' : 'Copy URL for GSC Search Bar'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Explanatory Guide: Search Console vs Indexing API */}
      <div className="mt-6 p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <strong className="text-white text-sm">
              Universal Domain Indexing & Search Console Guidance
            </strong>
            <p className="text-neutral-400 leading-relaxed">
              SEO INDEXER works with <strong>any website or custom domain</strong> you own. You never need to type <code>site:</code> or format links manually — simply paste your URLs.
            </p>
            <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <strong className="text-emerald-400 block mb-1">How Google Indexes Any Link:</strong>
                <span>
                  When you submit URLs in this dashboard, the official Google Indexing API signals Googlebot to crawl and evaluate your page into the search results.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <strong className="text-cyan-400 block mb-1">Search Console Setup:</strong>
                <span>
                  In <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="underline font-bold text-white">Google Search Console</a>, add your service account email as an <strong>Owner</strong> under <em>Settings &rarr; Users and permissions</em> for any property you wish to index.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
