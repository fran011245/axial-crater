-- Migration: Create snapshot tables (JSONB format for compatibility)
-- These tables store raw snapshot data in JSONB format

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
CREATE POLICY IF NOT EXISTS "Public read access for volume_snapshots" 
    ON public.volume_snapshots FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for funding_snapshots" 
    ON public.funding_snapshots FOR SELECT 
    USING (true);

CREATE POLICY IF NOT EXISTS "Public read access for wallet_snapshots" 
    ON public.wallet_snapshots FOR SELECT 
    USING (true);

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

