-- Migration: Create column suggestions table
-- This table stores user suggestions for new columns/stats in the Market Scanner

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
CREATE POLICY IF NOT EXISTS "Public read access for column_suggestions" 
    ON public.column_suggestions FOR SELECT 
    USING (true);

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

