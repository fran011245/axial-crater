-- ============================================
-- ALL MIGRATIONS COMBINED FOR BFXTERMINAL
-- ============================================
-- Copy and paste this entire file into Supabase SQL Editor
-- Project: Francisco's project > bfxterminal
-- ============================================

-- ============================================
-- MIGRATION 1: Create Snapshot Tables
-- ============================================

-- Volume Snapshots Table
CREATE TABLE IF NOT EXISTS public.volume_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_volume_usd NUMERIC,
    ticker_count INTEGER,
    top_pairs JSONB,
    low_pairs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funding Snapshots Table
CREATE TABLE IF NOT EXISTS public.funding_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    funding_stats JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet Snapshots Table
CREATE TABLE IF NOT EXISTS public.wallet_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    wallet_address TEXT NOT NULL,
    pending_tx_count INTEGER,
    tokens JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_volume_snapshots_timestamp ON public.volume_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_funding_snapshots_timestamp ON public.funding_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_snapshots_timestamp ON public.wallet_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_snapshots_address ON public.wallet_snapshots(wallet_address);

-- Enable Row Level Security
ALTER TABLE public.volume_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_snapshots ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: Public read access, service_role write access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'volume_snapshots' AND policyname = 'Public read access for volume_snapshots') THEN
        CREATE POLICY "Public read access for volume_snapshots" 
            ON public.volume_snapshots FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'funding_snapshots' AND policyname = 'Public read access for funding_snapshots') THEN
        CREATE POLICY "Public read access for funding_snapshots" 
            ON public.funding_snapshots FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_snapshots' AND policyname = 'Public read access for wallet_snapshots') THEN
        CREATE POLICY "Public read access for wallet_snapshots" 
            ON public.wallet_snapshots FOR SELECT 
            USING (true);
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.volume_snapshots TO anon, authenticated;
GRANT ALL ON public.volume_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE volume_snapshots_id_seq TO service_role;

GRANT SELECT ON public.funding_snapshots TO anon, authenticated;
GRANT ALL ON public.funding_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE funding_snapshots_id_seq TO service_role;

GRANT SELECT ON public.wallet_snapshots TO anon, authenticated;
GRANT ALL ON public.wallet_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE wallet_snapshots_id_seq TO service_role;

-- ============================================
-- MIGRATION 2: Create Normalized Tables
-- ============================================

