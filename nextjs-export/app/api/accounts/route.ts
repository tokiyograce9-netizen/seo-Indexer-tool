import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: accounts, error } = await supabase
      .from('service_accounts')
      .select('id, project_name, client_email, daily_count, last_reset_date, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-reset midnight quotas
    const updated = [];
    for (const acc of accounts || []) {
      if (acc.last_reset_date !== today) {
        await supabase
          .from('service_accounts')
          .update({ daily_count: 0, last_reset_date: today })
          .eq('id', acc.id);
        updated.push({ ...acc, daily_count: 0, last_reset_date: today });
      } else {
        updated.push(acc);
      }
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const creds = body.credentials || body;

    const projectId = creds.project_id;
    const clientEmail = creds.client_email;
    const privateKey = creds.private_key;

    if (!projectId || !clientEmail || !privateKey) {
      return NextResponse.json(
        { error: 'Invalid Google Cloud service account JSON. Missing project_id, client_email, or private_key.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('service_accounts')
      .insert([
        {
          project_name: projectId,
          client_email: clientEmail,
          credentials: creds,
          daily_count: 0,
          last_reset_date: new Date().toISOString().split('T')[0],
          is_active: true,
        },
      ])
      .select('id, project_name, client_email, daily_count, is_active')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, account: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
