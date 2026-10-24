import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OTP_CODE = process.env.OTP_CODE || '0123456789';

export async function POST(req: NextRequest) {
  try {
    const { step, password, otp } = await req.json();

    if (step === 'CHECK_PASSWORD') {
      if (password === ADMIN_PASSWORD) {
        return NextResponse.json({
          success: true,
          step: 'OTP_REQUIRED',
          message: 'Password verified. Enter 10-digit OTP.',
        });
      }
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
    }

    if (step === 'VERIFY_OTP') {
      if (otp === OTP_CODE) {
        const response = NextResponse.json({
          success: true,
          message: 'Access granted.',
        });
        // Set secure auth cookie
        response.cookies.set('openindex_session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
        return response;
      }
      return NextResponse.json({ error: 'Invalid 10-digit OTP' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Invalid auth request' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
