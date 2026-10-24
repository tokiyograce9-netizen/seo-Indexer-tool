import React, { useState } from 'react';
import {
  ListFilter,
  Download,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { UrlLog } from '../lib/types';

interface LogsTableProps {
  logs: UrlLog[];
  loading: boolean;
  onRefresh: () => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}

export const LogsTable: React.FC<LogsTableProps> = ({
  logs,
  loading,
  onRefresh,
  statusFilter,
  setStatusFilter,
  searchTerm,
  setSearchTerm,
}) => {
  const [selectedLog, setSelectedLog] = useState<UrlLog | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all URL indexing history?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setClearing(false);
    }
  };

  const handleExportCsv = () => {
    window.location.href = '/api/logs/export';
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl mb-8">
      {/* Table Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-indigo-400" />
            Live Response Status Logs ({logs.length})
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real-time audit trail of Google API requests, HTTP codes, and rotated accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success Only</option>
            <option value="FAILED">Failed Only</option>
            <option value="QUOTA_EXHAUSTED">Quota Exhausted (429)</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter URL or project..."
              className="bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-indigo-500 w-44 sm:w-52"
            />
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors cursor-pointer disabled:opacity-40"
            title="Download CSV export"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Clear Logs */}
          <button
            onClick={handleClearLogs}
            disabled={clearing || logs.length === 0}
            className="p-1.5 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="p-8 text-center border border-neutral-800/80 rounded-2xl bg-neutral-950/40">
          <p className="text-sm font-semibold text-neutral-300">No indexing logs found</p>
          <p className="text-xs text-neutral-500 mt-1">
            Submit a batch of URLs using the console above to view live execution logs and account rotation.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5">Target URL</th>
                <th className="py-3 px-3.5">Account / Project</th>
                <th className="py-3 px-3.5">Action</th>
                <th className="py-3 px-3.5">HTTP</th>
                <th className="py-3 px-3.5">Timestamp</th>
                <th className="py-3 px-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {logs.map((log) => {
                const isSuccess = log.status === 'SUCCESS';
                const isQuota = log.status === 'QUOTA_EXHAUSTED';

                return (
                  <tr
                    key={log.id}
                    className="hover:bg-neutral-800/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedLog(log)}
                  >
                    {/* Status Badge */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isQuota
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {isSuccess ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : isQuota ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {log.status}
                      </span>
                    </td>

                    {/* URL */}
                    <td className="py-3 px-3.5 max-w-xs truncate text-neutral-200">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{log.url}</span>
                        <a
                          href={log.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-neutral-500 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>

                    {/* Account Used */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-neutral-400 text-[11px]">
                      {log.used_project_name ? (
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                          {log.used_project_name}
                        </span>
                      ) : (
                        <span className="text-neutral-600">None</span>
                      )}
                    </td>

                    {/* Action Type */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-neutral-400">
                      {log.notification_type || 'URL_UPDATED'}
                    </td>

                    {/* HTTP Code */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          log.http_code === 200
                            ? 'text-emerald-400'
                            : log.http_code === 429
                            ? 'text-amber-400'
                            : 'text-red-400'
                        }`}
                      >
                        {log.http_code || '---'}
                      </span>
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-neutral-500 text-[11px]">
                      {formatTime(log.created_at)}
                    </td>

                    {/* View Details */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                Google Indexing Log Details
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-neutral-400 font-semibold block mb-0.5">Target URL:</span>
                <p className="font-mono text-cyan-300 break-all p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                  {selectedLog.url}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-neutral-400 font-semibold block mb-0.5">Execution Status:</span>
                  <span className="font-mono text-white font-bold">{selectedLog.status}</span>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block mb-0.5">HTTP Code:</span>
                  <span className="font-mono text-white font-bold">{selectedLog.http_code || 'N/A'}</span>
                </div>
              </div>

              <div>
                <span className="text-neutral-400 font-semibold block mb-0.5">Service Account Project:</span>
                <p className="font-mono text-neutral-200">
                  {selectedLog.used_project_name || 'None (Failed before account assignment)'}
                </p>
              </div>

              <div>
                <span className="text-neutral-400 font-semibold block mb-0.5">Google API Response / Message:</span>
                <pre className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {selectedLog.response_message || 'No response message available.'}
                </pre>
              </div>

              {selectedLog.http_code === 403 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                  <strong>How to fix 403 Permission Denied:</strong>
                  <br />
                  Open <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="underline font-bold">Google Search Console</a> &rarr; Select your property &rarr; Go to Settings &rarr; Users and permissions &rarr; Click <em>Add user</em> &rarr; Paste the service account's <code>client_email</code> and grant <strong>Owner</strong> permission.
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
