import React, { useState, useEffect, useCallback } from 'react';
import { AuthGate } from './components/AuthGate';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { BulkIndexingPanel } from './components/BulkIndexingPanel';
import { ServiceAccountsPanel } from './components/ServiceAccountsPanel';
import { LogsTable } from './components/LogsTable';
import { SupabaseModal } from './components/SupabaseModal';
import { DeployGuideModal } from './components/DeployGuideModal';
import { ServiceAccount, UrlLog, SystemStatus } from './lib/types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [logs, setLogs] = useState<UrlLog[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  // Check initial session
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setIsAuthenticated(Boolean(data.authenticated));
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Load Status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/status');
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
      const res = await fetch('/api/accounts');
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

      const res = await fetch(`/api/logs?${query.toString()}`);
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
      // Polling interval every 25 seconds
      const interval = setInterval(refreshAll, 25000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshAll]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
  };

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
    return <AuthGate onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  // Calculate logs counts
  const logsCount = {
    total: logs.length,
    success: logs.filter((l) => l.status === 'SUCCESS').length,
    failed: logs.filter((l) => l.status === 'FAILED' || l.status === 'QUOTA_EXHAUSTED').length,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header */}
      <Header
        status={status}
        onOpenDeployModal={() => setIsDeployModalOpen(true)}
        onOpenSchemaModal={() => setIsSupabaseModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* System Stats Cards */}
        <StatsCards status={status} logsCount={logsCount} />

        {/* Bulk URL Submission Engine */}
        <BulkIndexingPanel
          onBatchCompleted={refreshAll}
          activeAccountsCount={status?.activeAccounts ?? 0}
        />

        {/* Service Accounts Management & Key Uploader */}
        <ServiceAccountsPanel
          accounts={accounts}
          loading={loadingAccounts}
          onRefresh={refreshAll}
          onOpenSchemaModal={() => setIsSupabaseModalOpen(true)}
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

      {/* Modals */}
      <SupabaseModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        status={status}
        onRefreshStatus={fetchStatus}
      />

      <DeployGuideModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950 py-4 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>OpenIndex • Production-Ready Google URL Indexing & Automated Multi-Account Rotation</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSupabaseModalOpen(true)}
              className="hover:text-emerald-400 transition-colors cursor-pointer"
            >
              Supabase SQL
            </button>
            <span>•</span>
            <button
              onClick={() => setIsDeployModalOpen(true)}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Next.js & Vercel
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
