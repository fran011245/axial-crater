# Apply Migrations to bfxterminal Project

**Issue**: The MCP Supabase is currently connected to a different project. We need to manually apply the migrations to the **bfxterminal** project.

## Step 1: Access bfxterminal Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Francisco's project** → **bfxterminal**
3. Go to **SQL Editor** (left sidebar)

## Step 2: Apply Migrations in Order

Copy and paste each migration file **one at a time** in the SQL Editor, then click **Run**.

### Migration 1: Create Snapshot Tables

Copy the entire contents of `supabase/migrations/001_create_snapshot_tables.sql` and run it.

**Expected Result**: Creates `volume_snapshots`, `funding_snapshots`, `wallet_snapshots` tables.

### Migration 2: Create Normalized Tables

Copy the entire contents of `supabase/migrations/002_create_normalized_tables.sql` and run it.

**Expected Result**: Creates `trading_pairs`, `trading_pair_snapshots`, `funding_rates`, `wallet_token_snapshots` tables.

### Migration 3: Create Aggregation Tables

Copy the entire contents of `supabase/migrations/003_create_aggregation_tables.sql` and run it.

**Expected Result**: Creates `daily_aggregations`, `hourly_aggregations`, `trend_metrics` tables.

### Migration 4: Create Column Suggestions Table

Copy the entire contents of `supabase/migrations/004_create_column_suggestions.sql` and run it.

**Expected Result**: Creates `column_suggestions` table and `update_updated_at_column()` function.

### Migration 5: Create Aggregation Functions

Copy the entire contents of `supabase/migrations/005_create_aggregation_functions.sql` and run it.

**Expected Result**: Creates `calculate_daily_aggregation()` and `calculate_trend_metric()` functions.

## Step 3: Verify Tables Were Created

1. Go to **Table Editor** in Supabase Dashboard
2. You should see these tables:
   - ✅ `volume_snapshots`
   - ✅ `funding_snapshots`
   - ✅ `wallet_snapshots`
   - ✅ `trading_pairs`
   - ✅ `trading_pair_snapshots`
   - ✅ `funding_rates`
   - ✅ `wallet_token_snapshots`
   - ✅ `daily_aggregations`
   - ✅ `hourly_aggregations`
   - ✅ `trend_metrics`
   - ✅ `column_suggestions`

## Step 4: Verify Functions Were Created

1. Go to **Database** → **Functions** in Supabase Dashboard
2. You should see:
   - ✅ `calculate_daily_aggregation`
   - ✅ `calculate_trend_metric`
   - ✅ `update_updated_at_column`

## Step 5: Update Environment Variables

After migrations are applied, update your `.env.local`:

```bash
# Get these from bfxterminal project: Settings → API
SUPABASE_URL=https://[bfxterminal-project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[bfxterminal-service-role-key]
```

## Troubleshooting

### Error: "relation already exists"
- Some tables might already exist. The migrations use `CREATE TABLE IF NOT EXISTS`, so this is safe to ignore.

### Error: "policy already exists"
- Some RLS policies might already exist. The migrations use `CREATE POLICY IF NOT EXISTS`, but if you get this error, you can safely continue.

### Error: "function already exists"
- The functions use `CREATE OR REPLACE FUNCTION`, so this should not cause issues. If you see this, the function will be updated.

## Quick Copy-Paste Method

If you prefer, you can combine all migrations into one SQL script:

1. Open all 5 migration files
2. Copy them in order (001 → 002 → 003 → 004 → 005)
3. Paste into SQL Editor
4. Click **Run**

The migrations are designed to be idempotent (safe to run multiple times).

## Next Steps

Once migrations are applied:
1. ✅ Update `.env.local` with bfxterminal credentials
2. ✅ Restart development server
3. ✅ Test column suggestions API
4. ✅ Test snapshot API

