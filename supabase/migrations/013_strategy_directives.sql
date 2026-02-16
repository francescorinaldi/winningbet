-- Strategy directives table for /fr3-strategy-optimizer skill
-- Stores prescriptive strategy rules that feed into tip generation

CREATE TABLE IF NOT EXISTS strategy_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directive_type TEXT NOT NULL,
    directive_text TEXT NOT NULL,
    parameters JSONB,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    impact_estimate TEXT CHECK (impact_estimate IN ('HIGH', 'MEDIUM', 'LOW')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    applied_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_strategy_directives_active ON strategy_directives (is_active) WHERE is_active = true;
CREATE INDEX idx_strategy_directives_type ON strategy_directives (directive_type);
CREATE INDEX idx_strategy_directives_impact ON strategy_directives (impact_estimate);
CREATE INDEX idx_strategy_directives_expires ON strategy_directives (expires_at) WHERE is_active = true;

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
