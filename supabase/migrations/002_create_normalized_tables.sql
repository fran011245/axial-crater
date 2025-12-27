-- Migration: Create normalized tables for efficient querying and analysis
-- These tables store structured data instead of JSONB for better performance

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
CREATE POLICY IF NOT EXISTS "Public read access for trading_pairs" 
    ON public.trading_pairs FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for trading_pair_snapshots" 
    ON public.trading_pair_snapshots FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for funding_rates" 
    ON public.funding_rates FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for wallet_token_snapshots" 
    ON public.wallet_token_snapshots FOR SELECT 
    USING (true);

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

