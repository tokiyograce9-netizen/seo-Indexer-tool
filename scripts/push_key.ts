import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KEY_FILE = path.resolve(process.cwd(), 'data', 'credentials_e1123b8b.json');
const bootstrapId = '50320600-0000-4000-8000-000000503206';

async function run() {
  try {
    if (!fs.existsSync(KEY_FILE)) {
      console.error('Key file not found at:', KEY_FILE);
      process.exit(1);
    }

    const keyData = JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
    const today = new Date().toISOString().split('T')[0];

    console.log(`Pushing key for project: ${keyData.project_id} to Supabase...`);

    const { error } = await supabase.from('service_accounts').upsert({
      id: bootstrapId,
      project_name: keyData.project_id,
      client_email: keyData.client_email,
      credentials: keyData,
      daily_count: 0,
      last_reset_date: today,
      is_active: true,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Error pushing key to Supabase:', error.message);
      process.exit(1);
    }

    console.log('Successfully pushed key to Supabase!');
    
    // Verify it is there
    const { data, error: fetchError } = await supabase
      .from('service_accounts')
      .select('id, project_name, client_email')
      .eq('id', bootstrapId)
      .single();
      
    if (fetchError) {
       console.error('Verification fetch failed:', fetchError.message);
    } else {
       console.log('Verified account in Supabase:', data);
    }

  } catch (err: any) {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  }
}

run();