-- Trading Pairs Catalog
CREATE TABLE IF NOT EXISTS public.trading_pairs (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    base_currency TEXT,
    quote_currency TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.trading_pairs IS 'Catalog of all trading pairs seen in the exchange';

-- Trading Pair Snapshots (Normalized)
CREATE TABLE IF NOT EXISTS public.trading_pair_snapshots (
    id BIGSERIAL PRIMARY KEY,
    trading_pair_id BIGINT NOT NULL REFERENCES public.trading_pairs(id) ON DELETE CASCADE,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    last_price NUMERIC,
    daily_change_percent NUMERIC,
    volume_24h_usd NUMERIC,
    volume_7d_usd NUMERIC,
    volume_30d_usd NUMERIC,
    spread_percent NUMERIC,
    bid_price NUMERIC,
    ask_price NUMERIC,
    deposit_status TEXT CHECK (deposit_status IN ('OK', 'CLSD', 'NA')),
    withdrawal_status TEXT CHECK (withdrawal_status IN ('OK', 'CLSD', 'NA')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.trading_pair_snapshots IS 'Normalized snapshots of trading pair metrics at specific timestamps';

-- Funding Rates (Normalized)
CREATE TABLE IF NOT EXISTS public.funding_rates (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    apr_1h NUMERIC,
    volume_24h NUMERIC,
    frr NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.funding_rates IS 'Normalized funding rate snapshots';

-- Wallet Token Snapshots (Normalized)
CREATE TABLE IF NOT EXISTS public.wallet_token_snapshots (
    id BIGSERIAL PRIMARY KEY,
    token_symbol TEXT NOT NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    in_volume NUMERIC,
    in_volume_usd NUMERIC,
    out_volume NUMERIC,
    out_volume_usd NUMERIC,
    net_volume_usd NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.wallet_token_snapshots IS 'Normalized wallet token flow snapshots';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trading_pairs_symbol ON public.trading_pairs(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_pairs_active ON public.trading_pairs(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_trading_pair_snapshots_pair_id ON public.trading_pair_snapshots(trading_pair_id);
CREATE INDEX IF NOT EXISTS idx_trading_pair_snapshots_timestamp ON public.trading_pair_snapshots(snapshot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trading_pair_snapshots_pair_timestamp ON public.trading_pair_snapshots(trading_pair_id, snapshot_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_funding_rates_symbol ON public.funding_rates(symbol);
CREATE INDEX IF NOT EXISTS idx_funding_rates_timestamp ON public.funding_rates(snapshot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_funding_rates_symbol_timestamp ON public.funding_rates(symbol, snapshot_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_token_snapshots_symbol ON public.wallet_token_snapshots(token_symbol);
CREATE INDEX IF NOT EXISTS idx_wallet_token_snapshots_timestamp ON public.wallet_token_snapshots(snapshot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_token_snapshots_symbol_timestamp ON public.wallet_token_snapshots(token_symbol, snapshot_timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.trading_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_pair_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_token_snapshots ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: Public read access, service_role write access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trading_pairs' AND policyname = 'Public read access for trading_pairs') THEN
        CREATE POLICY "Public read access for trading_pairs" 
            ON public.trading_pairs FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trading_pair_snapshots' AND policyname = 'Public read access for trading_pair_snapshots') THEN
        CREATE POLICY "Public read access for trading_pair_snapshots" 
            ON public.trading_pair_snapshots FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'funding_rates' AND policyname = 'Public read access for funding_rates') THEN
        CREATE POLICY "Public read access for funding_rates" 
            ON public.funding_rates FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_token_snapshots' AND policyname = 'Public read access for wallet_token_snapshots') THEN
        CREATE POLICY "Public read access for wallet_token_snapshots" 
            ON public.wallet_token_snapshots FOR SELECT 
            USING (true);
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.trading_pairs TO anon, authenticated;
GRANT ALL ON public.trading_pairs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trading_pairs_id_seq TO service_role;

GRANT SELECT ON public.trading_pair_snapshots TO anon, authenticated;
GRANT ALL ON public.trading_pair_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trading_pair_snapshots_id_seq TO service_role;

GRANT SELECT ON public.funding_rates TO anon, authenticated;
GRANT ALL ON public.funding_rates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE funding_rates_id_seq TO service_role;

GRANT SELECT ON public.wallet_token_snapshots TO anon, authenticated;
GRANT ALL ON public.wallet_token_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE wallet_token_snapshots_id_seq TO service_role;

-- ============================================
-- MIGRATION 3: Create Aggregation Tables
-- ============================================

-- Daily Aggregations
CREATE TABLE IF NOT EXISTS public.daily_aggregations (
    id BIGSERIAL PRIMARY KEY,
    aggregation_date DATE NOT NULL UNIQUE,
    total_volume_usd NUMERIC,
    active_pairs_count INTEGER,
    avg_spread_percent NUMERIC,
    top_pair_symbol TEXT,
    top_pair_volume_usd NUMERIC,
    total_funding_volume NUMERIC,
    wallet_pending_tx_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.daily_aggregations IS 'Daily aggregated metrics for the entire exchange';

-- Hourly Aggregations
CREATE TABLE IF NOT EXISTS public.hourly_aggregations (
    id BIGSERIAL PRIMARY KEY,
    aggregation_hour TIMESTAMPTZ NOT NULL UNIQUE,
    total_volume_usd NUMERIC,
    active_pairs_count INTEGER,
    avg_spread_percent NUMERIC,
    top_pair_symbol TEXT,
    top_pair_volume_usd NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.hourly_aggregations IS 'Hourly aggregated metrics for intraday pattern analysis';

-- Trend Metrics
CREATE TABLE IF NOT EXISTS public.trend_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_type TEXT NOT NULL,
    symbol TEXT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    current_value NUMERIC,
    previous_value NUMERIC,
    change_percent NUMERIC,
    trend_direction TEXT CHECK (trend_direction IN ('up', 'down', 'stable')),
    volatility NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.trend_metrics IS 'Calculated trend metrics comparing current vs previous periods';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_aggregations_date ON public.daily_aggregations(aggregation_date DESC);
CREATE INDEX IF NOT EXISTS idx_hourly_aggregations_hour ON public.hourly_aggregations(aggregation_hour DESC);
CREATE INDEX IF NOT EXISTS idx_trend_metrics_type ON public.trend_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_trend_metrics_symbol ON public.trend_metrics(symbol);
CREATE INDEX IF NOT EXISTS idx_trend_metrics_period ON public.trend_metrics(period_start, period_end);

-- Enable Row Level Security
ALTER TABLE public.daily_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: Public read access, service_role write access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_aggregations' AND policyname = 'Public read access for daily_aggregations') THEN
        CREATE POLICY "Public read access for daily_aggregations" 
            ON public.daily_aggregations FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hourly_aggregations' AND policyname = 'Public read access for hourly_aggregations') THEN
        CREATE POLICY "Public read access for hourly_aggregations" 
            ON public.hourly_aggregations FOR SELECT 
            USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trend_metrics' AND policyname = 'Public read access for trend_metrics') THEN
        CREATE POLICY "Public read access for trend_metrics" 
            ON public.trend_metrics FOR SELECT 
            USING (true);
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.daily_aggregations TO anon, authenticated;
GRANT ALL ON public.daily_aggregations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE daily_aggregations_id_seq TO service_role;

GRANT SELECT ON public.hourly_aggregations TO anon, authenticated;
GRANT ALL ON public.hourly_aggregations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE hourly_aggregations_id_seq TO service_role;

GRANT SELECT ON public.trend_metrics TO anon, authenticated;
GRANT ALL ON public.trend_metrics TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trend_metrics_id_seq TO service_role;

-- ============================================
-- MIGRATION 4: Create Column Suggestions Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.column_suggestions (
    id BIGSERIAL PRIMARY KEY,
    column_name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_ip TEXT,
    metadata JSONB
);

COMMENT ON TABLE public.column_suggestions IS 'Stores user suggestions for new columns/stats in the Market Scanner';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_column_suggestions_status ON public.column_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_column_suggestions_created_at ON public.column_suggestions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.column_suggestions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: Public read access, service_role write access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'column_suggestions' AND policyname = 'Public read access for column_suggestions') THEN
        CREATE POLICY "Public read access for column_suggestions" 
            ON public.column_suggestions FOR SELECT 
            USING (true);
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.column_suggestions TO anon, authenticated;
GRANT ALL ON public.column_suggestions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE column_suggestions_id_seq TO service_role;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_column_suggestions_updated_at ON public.column_suggestions;
CREATE TRIGGER update_column_suggestions_updated_at
    BEFORE UPDATE ON public.column_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION 5: Create Aggregation Functions
-- ============================================

-- Function to calculate daily aggregation
CREATE OR REPLACE FUNCTION calculate_daily_aggregation(target_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
    daily_vol NUMERIC;
    daily_pairs INTEGER;
    daily_avg_spread NUMERIC;
    top_symbol TEXT;
    top_vol NUMERIC;
    funding_vol NUMERIC;
    wallet_pending INTEGER;
BEGIN
    -- Calculate metrics from trading_pair_snapshots for the target date
    SELECT 
        COALESCE(SUM(volume_24h_usd), 0),
        COUNT(DISTINCT trading_pair_id),
        COALESCE(AVG(spread_percent), 0)
    INTO daily_vol, daily_pairs, daily_avg_spread
    FROM public.trading_pair_snapshots
    WHERE DATE(snapshot_timestamp) = target_date;

    -- Get top pair for the day
    SELECT 
        tp.symbol,
        MAX(tps.volume_24h_usd)
    INTO top_symbol, top_vol
    FROM public.trading_pair_snapshots tps
    JOIN public.trading_pairs tp ON tp.id = tps.trading_pair_id
    WHERE DATE(tps.snapshot_timestamp) = target_date
    GROUP BY tp.symbol
    ORDER BY MAX(tps.volume_24h_usd) DESC
    LIMIT 1;

    -- Get funding volume from funding_rates
    SELECT COALESCE(SUM(volume_24h), 0)
    INTO funding_vol
    FROM public.funding_rates
    WHERE DATE(snapshot_timestamp) = target_date;

    -- Get wallet pending count (most recent snapshot of the day)
    SELECT pending_tx_count
    INTO wallet_pending
    FROM public.wallet_snapshots
    WHERE DATE(timestamp) = target_date
    ORDER BY timestamp DESC
    LIMIT 1;

    -- Insert or update daily aggregation
    INSERT INTO public.daily_aggregations (
        aggregation_date,
        total_volume_usd,
        active_pairs_count,
        avg_spread_percent,
        top_pair_symbol,
        top_pair_volume_usd,
        total_funding_volume,
        wallet_pending_tx_count
    ) VALUES (
        target_date,
        daily_vol,
        daily_pairs,
        daily_avg_spread,
        top_symbol,
        top_vol,
        funding_vol,
        wallet_pending
    )
    ON CONFLICT (aggregation_date) 
    DO UPDATE SET
        total_volume_usd = EXCLUDED.total_volume_usd,
        active_pairs_count = EXCLUDED.active_pairs_count,
        avg_spread_percent = EXCLUDED.avg_spread_percent,
        top_pair_symbol = EXCLUDED.top_pair_symbol,
        top_pair_volume_usd = EXCLUDED.top_pair_volume_usd,
        total_funding_volume = EXCLUDED.total_funding_volume,
        wallet_pending_tx_count = EXCLUDED.wallet_pending_tx_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate trend metric
CREATE OR REPLACE FUNCTION calculate_trend_metric(
    p_metric_type TEXT,
    p_symbol TEXT DEFAULT NULL,
    p_period_hours INTEGER DEFAULT 24
)
RETURNS VOID AS $$
DECLARE
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
    current_val NUMERIC;
    previous_val NUMERIC;
    change_pct NUMERIC;
    trend_dir TEXT;
    vol NUMERIC;
BEGIN
    period_end := NOW();
    period_start := period_end - (p_period_hours || ' hours')::INTERVAL;

    -- Calculate current value based on metric type
    IF p_metric_type = 'volume_24h' THEN
        SELECT COALESCE(SUM(volume_24h_usd), 0)
        INTO current_val
        FROM public.trading_pair_snapshots
        WHERE snapshot_timestamp >= period_start
        AND snapshot_timestamp < period_end
        AND (p_symbol IS NULL OR trading_pair_id IN (SELECT id FROM public.trading_pairs WHERE symbol = p_symbol));

        -- Previous period
        SELECT COALESCE(SUM(volume_24h_usd), 0)
        INTO previous_val
        FROM public.trading_pair_snapshots
        WHERE snapshot_timestamp >= (period_start - (p_period_hours || ' hours')::INTERVAL)
        AND snapshot_timestamp < period_start
        AND (p_symbol IS NULL OR trading_pair_id IN (SELECT id FROM public.trading_pairs WHERE symbol = p_symbol));
    END IF;

    -- Calculate change percentage
    IF previous_val > 0 THEN
        change_pct := ((current_val - previous_val) / previous_val) * 100;
    ELSE
        change_pct := NULL;
    END IF;

    -- Determine trend direction
    IF change_pct > 5 THEN
        trend_dir := 'up';
    ELSIF change_pct < -5 THEN
        trend_dir := 'down';
    ELSE
        trend_dir := 'stable';
    END IF;

    -- Calculate volatility (standard deviation)
    SELECT COALESCE(STDDEV(volume_24h_usd), 0)
    INTO vol
    FROM public.trading_pair_snapshots
    WHERE snapshot_timestamp >= period_start
    AND snapshot_timestamp < period_end
    AND (p_symbol IS NULL OR trading_pair_id IN (SELECT id FROM public.trading_pairs WHERE symbol = p_symbol));

    -- Insert trend metric
    INSERT INTO public.trend_metrics (
        metric_type,
        symbol,
        period_start,
        period_end,
        current_value,
        previous_value,
        change_percent,
        trend_direction,
        volatility
    ) VALUES (
        p_metric_type,
        p_symbol,
        period_start,
        period_end,
        current_val,
        previous_val,
        change_pct,
        trend_dir,
        vol
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_daily_aggregation(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_trend_metric(TEXT, TEXT, INTEGER) TO service_role;

-- ============================================
-- MIGRATIONS COMPLETE
-- ============================================
-- All tables, indexes, RLS policies, and functions have been created.
-- Verify in Supabase Dashboard → Table Editor and Database → Functions
-- ============================================

