import React, { useState } from 'react';
import { KeyRound, ShieldCheck, Lock, ArrowRight, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AuthGateProps {
  onAuthenticated: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Please enter the administrator password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Password verification failed');
      }

      setChallengeId(data.challengeId);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!otp.trim() || otp.trim().length !== 10) {
      setError('Please enter the complete 10-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'OTP verification failed');
      }

      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const autofillDemoCredentials = () => {
    setPassword('admin123');
    setError(null);
  };

  const autofillDemoOtp = () => {
    setOtp('0123456789');
    setError(null);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl mb-4 group transition-all">
            <ShieldCheck className="w-7 h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            OpenIndex <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">v1.0</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Google URL Indexer & Multi-Account Rotation Engine
          </p>
        </div>

        {/* Authentication Card */}
        <div className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'PASSWORD' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    Admin Access Password
                  </label>
                  <button
                    type="button"
                    onClick={autofillDemoCredentials}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Use default (admin123)
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter ADMIN_PASSWORD..."
                    autoFocus
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 outline-none transition-all font-mono"
                  />
                </div>
                <p className="text-[11px] text-neutral-500">
                  Step 1 of 2: Master administrator authorization
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying Password...
                  </>
                ) : (
                  <>
                    Proceed to Step 2 (OTP)
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                    10-Digit OTP Code
                  </label>
                  <button
                    type="button"
                    onClick={autofillDemoOtp}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Use default OTP (0123456789)
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    maxLength={10}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="0123456789"
                    autoFocus
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-4 py-3 text-center text-lg tracking-[0.35em] text-cyan-300 font-mono placeholder-neutral-600 outline-none transition-all"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>Enter the 10-digit second factor code</span>
                  <span className="font-mono text-neutral-400">{otp.length}/10 digits</span>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setStep('PASSWORD');
                    setError(null);
                  }}
                  className="px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 10}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Validating OTP...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Unlock Dashboard
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Security Note Footer */}
          <div className="mt-6 pt-5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              2FA Gate Active
            </span>
            <span>Zero-Cost Serverless Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};
