-- Performance snapshots table for /fr3-performance-analytics skill
-- Stores periodic track record analysis with breakdowns and recommendations

CREATE TABLE IF NOT EXISTS performance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    period_days INTEGER NOT NULL,
    total_tips INTEGER NOT NULL,
    won INTEGER NOT NULL,
    lost INTEGER NOT NULL,
    hit_rate NUMERIC(5,2) NOT NULL,
    roi_flat NUMERIC(8,2) NOT NULL,
    avg_odds NUMERIC(5,2) NOT NULL,
    league_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    prediction_type_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence_calibration JSONB NOT NULL DEFAULT '[]'::jsonb,
    odds_band_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_snapshot UNIQUE (snapshot_date, period_days)
);

-- Indexes
CREATE INDEX idx_performance_snapshots_date ON performance_snapshots (snapshot_date DESC);

-- RLS
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_snapshots_select_public"
ON performance_snapshots FOR SELECT
TO public
USING (true);

CREATE POLICY "performance_snapshots_service_all"
ON performance_snapshots FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
