-- Migration: Create SQL functions for calculating aggregations
-- These functions are called automatically when snapshots are saved

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

