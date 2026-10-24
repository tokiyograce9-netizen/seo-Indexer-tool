import React from 'react';
import { ShieldCheck, Database, FileCode2, Rocket, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';
import { SystemStatus } from '../lib/types';

interface HeaderProps {
  status: SystemStatus | null;
  onOpenDeployModal: () => void;
  onOpenSchemaModal: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onOpenDeployModal,
  onOpenSchemaModal,
  onLogout,
}) => {
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
              <span className="font-bold text-base tracking-tight text-white">OpenIndex</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                ROTATION ENGINE
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 hidden sm:block">
              Multi-Project Google URL Indexer • 200/day per account
            </p>
          </div>
        </div>

        {/* Status Indicators & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Supabase status badge */}
          <button
            onClick={onOpenSchemaModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              status?.isSupabaseConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
            title={status?.isSupabaseConnected ? 'Connected to Supabase PostgreSQL' : 'Click to connect Supabase or view SQL schema'}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {status?.isSupabaseConnected ? 'Supabase Connected' : 'Local Storage (Click for SQL)'}
            </span>
            <span className="md:hidden">
              {status?.isSupabaseConnected ? 'Supabase' : 'SQL'}
            </span>
            {status?.isSupabaseConnected ? (
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            )}
          </button>

          {/* SQL Schema Button */}
          <button
            onClick={onOpenSchemaModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/60 text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
            title="View Supabase SQL schema"
          >
            <FileCode2 className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Supabase SQL</span>
          </button>

          {/* Vercel & Next.js Guide Button */}
          <button
            onClick={onOpenDeployModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-300 transition-colors cursor-pointer"
            title="Next.js App Router code & 1-click Vercel deployment guide"
          >
            <Rocket className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Next.js & Vercel</span>
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Lock Dashboard / Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
