import React from 'react';
import { ShieldCheck, LogOut, Activity } from 'lucide-react';
import { SystemStatus } from '../lib/types';

interface HeaderProps {
  status: SystemStatus | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ status, onLogout }) => {
  return (
    <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-neutral-950 font-bold">
            <ShieldCheck className="w-5 h-5 text-neutral-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">SEO INDEXER</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                ROTATION ENGINE
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 hidden sm:block">
              Multi-Project Google URL Indexer • Automated 429 Quota Failover
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Active Pool Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>
              Pool: <strong className="text-white">{status?.remainingDailyQuota ?? 0}</strong> / {status?.totalDailyQuota ?? 0}
            </span>
          </div>

          {/* Logout / Lock */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs font-medium"
            title="Lock Dashboard / Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </div>
    </header>
  );
};
