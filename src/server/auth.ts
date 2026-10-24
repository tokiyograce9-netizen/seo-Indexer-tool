import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OTP_CODE = process.env.OTP_CODE || '0123456789';
const SESSION_SECRET = process.env.SESSION_SECRET || 'openindex-secure-session-key-2025';

// Memory store for active sessions and pending OTP attempts
const activeSessions = new Set<string>();
const pendingOtpChallenges = new Map<string, { createdAt: number }>();

function generateToken(payload: string): string {
  const hash = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${hash}`;
}

function verifyToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [encodedPayload, hash] = parts;
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    const expectedHash = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))) {
      return false;
    }
    const data = JSON.parse(payload);
    // 7 days expiration
    if (Date.now() - data.t > 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return activeSessions.has(token);
  } catch {
    return false;
  }
}

export function handleLogin(req: Request, res: Response) {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid administrator password' });
  }

  // Password verified! Generate temporary challenge token for Step 2 OTP
  const challengeId = crypto.randomUUID();
  pendingOtpChallenges.set(challengeId, { createdAt: Date.now() });

  // Clean old challenges
  for (const [id, challenge] of pendingOtpChallenges.entries()) {
    if (Date.now() - challenge.createdAt > 10 * 60 * 1000) {
      pendingOtpChallenges.delete(id);
    }
  }

  return res.json({
    success: true,
    step: 'OTP_REQUIRED',
    challengeId,
    message: 'Password accepted. Please enter your 10-digit OTP.',
    defaultOtpHint: process.env.NODE_ENV !== 'production' ? '0123456789' : undefined,
  });
}

export function handleVerifyOtp(req: Request, res: Response) {
  const { challengeId, otp } = req.body;

  if (!challengeId || !pendingOtpChallenges.has(challengeId)) {
    return res.status(400).json({ error: 'OTP session expired or invalid. Please re-enter your password.' });
  }

  const cleanOtp = String(otp || '').trim();
  if (cleanOtp !== OTP_CODE) {
    return res.status(401).json({ error: 'Invalid 10-digit OTP code. Default is 0123456789' });
  }

  // Consume challenge
  pendingOtpChallenges.delete(challengeId);

  // Generate authenticated session token
  const payload = JSON.stringify({ role: 'admin', t: Date.now(), rand: crypto.randomBytes(8).toString('hex') });
  const sessionToken = generateToken(payload);
  activeSessions.add(sessionToken);

  res.cookie('openindex_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    success: true,
    token: sessionToken,
    message: 'Authentication successful. Access granted.',
  });
}

export function handleCheckSession(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.openindex_token;

  if (token && verifyToken(token)) {
    return res.json({
      authenticated: true,
      role: 'admin',
    });
  }
  return res.json({
    authenticated: false,
  });
}

export function handleLogout(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.openindex_token;
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('openindex_token');
  return res.json({ success: true, message: 'Logged out successfully' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.openindex_token;

  if (token && verifyToken(token)) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Session invalid or expired. Please log in.',
  });
}
