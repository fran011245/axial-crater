# Supabase Setup Guide - bfxterminal Project

This guide will help you configure Supabase for the **bfxterminal** project located in **Francisco's project > bfxterminal** on Supabase.

## Step 1: Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Francisco's project** → **bfxterminal**
3. Go to **Settings** → **API**
4. Copy the following values:
   - **Project URL**: Found under "Project URL" (e.g., `https://xxxxx.supabase.co`)
   - **Service Role Key**: Found under "Project API keys" → "service_role" key (⚠️ **Keep this secret!**)

## Step 2: Update Local Environment Variables

Edit your `.env.local` file in the project root:

```bash
# Supabase Configuration (bfxterminal project)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: If you want to use the public anon key for client-side operations
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important Notes:**
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **required** for server-side operations (snapshots, column suggestions)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are optional and only needed if you plan to use Supabase client-side
- The Service Role Key has full database access - **never commit it to git or expose it to the client**

## Step 3: Verify Database Tables

All required tables have been created via migrations:

### Snapshot Tables (JSONB format)
- ✅ `volume_snapshots` - Stores volume data snapshots
- ✅ `funding_snapshots` - Stores funding rate snapshots
- ✅ `wallet_snapshots` - Stores wallet token snapshots

### Normalized Tables (Structured format)
- ✅ `trading_pairs` - Catalog of all trading pairs
- ✅ `trading_pair_snapshots` - Normalized trading pair metrics
- ✅ `funding_rates` - Normalized funding rate data
- ✅ `wallet_token_snapshots` - Normalized wallet token flows

### Aggregation Tables
- ✅ `daily_aggregations` - Daily aggregated metrics
- ✅ `hourly_aggregations` - Hourly aggregated metrics
- ✅ `trend_metrics` - Calculated trend metrics

### Other Tables
- ✅ `column_suggestions` - User suggestions for new Market Scanner columns

### Functions
- ✅ `calculate_daily_aggregation()` - Calculates daily aggregations
- ✅ `calculate_trend_metric()` - Calculates trend metrics
- ✅ `update_updated_at_column()` - Auto-updates timestamps

## Step 4: Test the Connection

After updating your `.env.local` file, restart your development server:

```bash
npm run dev
```

Then test the snapshot API:

```bash
curl -X POST http://localhost:3000/api/snapshot \
  -H "Content-Type: application/json" \
  -H "x-snapshot-secret: your-secret-here"
```

Or test the column suggestions API:

```bash
curl -X POST http://localhost:3000/api/column-suggestions \
  -H "Content-Type: application/json" \
  -d '{"columnName": "Test Column", "description": "Test description"}'
```

## Step 5: Update Vercel Environment Variables (Production)

If deploying to Vercel, add the same environment variables:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add:
   - `SUPABASE_URL` = Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = Your service role key
   - `NEXT_PUBLIC_SUPABASE_URL` = Your Supabase project URL (if using client-side)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your anon key (if using client-side)
5. **Redeploy** your application

## Troubleshooting

### "Missing Supabase configuration" error
- Verify that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local`
- Restart your development server after updating `.env.local`
- Check that there are no typos in the variable names

### "Failed to save suggestion" error
- Verify that the `column_suggestions` table exists in your Supabase project
- Check that RLS policies are correctly set (public read, service_role write)
- Verify your Service Role Key has the correct permissions

### Tables not found
- All migrations have been applied via MCP Supabase
- You can verify tables exist by going to Supabase Dashboard → **Table Editor**
- If tables are missing, you can re-run migrations from `supabase/migrations/` directory

## Next Steps

Once configured, the application will:
1. ✅ Save snapshots to Supabase every 5 minutes (if cron job is set up)
2. ✅ Store normalized trading data for efficient querying
3. ✅ Calculate daily/hourly aggregations automatically
4. ✅ Accept column suggestions from users
5. ✅ Provide insights APIs for analytics

For more information, see:
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

