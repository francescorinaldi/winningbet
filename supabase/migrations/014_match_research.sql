-- Match research table for /fr3-pre-match-research skill
-- Caches pre-match research data for reuse by tip generation analysts

CREATE TABLE IF NOT EXISTS match_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    league TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    match_date TIMESTAMPTZ NOT NULL,
    lineups JSONB,
    injuries JSONB,
    tactical_preview JSONB,
    xg_data JSONB,
    referee_data JSONB,
    weather JSONB,
    motivation JSONB,
    market_intelligence JSONB,
    research_completeness INTEGER NOT NULL CHECK (research_completeness BETWEEN 0 AND 100),
    data_sources TEXT[],
    status TEXT NOT NULL DEFAULT 'fresh',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
    CONSTRAINT match_research_unique UNIQUE (match_id, league)
);

-- Indexes
CREATE INDEX idx_match_research_match_id ON match_research (match_id);
CREATE INDEX idx_match_research_league ON match_research (league);
CREATE INDEX idx_match_research_status ON match_research (status) WHERE status = 'fresh';
CREATE INDEX idx_match_research_date ON match_research (match_date DESC);
CREATE INDEX idx_match_research_expires ON match_research (expires_at) WHERE status = 'fresh';

-- RLS
ALTER TABLE match_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_research_select_public"
ON match_research FOR SELECT
TO public
USING (true);

CREATE POLICY "match_research_service_all"
ON match_research FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
