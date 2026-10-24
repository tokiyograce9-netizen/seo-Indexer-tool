-- ==============================================================================
-- OpenIndex: Google URL Indexer Database Schema for Supabase (PostgreSQL)
-- ==============================================================================
-- Run these SQL statements in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

-- 1. Create enum for indexing status (optional, or text with check constraint)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Service Accounts Table
-- Stores Google Cloud service account JSON keys, daily usage counters, and state
CREATE TABLE IF NOT EXISTS public.service_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    credentials JSONB NOT NULL,
    daily_count INTEGER NOT NULL DEFAULT 0,
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexing for fast rotation queries
CREATE INDEX IF NOT EXISTS idx_service_accounts_active_quota 
    ON public.service_accounts (is_active, daily_count, last_reset_date);

CREATE INDEX IF NOT EXISTS idx_service_accounts_project_name 
    ON public.service_accounts (project_name);

-- 3. URL Logs Table
-- Records every single indexing request, status, HTTP response, and rotated account used
CREATE TABLE IF NOT EXISTS public.url_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    status TEXT NOT NULL, -- 'SUCCESS', 'FAILED', 'QUOTA_EXHAUSTED', 'RATE_LIMITED'
    notification_type TEXT NOT NULL DEFAULT 'URL_UPDATED', -- 'URL_UPDATED' or 'URL_DELETED'
    http_code INTEGER,
    used_account_id UUID REFERENCES public.service_accounts(id) ON DELETE SET NULL,
    used_project_name TEXT,
    response_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexing for URL logs query performance and dashboard filtering
CREATE INDEX IF NOT EXISTS idx_url_logs_created_at 
    ON public.url_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_url_logs_status 
    ON public.url_logs (status);

CREATE INDEX IF NOT EXISTS idx_url_logs_url 
    ON public.url_logs (url);

CREATE INDEX IF NOT EXISTS idx_url_logs_used_account_id 
    ON public.url_logs (used_account_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.url_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow service_role key full unrestricted access (used by Next.js / OpenIndex backend)
DROP POLICY IF EXISTS "Service role full access on service_accounts" ON public.service_accounts;
CREATE POLICY "Service role full access on service_accounts" 
    ON public.service_accounts 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on url_logs" ON public.url_logs;
CREATE POLICY "Service role full access on url_logs" 
    ON public.url_logs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- 6. Helper Function: Automatic midnight quota reset helper (can be called by pg_cron or backend)
CREATE OR REPLACE FUNCTION public.reset_daily_quotas_if_needed()
RETURNS void AS $$
BEGIN
    UPDATE public.service_accounts
    SET 
        daily_count = 0,
        last_reset_date = CURRENT_DATE,
        updated_at = timezone('utc'::text, now())
    WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Verification Query
-- SELECT * FROM public.service_accounts;
-- SELECT * FROM public.url_logs;
