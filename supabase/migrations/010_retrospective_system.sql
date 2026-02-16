-- 010_retrospective_system.sql
-- Adds retrospective learning system: reasoning persistence, post-mortems, and pattern detection.

-- 1a. New columns on tips for reasoning persistence
ALTER TABLE tips ADD COLUMN IF NOT EXISTS reasoning TEXT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS predicted_probability NUMERIC(5,2);

-- 1b. tip_retrospectives — one row per settled tip with post-mortem analysis
CREATE TABLE IF NOT EXISTS tip_retrospectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID NOT NULL REFERENCES tips(id) ON DELETE CASCADE,

    -- What actually happened
    actual_score TEXT NOT NULL,
    actual_result_category TEXT NOT NULL,
    actual_goals_total INTEGER NOT NULL,
    actual_btts BOOLEAN NOT NULL,

    -- Edge measurement
    predicted_probability NUMERIC(5,2),
    bookmaker_implied_probability NUMERIC(5,2),
    edge_at_prediction NUMERIC(5,2),

    -- Post-mortem
    outcome_surprise TEXT NOT NULL CHECK (outcome_surprise IN ('expected', 'mild_surprise', 'major_surprise')),
    what_happened TEXT NOT NULL,
    what_we_missed TEXT,
    lesson_learned TEXT,

    -- Classification for pattern detection
    error_category TEXT CHECK (error_category IN (
        'none',
        'overconfidence',
        'form_reversal',
        'injury_impact',
        'h2h_ignored',
        'motivation_miss',
        'tactical_shift',
        'goal_pattern_miss',
        'referee_factor',
        'underdog_upset',
        'draw_blindness',
        'other'
    )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tip_retrospectives_tip_id_unique UNIQUE (tip_id)
);

CREATE INDEX IF NOT EXISTS idx_tip_retrospectives_tip_id ON tip_retrospectives(tip_id);
CREATE INDEX IF NOT EXISTS idx_tip_retrospectives_error_category ON tip_retrospectives(error_category);
CREATE INDEX IF NOT EXISTS idx_tip_retrospectives_outcome_surprise ON tip_retrospectives(outcome_surprise);
CREATE INDEX IF NOT EXISTS idx_tip_retrospectives_created_at ON tip_retrospectives(created_at DESC);

-- 1c. prediction_insights — aggregate patterns detected from retrospectives
CREATE TABLE IF NOT EXISTS prediction_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    scope TEXT NOT NULL CHECK (scope IN ('global', 'league', 'prediction_type', 'context')),
    scope_value TEXT,

    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'bias_detected',
        'weak_spot',
        'strong_spot',
        'calibration_drift',
        'pattern_warning'
    )),

    insight_text TEXT NOT NULL,
    evidence JSONB NOT NULL,
    sample_size INTEGER NOT NULL,
    confidence_level NUMERIC(5,2),
    is_active BOOLEAN NOT NULL DEFAULT true,

    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prediction_insights_active ON prediction_insights(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prediction_insights_scope ON prediction_insights(scope, scope_value);
CREATE INDEX IF NOT EXISTS idx_prediction_insights_type ON prediction_insights(insight_type);

-- RLS policies for tip_retrospectives
ALTER TABLE tip_retrospectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY tip_retrospectives_select_public
    ON tip_retrospectives FOR SELECT
    TO public
    USING (true);

CREATE POLICY tip_retrospectives_service_all
    ON tip_retrospectives FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RLS policies for prediction_insights
ALTER TABLE prediction_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY prediction_insights_select_public
    ON prediction_insights FOR SELECT
    TO public
    USING (true);

CREATE POLICY prediction_insights_service_all
    ON prediction_insights FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
