-- Strategy directives table for /fr3-strategy-optimizer skill
-- Stores prescriptive strategy rules that feed into tip generation

CREATE TABLE IF NOT EXISTS strategy_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directive_type TEXT NOT NULL CHECK (directive_type IN (
        'avoid_prediction_type', 'prefer_prediction_type',
        'avoid_league', 'prefer_league',
        'adjust_confidence_band', 'adjust_odds_range',
        'adjust_edge_threshold', 'general_strategy'
    )),
    directive_text TEXT NOT NULL,
    parameters JSONB,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    impact_estimate TEXT NOT NULL CHECK (impact_estimate IN ('HIGH', 'MEDIUM', 'LOW')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    applied_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
-- Only partial index on is_active needed — directive_type (8 values) and impact_estimate
-- (3 values) are too low-cardinality to benefit from standalone indexes on a small table.
CREATE INDEX IF NOT EXISTS idx_strategy_directives_active ON strategy_directives (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_strategy_directives_expires ON strategy_directives (expires_at) WHERE is_active = true;

-- RLS
ALTER TABLE strategy_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategy_directives_select_public"
ON strategy_directives FOR SELECT
TO public
USING (true);

CREATE POLICY "strategy_directives_service_all"
ON strategy_directives FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
