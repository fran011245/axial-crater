# Supabase Cron Job Setup Guide

This guide explains how to set up a cron job in Supabase to automatically trigger the `save-snapshot` Edge Function every 5 minutes.

---

## Prerequisites

1. **Supabase CLI installed:**
   ```bash
   npm install -g supabase
   ```

2. **Logged in to Supabase:**
   ```bash
   supabase login
   ```

3. **Project linked:**
   ```bash
   supabase link --project-ref grbzolycddncbxcyjlls
   ```

---

## Step 1: Deploy the Edge Function

First, ensure your Edge Function is deployed:

```bash
cd /Users/fsimonai/axial-crater
supabase functions deploy save-snapshot
```

**Verify deployment:**
```bash
supabase functions list
```

You should see `save-snapshot` in the list.

---

## Step 2: Set Environment Secrets

The Edge Function needs these secrets:

```bash
supabase secrets set VERCEL_URL=https://axial-crater.vercel.app
supabase secrets set SNAPSHOT_SECRET=<your-snapshot-secret>
```

**Important:** Use the same `SNAPSHOT_SECRET` value as in your Vercel environment variables.

**Verify secrets:**
```bash
supabase secrets list
```

---

## Step 3: Create the Cron Job

Supabase uses `pg_cron` extension to schedule jobs. You need to run SQL commands in your Supabase SQL Editor.

### 3.1: Enable pg_cron Extension

Go to **Supabase Dashboard** → **SQL Editor** and run:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 3.2: Create the Cron Job

Run this SQL to create a cron job that triggers every 5 minutes:

```sql
-- Create cron job to trigger save-snapshot Edge Function every 5 minutes
SELECT cron.schedule(
    'save-snapshot-every-5-min',           -- Job name
    '*/5 * * * *',                         -- Cron expression (every 5 minutes)
    $$
    SELECT
      net.http_post(
          url := 'https://grbzolycddncbxcyjlls.supabase.co/functions/v1/save-snapshot',
          headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := '{}'::jsonb
      ) as request_id;
    $$
);
```

**Note:** Replace `grbzolycddncbxcyjlls` with your actual Supabase project reference if different.

---

## Step 4: Verify the Cron Job

### 4.1: List all cron jobs

```sql
SELECT * FROM cron.job;
```

You should see `save-snapshot-every-5-min` in the list.

### 4.2: Check cron job runs

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'save-snapshot-every-5-min')
ORDER BY start_time DESC
LIMIT 10;
```

This shows the last 10 runs with their status and any errors.

---

## Step 5: Monitor Edge Function Logs

To see if the Edge Function is being triggered successfully:

1. Go to **Supabase Dashboard** → **Edge Functions** → **save-snapshot**
2. Click on **Logs** tab
3. You should see logs every 5 minutes with `[Cron] Starting snapshot save...`

---

## Troubleshooting

### Cron job not running

**Check if pg_cron is enabled:**
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

**Check cron job status:**
```sql
SELECT * FROM cron.job WHERE jobname = 'save-snapshot-every-5-min';
```

**Check for errors:**
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'save-snapshot-every-5-min')
AND status = 'failed'
ORDER BY start_time DESC;
```

### Edge Function returns 401 Unauthorized

- Verify `SNAPSHOT_SECRET` is set correctly in Supabase secrets
- Verify the same secret is in Vercel environment variables
- Check Edge Function logs for error details

### Edge Function returns 429 Rate Limited

- The rate limiter allows 2 requests per 5 minutes for the snapshot endpoint
- Cron jobs should bypass rate limiting (check `isSupabaseEdgeFunction` in `rateLimit.js`)
- If still rate limited, increase the limit in `src/lib/rateLimit.js`:
  ```javascript
  snapshot: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 5, // Increase this
  },
  ```

---

## Alternative: Using Supabase Dashboard (No SQL)

If you prefer a GUI approach:

1. Go to **Supabase Dashboard** → **Database** → **Cron Jobs** (if available in your plan)
2. Click **Create a new cron job**
3. Set:
   - **Name:** `save-snapshot-every-5-min`
   - **Schedule:** `*/5 * * * *` (every 5 minutes)
   - **SQL Command:** (paste the SQL from Step 3.2)
4. Click **Create**

**Note:** Cron Jobs UI is available in Supabase Pro plans and above.

---

## Cron Expression Reference

| Expression | Description |
|------------|-------------|
| `*/5 * * * *` | Every 5 minutes |
| `*/10 * * * *` | Every 10 minutes |
| `0 * * * *` | Every hour (at minute 0) |
| `0 */2 * * *` | Every 2 hours |
| `0 0 * * *` | Every day at midnight |

---

## Cleanup (If Needed)

To remove the cron job:

```sql
SELECT cron.unschedule('save-snapshot-every-5-min');
```

To disable (but not remove):

```sql
UPDATE cron.job 
SET active = false 
WHERE jobname = 'save-snapshot-every-5-min';
```

---

## Cost Considerations

- **Edge Function invocations:** 2 million free per month (Pro plan), then $2 per million
- **At 5-minute intervals:** ~8,640 invocations/month (well within free tier)
- **Database writes:** 3 inserts per invocation = ~25,920 writes/month
- **Storage:** Depends on data retention policy (consider adding TTL)

---

## Next Steps

1. ✅ Deploy Edge Function
2. ✅ Set secrets
3. ⚠️ **Create cron job** (follow Step 3)
4. ⚠️ **Verify it's running** (follow Step 4)
5. ⚠️ **Monitor logs** (follow Step 5)

---

*Last updated: December 23, 2025*


