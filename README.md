# OpenIndex - Google URL Indexing & Multi-Account Rotation

> Production-ready, zero-cost Google URL Indexer built with Next.js (App Router), Supabase PostgreSQL, and Vercel.

OpenIndex automates Google URL indexing at scale by rotating across unlimited Google Cloud service account JSON keys (each granting 200 requests/day). If an account encounters a `429 Too Many Requests` or quota limit, OpenIndex immediately flags it as exhausted and automatically transfers the request to the next available account.

---

## Architecture & Modules

### 1. Database Schema (Supabase PostgreSQL)
The PostgreSQL schema consists of two tables defined in `schema.sql`:
- **`service_accounts`**: Stores Google Cloud service account credentials (`jsonb`), daily usage counter, midnight reset dates, and active flags.
- **`url_logs`**: Detailed log table recording each URL request, status (`SUCCESS`, `FAILED`, `QUOTA_EXHAUSTED`), HTTP status code, and the specific account ID and project name used.

### 2. Authentication Gate
- **Step 1**: Admin password verification (`ADMIN_PASSWORD`).
- **Step 2**: 10-digit OTP challenge (`OTP_CODE`).
- Issues signed session cookies and tokens.

### 3. Service Account Uploader
- Drag-and-drop or file-input upload supporting single or batch `.json` Google Cloud key files.
- Automatically extracts `project_id`, `client_email`, and `private_key` into Supabase `jsonb`.
- Live quota visualizer (e.g. `42 / 200` requests used today).
- Individual credential testing & daily quota reset controls.

### 4. Bulk Indexing & Multi-Account Rotation Engine
- Accepts batches of up to 100 links (with duplicate removal and syntax validation).
- Choices of `URL_UPDATED` (index/re-index) or `URL_DELETED` (remove dead links).
- Connects via `google.indexing({ version: 'v3', auth })` using signed JWT tokens.
- **Automated Fallback**: Catches `429 Too Many Requests` / quota limits, marks the project as exhausted, and seamlessly shifts the URL to the next available project in real time.
- Gentle rate-pacing to avoid burst throttling.

### 5. Dashboard UI
- Modern dark-mode console built with Tailwind CSS.
- Metric cards for Service Accounts Capacity, Daily Quota Pool, and URLs Processed.
- Live Status Log Table with filtering by status, search, CSV export, and response inspection.

---

## Quick Start (Local & AI Studio)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run Dev Server**:
   ```bash
   npm run dev
   ```
   Server starts at `http://localhost:3000`.

3. **Log in**:
   - Password: `admin123` (or set `ADMIN_PASSWORD` in `.env`)
   - 10-digit OTP: `0123456789` (or set `OTP_CODE` in `.env`)

---

## 1-Click Vercel & Supabase Deployment

1. **Create Supabase Project**:
   - Create a free project at [supabase.com](https://supabase.com).
   - Go to the **SQL Editor** and run the contents of `schema.sql`.

2. **Deploy to Vercel**:
   - Push to GitHub and import into Vercel.
   - Configure Environment Variables:
     - `ADMIN_PASSWORD` = Your master admin password
     - `OTP_CODE` = Your 10-digit OTP (e.g. `0123456789`)
     - `SUPABASE_URL` = Your Supabase project URL (`https://xyz.supabase.co`)
     - `SUPABASE_SERVICE_ROLE_KEY` = Your Supabase `service_role` secret key

3. **Google Search Console Setup**:
   - For each service account uploaded, copy its `client_email`.
   - Open [Google Search Console](https://search.google.com/search-console).
   - Go to *Settings &rarr; Users and permissions*.
   - Click **Add User**, enter the service account email, and grant **Owner** permissions.
