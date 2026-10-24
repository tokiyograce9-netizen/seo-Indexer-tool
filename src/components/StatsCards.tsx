import React from 'react';
import { Layers, Activity, Zap, RefreshCw } from 'lucide-react';
import { SystemStatus } from '../lib/types';

interface StatsCardsProps {
  status: SystemStatus | null;
  logsCount: { total: number; success: number; failed: number };
}

export const StatsCards: React.FC<StatsCardsProps> = ({ status, logsCount }) => {
  const totalDailyQuota = status?.totalDailyQuota || 0;
  const usedDailyQuota = status?.usedDailyQuota || 0;
  const remainingDailyQuota = status?.remainingDailyQuota || 0;
  const percentageUsed = totalDailyQuota > 0 ? Math.min(100, Math.round((usedDailyQuota / totalDailyQuota) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Connected Accounts */}
      <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-2xl p-4.5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-neutral-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Service Accounts</span>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white">
            {status?.activeAccounts ?? 0}
          </span>
          <span className="text-xs text-neutral-400">
            active / {status?.totalAccounts ?? 0} total
          </span>
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          {((status?.activeAccounts ?? 0) * 200).toLocaleString()} maximum daily URLs
        </p>
      </div>

      {/* 2. Daily Quota Pool */}
      <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-2xl p-4.5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-neutral-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Daily Quota Pool</span>
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-cyan-300">
            {remainingDailyQuota.toLocaleString()}
          </span>
          <span className="text-xs text-neutral-400">
            / {totalDailyQuota.toLocaleString()} left
          </span>
        </div>
        <div className="mt-2 w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${percentageUsed}%` }}
          />
        </div>
      </div>

      {/* 3. URLs Processed */}
      <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-2xl p-4.5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-neutral-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">URLs Processed</span>
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Zap className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white">
            {logsCount.total}
          </span>
          <span className="text-xs text-emerald-400 font-medium">
            {logsCount.success} success
          </span>
          {logsCount.failed > 0 && (
            <span className="text-xs text-red-400 font-medium">
              ({logsCount.failed} fail)
            </span>
          )}
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          {logsCount.total > 0
            ? `${Math.round((logsCount.success / logsCount.total) * 100)}% batch delivery rate`
            : 'Ready for bulk submission'}
        </p>
      </div>

      {/* 4. Automated 429 Rotation Engine */}
      <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-2xl p-4.5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-neutral-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Rotation Engine</span>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <RefreshCw className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            429 AUTO-FAILOVER
          </span>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">
          Transfers exhausted project requests to next active account automatically.
        </p>
      </div>
    </div>
  );
};
