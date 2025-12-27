-- Migration: Create feedback table
-- This table stores general user feedback from the terminal dialog

CREATE TABLE IF NOT EXISTS public.feedback (
    id BIGSERIAL PRIMARY KEY,
    feedback_type TEXT DEFAULT 'general' CHECK (feedback_type IN ('general', 'bug', 'feature', 'suggestion', 'other')),
    message TEXT NOT NULL,
    user_email TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'in_progress', 'resolved', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_ip TEXT,
    metadata JSONB
);

COMMENT ON TABLE public.feedback IS 'Stores general user feedback from the terminal application';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: Public read access, service_role write access
CREATE POLICY IF NOT EXISTS "Public read access for feedback" 
    ON public.feedback FOR SELECT 
    USING (true);

-- Grant permissions
GRANT SELECT ON public.feedback TO anon, authenticated;
GRANT ALL ON public.feedback TO service_role;
GRANT USAGE, SELECT ON SEQUENCE feedback_id_seq TO service_role;

-- Create trigger to auto-update updated_at (reuse existing function)
DROP TRIGGER IF EXISTS update_feedback_updated_at ON public.feedback;
CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

