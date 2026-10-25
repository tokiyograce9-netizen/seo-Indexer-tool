import React, { useState, useRef } from 'react';
import {
  Upload,
  Layers,
  Key,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  FileJson,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Edit3,
  FileCheck,
} from 'lucide-react';
import { ServiceAccount } from '../lib/types';
import { apiFetch, safeJsonParse } from '../lib/api';

interface ServiceAccountsPanelProps {
  accounts: ServiceAccount[];
  loading: boolean;
  onRefresh: () => void;
}

export const ServiceAccountsPanel: React.FC<ServiceAccountsPanelProps> = ({
  accounts,
  loading,
  onRefresh,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [rawJsonText, setRawJsonText] = useState('');
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string; details?: any } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit / Reupload Modal State
  const [editingAccount, setEditingAccount] = useState<ServiceAccount | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editJsonText, setEditJsonText] = useState('');
  const [reuploadFileLoading, setReuploadFileLoading] = useState(false);
  const [editMessage, setEditMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    setUploading(true);
    setUploadMessage(null);
    try {
      const parsedFiles = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.name.endsWith('.json') || file.type.includes('json')) {
          const text = await file.text();
          try {
            const json = JSON.parse(text);
            parsedFiles.push(json);
          } catch (e) {
            console.warn(`File ${file.name} is not valid JSON`);
          }
        }
      }

      if (parsedFiles.length === 0) {
        throw new Error('No valid .json Google Cloud service account key files selected.');
      }

      const res = await apiFetch('/api/accounts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: parsedFiles }),
      });

      const data = await safeJsonParse(res);

      setUploadMessage({ text: data.message || `Uploaded ${data.count} accounts`, type: 'success' });
      onRefresh();
    } catch (err: any) {
      setUploadMessage({ text: err.message || 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteSubmit = async () => {
    if (!rawJsonText.trim()) return;
    setUploading(true);
    setUploadMessage(null);
    try {
      const json = JSON.parse(rawJsonText);
      const res = await apiFetch('/api/accounts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawJson: json }),
      });
      const data = await safeJsonParse(res);

      setUploadMessage({ text: data.message || 'Account registered successfully', type: 'success' });
      setRawJsonText('');
      setPasteMode(false);
      onRefresh();
    } catch (err: any) {
      setUploadMessage({ text: 'Invalid JSON: ' + err.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const toggleAccount = async (id: string) => {
    try {
      const res = await apiFetch(`/api/accounts/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const testAccount = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await apiFetch(`/api/accounts/${id}/test`, { method: 'POST' });
      const data = await safeJsonParse(res);
      setTestResult({
        id,
        success: data.success,
        message: data.message,
        details: data.details,
      });
    } catch (err: any) {
      setTestResult({
        id,
        success: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  const resetQuota = async (id: string) => {
    try {
      const res = await apiFetch(`/api/accounts/${id}/reset-quota`, { method: 'POST' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to remove this service account?')) return;
    try {
      const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (acc: ServiceAccount) => {
    setEditingAccount(acc);
    setEditProjectName(acc.project_name);
    setEditJsonText('');
    setEditMessage(null);
  };

  const handleEditReuploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReuploadFileLoading(true);
    setEditMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setEditJsonText(JSON.stringify(json, null, 2));
      if (json.project_id) setEditProjectName(json.project_id);
      setEditMessage({ text: `File "${file.name}" loaded ready to save.`, type: 'success' });
    } catch (err: any) {
      setEditMessage({ text: 'Invalid JSON file: ' + err.message, type: 'error' });
    } finally {
      setReuploadFileLoading(false);
    }
  };

  const handleSaveAccountEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setReuploadFileLoading(true);
    setEditMessage(null);

    try {
      let payload: any = { project_name: editProjectName.trim() };
      if (editJsonText.trim()) {
        payload.rawJson = editJsonText.trim();
      }

      const res = await apiFetch(`/api/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await safeJsonParse(res);

      setEditMessage({ text: 'Account updated successfully!', type: 'success' });
      setTimeout(() => {
        setEditingAccount(null);
        onRefresh();
      }, 900);
    } catch (err: any) {
      setEditMessage({ text: err.message, type: 'error' });
    } finally {
      setReuploadFileLoading(false);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            Connected Service Accounts ({accounts.length})
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage attached JSON keys, edit project names, reupload credentials, and monitor daily quotas.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setPasteMode(!pasteMode)}
            className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 transition-colors cursor-pointer"
          >
            {pasteMode ? 'Upload File' : 'Paste Raw JSON'}
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh accounts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Upload Box */}
      {!pasteMode ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) {
              handleFiles(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer mb-6 ${
            dragOver
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            accept=".json,application/json"
            multiple
            className="hidden"
          />
          <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto mb-3 text-emerald-400">
            {uploading ? (
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <p className="text-sm font-semibold text-white">
            {uploading ? 'Processing JSON keys...' : 'Drop Google Cloud service account .json file(s) here'}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Drag and drop single or multiple keys, or click to browse. Automatically extracts project_id & credentials.
          </p>
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
          <label className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
            <FileJson className="w-4 h-4 text-emerald-400" />
            Paste Service Account JSON Object:
          </label>
          <textarea
            value={rawJsonText}
            onChange={(e) => setRawJsonText(e.target.value)}
            rows={5}
            placeholder={`{\n  "type": "service_account",\n  "project_id": "seo-automation-503206",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",\n  "client_email": "seo-automation@seo-automation-503206.iam.gserviceaccount.com"\n}`}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs font-mono text-emerald-300 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPasteMode(false)}
              className="px-3 py-1.5 rounded-xl bg-neutral-800 text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handlePasteSubmit}
              disabled={uploading || !rawJsonText.trim()}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {uploading ? 'Validating...' : 'Register Account'}
            </button>
          </div>
        </div>
      )}

      {/* Upload Feedback */}
      {uploadMessage && (
        <div
          className={`mb-6 p-3 rounded-xl text-xs flex items-center gap-2 ${
            uploadMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {uploadMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{uploadMessage.text}</span>
        </div>
      )}

      {/* Test Result Banner */}
      {testResult && (
        <div
          className={`mb-6 p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
            testResult.success
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
          }`}
        >
          {testResult.success ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold">{testResult.success ? 'Google Authentication Verified' : 'Action Required in Google Cloud'}</p>
            <p className="text-[11px] opacity-90 mt-0.5 font-mono">{testResult.message}</p>
            {testResult.details?.enableUrl && (
              <a
                href={testResult.details.enableUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow-md transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Enable Web Search Indexing API in Google Cloud
              </a>
            )}
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-neutral-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <div className="p-8 text-center border border-neutral-800/80 rounded-2xl bg-neutral-950/40">
          <Key className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-neutral-300">No service accounts registered yet</p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4">
            Upload your Google Cloud service account JSON keys above to begin indexing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => {
            const used = acc.daily_count || 0;
            const limit = 200;
            const remaining = Math.max(0, limit - used);
            const percent = Math.min(100, Math.round((used / limit) * 100));
            const isExhausted = used >= limit;

            return (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border transition-all ${
                  acc.is_active
                    ? isExhausted
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    : 'bg-neutral-950/30 border-neutral-800/40 opacity-60'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-white font-mono">
                        {acc.project_name}
                      </span>
                      {acc.has_credentials && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <FileCheck className="w-3 h-3" />
                          Key Attached
                        </span>
                      )}
                      {isExhausted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Quota Exhausted ({used}/{limit})
                        </span>
                      )}
                      {!acc.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-neutral-800 text-neutral-400">
                          Paused
                        </span>
                      )}
                    </div>

                    {/* Email with copy */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-neutral-400 font-mono truncate max-w-sm">
                        {acc.client_email}
                      </span>
                      <button
                        onClick={() => copyEmail(acc.client_email)}
                        className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors cursor-pointer"
                        title="Copy Service Account Email (Add as Owner in Google Search Console)"
                      >
                        {copiedEmail === acc.client_email ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className="w-full md:w-52">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-neutral-400">Daily Quota:</span>
                      <span className="font-mono text-neutral-200">
                        <strong className={isExhausted ? 'text-amber-400' : 'text-emerald-400'}>
                          {used}
                        </strong>
                        <span className="text-neutral-500"> / {limit} ({remaining} left)</span>
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isExhausted
                            ? 'bg-amber-400'
                            : percent > 75
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end md:self-auto flex-wrap">
                    {/* Edit / Reupload Key */}
                    <button
                      onClick={() => openEditModal(acc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors cursor-pointer"
                      title="Edit project name or reupload/replace JSON key"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Edit Key</span>
                    </button>

                    {/* Test Button */}
                    <button
                      onClick={() => testAccount(acc.id)}
                      disabled={testingId === acc.id}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      title="Test Google Indexing API JWT authorization"
                    >
                      {testingId === acc.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>

                    {/* Reset Quota */}
                    <button
                      onClick={() => resetQuota(acc.id)}
                      className="px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors cursor-pointer"
                      title="Reset daily usage counter back to 0"
                    >
                      Reset
                    </button>

                    {/* Active Toggle */}
                    <button
                      onClick={() => toggleAccount(acc.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        acc.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                      }`}
                      title={acc.is_active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {acc.is_active ? 'Active' : 'Paused'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteAccount(acc.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Reupload Key Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-cyan-400" />
                Manage & Reupload Service Account Key
              </h3>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-neutral-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccountEdit} className="space-y-4 text-xs">
              <div>
                <label className="text-neutral-400 font-semibold block mb-1">
                  Project Name / ID:
                </label>
                <input
                  type="text"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-neutral-400 font-semibold block mb-1">
                  Current Client Email:
                </label>
                <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300 font-mono text-[11px] truncate">
                  {editingAccount.client_email}
                </div>
              </div>

              {/* Reupload File input */}
              <div>
                <label className="text-neutral-400 font-semibold block mb-1">
                  Reupload / Replace with New .JSON Key File:
                </label>
                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={handleEditReuploadFile}
                  accept=".json,application/json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="w-full border border-dashed border-neutral-700 hover:border-cyan-400 rounded-xl p-3 text-center bg-neutral-950 hover:bg-cyan-500/5 transition-all text-neutral-300 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Choose Replacement .JSON Key File...</span>
                </button>
              </div>

              {/* Paste Raw Key Option */}
              <div>
                <label className="text-neutral-400 font-semibold block mb-1">
                  Or Paste New Service Account JSON Object:
                </label>
                <textarea
                  rows={4}
                  value={editJsonText}
                  onChange={(e) => setEditJsonText(e.target.value)}
                  placeholder="Paste replacement JSON key payload here to update private_key or email..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-[11px] font-mono text-emerald-300 outline-none focus:border-cyan-500"
                />
              </div>

              {editMessage && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    editMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {editMessage.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{editMessage.text}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reuploadFileLoading}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {reuploadFileLoading ? 'Saving...' : 'Save & Update Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Helpful Search Console Reminder Box */}
      <div className="mt-6 p-4 rounded-xl bg-neutral-950/70 border border-neutral-800/80 flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-neutral-200">Where Does Google Index Your Links?</strong>
          <span className="block mt-0.5">
            Your service account email (<code>seo-automation@seo-automation-503206.iam.gserviceaccount.com</code>) pushes requests directly to the <strong>Google Indexing API</strong>. Once Googlebot crawls the page, it reflects in the global Google Search index!
            Make sure this email is added as an <strong>Owner</strong> in Google Search Console for your website property (e.g. <code>https://yourwebsite.com/</code>).
          </span>
        </div>
      </div>
    </div>
  );
};
