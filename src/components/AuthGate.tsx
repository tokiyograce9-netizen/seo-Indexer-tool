import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Mail,
  Linkedin,
  Instagram,
  Download,
  X,
  Smartphone,
} from 'lucide-react';

import { safeJsonParse } from '../lib/api';

interface AuthGateProps {
  onAuthenticated: () => void;
  lockNotice?: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated, lockNotice }) => {
  const [step, setStep] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if dismissed previously this session
    const dismissed = sessionStorage.getItem('seo_install_banner_dismissed');
    if (dismissed === 'true') {
      setShowInstallBanner(false);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback instructions for iOS / desktop
      alert(
        'To install SEO INDEXER:\n\n• On iPhone/iPad: Tap Share (square with arrow) -> "Add to Home Screen".\n• On Chrome/Edge Desktop: Click the Install icon in the address bar (top right).\n• On Android: Tap Menu (three dots) -> "Install app" or "Add to Home screen".'
      );
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('seo_install_banner_dismissed', 'true');
  };

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
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await safeJsonParse(res);

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
      setError('Please enter your 10-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, otp: otp.trim() }),
      });
      const data = await safeJsonParse(res);

      if (data.token) {
        // Store in sessionStorage so closing or refreshing tab strictly locks session
        sessionStorage.setItem('seo_indexer_token', data.token);
        localStorage.setItem('seo_indexer_token', data.token);
      }

      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 my-auto">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl mb-4 group transition-all">
            <ShieldCheck className="w-7 h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            SEO INDEXER <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">PRO</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Google URL Indexer & Multi-Account Rotation Engine
          </p>
        </div>

        {/* Authentication Card */}
        <div className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          {lockNotice && !error && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{lockNotice}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'PASSWORD' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  Admin Access Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    autoFocus
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                  10-Digit OTP Code
                </label>

                <div className="relative">
                  <input
                    type="password"
                    maxLength={10}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••••••"
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

          {/* Developer Credits Section */}
          <div className="mt-6 pt-5 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-neutral-400 font-medium">Developed by Shashank Rajput</span>
            <div className="flex items-center gap-3">
              {/* Instagram with icon only */}
              <a
                href="https://www.instagram.com/shashankrajput.__/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-pink-400 hover:text-pink-300 transition-colors"
                title="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>

              {/* Gmail direct compose redirect */}
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=aws.shashanksingh@gmail.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Gmail"
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-red-400 hover:text-red-300 transition-colors"
                title="Send Email via Gmail"
              >
                <Mail className="w-4 h-4" />
              </a>

              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/shashankrajputx/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sky-400 hover:text-sky-300 transition-colors"
                title="LinkedIn Profile"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Small Bottom Popup for Downloading as App / PWA */}
      {showInstallBanner && !installed && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40 animate-fadeIn">
          <div className="p-3.5 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-2xl shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">Install Web App</p>
                <p className="text-[11px] text-neutral-400 truncate">Add SEO INDEXER to home screen / desktop</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                type="button"
                onClick={handleDismissInstall}
                className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Cancel"
                aria-label="Dismiss app install banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
