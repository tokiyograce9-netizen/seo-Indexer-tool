import React, { useState, useEffect } from 'react';
import { Database, Copy, Check, ExternalLink, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SystemStatus } from '../lib/types';
import { safeJsonParse } from '../lib/api';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatus | null;
  onRefreshStatus: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  status,
  onRefreshStatus,
}) => {
  const [sqlText, setSqlText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<{ text: string; success: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/schema-sql')
        .then((r) => r.text())
        .then((t) => setSqlText(t))
        .catch(() => setSqlText('-- Could not load schema.sql'));

      if (status?.supabaseUrl) {
        setSupabaseUrl(status.supabaseUrl);
      }
    }
  }, [isOpen, status]);

  if (!isOpen) return null;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setConnectMessage(null);
    try {
      const res = await fetch('/api/system/config-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: supabaseUrl.trim(), key: supabaseKey.trim() }),
      });
      const data = await safeJsonParse(res);

      setConnectMessage({ text: data.message, success: data.success });
      onRefreshStatus();
    } catch (err: any) {
      setConnectMessage({ text: err.message, success: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Supabase PostgreSQL Configuration</h3>
              <p className="text-xs text-neutral-400">Database schema, tables, and direct connection setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-sm cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto space-y-5 py-4 pr-1 text-xs">
          {/* Status Box */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              status?.isSupabaseConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {status?.isSupabaseConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              )}
              <span>
                {status?.isSupabaseConnected
                  ? `Active: Connected to Supabase (${status.supabaseUrl})`
                  : 'Storage Mode: Local Resilient Fallback (Ready for Supabase PostgreSQL)'}
              </span>
            </div>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Supabase Dashboard
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Module 1: Exact SQL Schema */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-neutral-200 uppercase tracking-wider text-[11px]">
                1. Supabase SQL Schema (Run in Supabase SQL Editor):
              </label>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied to Clipboard!' : 'Copy SQL Schema'}
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-52 leading-relaxed">
              {sqlText}
            </pre>
          </div>

          {/* Connect Live Supabase Credentials Form */}
          <form onSubmit={handleConnectSupabase} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <label className="font-semibold text-neutral-200 block text-xs">
              2. Connect Live Supabase PostgreSQL:
            </label>
            <p className="text-[11px] text-neutral-400">
              Paste your Supabase Project URL and Service Role Key (from <em>Project Settings &rarr; API</em>):
            </p>

            <div className="space-y-2">
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzproject.supabase.co"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-emerald-500 font-mono"
              />
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (service_role key)"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {connectMessage && (
              <p
                className={`text-[11px] font-mono ${
                  connectMessage.success ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {connectMessage.text}
              </p>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={testing || !supabaseUrl.trim() || !supabaseKey.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Connecting to PostgreSQL...
                  </>
                ) : (
                  'Test & Save Supabase Connection'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-neutral-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
