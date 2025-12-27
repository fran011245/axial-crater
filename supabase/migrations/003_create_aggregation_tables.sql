-- Migration: Create aggregation tables for pre-calculated metrics
-- These tables store aggregated data for efficient querying

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
CREATE POLICY IF NOT EXISTS "Public read access for daily_aggregations" 
    ON public.daily_aggregations FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for hourly_aggregations" 
    ON public.hourly_aggregations FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for trend_metrics" 
    ON public.trend_metrics FOR SELECT 
    USING (true);

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

