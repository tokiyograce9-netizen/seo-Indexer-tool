import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthGate } from './components/AuthGate';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { BulkIndexingPanel } from './components/BulkIndexingPanel';
import { ServiceAccountsPanel } from './components/ServiceAccountsPanel';
import { LogsTable } from './components/LogsTable';
import { IndexVerifierPanel } from './components/IndexVerifierPanel';
import { ServiceAccount, UrlLog, SystemStatus } from './lib/types';
import { apiFetch, clearAuthToken, getAuthToken } from './lib/api';

// Inactivity timeout: 10 minutes of no user interaction
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [logs, setLogs] = useState<UrlLog[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<any>(null);

  // Check initial session from sessionStorage
  const checkSession = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      return;
    }

    try {
      const res = await apiFetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
      } else {
        clearAuthToken();
        setIsAuthenticated(false);
      }
    } catch {
      clearAuthToken();
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Tab refresh and close session auto-lock trigger
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear token so refreshing or closing the tab immediately locks the session
      clearAuthToken();
      try {
        navigator.sendBeacon('/api/auth/logout');
      } catch {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Inactivity auto-lock monitor (10 minutes)
  const handleLogout = useCallback(async (notice?: string) => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearAuthToken();
    setIsAuthenticated(false);
    if (notice) {
      setLockNotice(notice);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const resetInactivityTimer = () => {
      lastActivityRef.current = Date.now();
    };

    // User interaction listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Check inactivity every 15 seconds
    inactivityTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleLogout('Session locked due to 10 minutes of inactivity. All your working drafts are saved.');
      }
    }, 15000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
    };
  }, [isAuthenticated, handleLogout]);

  // Load Status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Status fetch error:', err);
    }
  }, []);

  // Load Accounts
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await apiFetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.warn('Accounts fetch error:', err);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Load Logs
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const query = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') query.set('status', statusFilter);
      if (searchTerm) query.set('search', searchTerm);
      query.set('limit', '200');

      const res = await apiFetch(`/api/logs?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.warn('Logs fetch error:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [statusFilter, searchTerm]);

  // Refresh all data
  const refreshAll = useCallback(() => {
    fetchStatus();
    fetchAccounts();
    fetchLogs();
  }, [fetchStatus, fetchAccounts, fetchLogs]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
      const interval = setInterval(refreshAll, 25000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshAll]);

  // Auth gate check
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          <span>Verifying security session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthGate
        onAuthenticated={() => {
          setLockNotice(null);
          setIsAuthenticated(true);
        }}
        lockNotice={lockNotice}
      />
    );
  }

  // Calculate logs counts
  const logsCount = {
    total: logs.length,
    success: logs.filter((l) => l.status === 'SUCCESS').length,
    failed: logs.filter((l) => l.status === 'FAILED' || l.status === 'QUOTA_EXHAUSTED').length,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header without Supabase/Vercel buttons */}
      <Header status={status} onLogout={() => handleLogout()} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* System Stats Cards */}
        <StatsCards status={status} logsCount={logsCount} />

        {/* Bulk URL Submission Engine (200 URLs/day per account fixed) */}
        <BulkIndexingPanel
          onBatchCompleted={refreshAll}
          activeAccountsCount={status?.activeAccounts ?? 0}
        />

        {/* Live Google Index & SERP Inspector */}
        <IndexVerifierPanel />

        {/* Service Accounts Management & Key Uploader */}
        <ServiceAccountsPanel
          accounts={accounts}
          loading={loadingAccounts}
          onRefresh={refreshAll}
        />

        {/* Live Status Response Log Table */}
        <LogsTable
          logs={logs}
          loading={loadingLogs}
          onRefresh={fetchLogs}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950 py-4 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SEO INDEXER • Multi-Account Google URL Indexing & Automated 429 Quota Rotation</span>
          <span className="font-mono text-[11px] text-neutral-400">PostgreSQL Backend Active</span>
        </div>
      </footer>
    </div>
  );
}
