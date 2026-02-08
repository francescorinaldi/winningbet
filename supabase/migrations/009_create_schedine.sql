-- ============================================
-- WinningBet — Schedine Intelligenti
-- ============================================
-- Tabelle per la feature "Schedina Intelligente":
--   schedine      — Schedine generate dall'AI (combinazioni di tips)
--   schedina_tips — Collegamento N:M tra schedine e tips
--
-- Estensione di user_preferences con profilo di rischio:
--   risk_tolerance, weekly_budget, max_schedine_per_day
-- ============================================

-- ===================
-- SCHEDINE
-- ===================
-- Combinazioni di pronostici generate dall'AI con strategia di rischio.
-- Ogni schedina ha un livello di rischio e un importo suggerito.
CREATE TABLE IF NOT EXISTS schedine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    combined_odds NUMERIC(8,2) NOT NULL,
    suggested_stake NUMERIC(10,2) NOT NULL,
    expected_return NUMERIC(10,2) NOT NULL,
    confidence_avg INTEGER NOT NULL CHECK (confidence_avg BETWEEN 0 AND 100),
    strategy TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void')),
    match_date DATE NOT NULL,
    tier TEXT NOT NULL DEFAULT 'vip' CHECK (tier IN ('pro', 'vip')),
    budget_reference NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedine_match_date ON schedine(match_date DESC);
CREATE INDEX IF NOT EXISTS idx_schedine_status ON schedine(status);
CREATE INDEX IF NOT EXISTS idx_schedine_tier ON schedine(tier);
CREATE INDEX IF NOT EXISTS idx_schedine_risk_level ON schedine(risk_level);

-- ===================
-- SCHEDINA_TIPS
-- ===================
-- Collegamento N:M tra schedine e tips.
-- position = ordine del tip nella schedina (1, 2, 3, ...).
CREATE TABLE IF NOT EXISTS schedina_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedina_id UUID NOT NULL REFERENCES schedine(id) ON DELETE CASCADE,
    tip_id UUID NOT NULL REFERENCES tips(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    UNIQUE (schedina_id, tip_id),
    UNIQUE (schedina_id, position)
);

CREATE INDEX IF NOT EXISTS idx_schedina_tips_schedina ON schedina_tips(schedina_id);
CREATE INDEX IF NOT EXISTS idx_schedina_tips_tip ON schedina_tips(tip_id);

-- ===================
-- EXTEND USER_PREFERENCES
-- ===================
-- Aggiungi campi per il profilo di rischio.
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS risk_tolerance TEXT DEFAULT 'equilibrato'
        CHECK (risk_tolerance IN ('prudente', 'equilibrato', 'aggressivo')),
    ADD COLUMN IF NOT EXISTS weekly_budget NUMERIC(10,2) DEFAULT 50.00,
    ADD COLUMN IF NOT EXISTS max_schedine_per_day INTEGER DEFAULT 3
        CHECK (max_schedine_per_day BETWEEN 1 AND 5);

-- ===================
-- ROW-LEVEL SECURITY
-- ===================
ALTER TABLE schedine ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedina_tips ENABLE ROW LEVEL SECURITY;

-- Schedine PRO: visibili a utenti con tier pro o vip
CREATE POLICY schedine_select_pro ON schedine
    FOR SELECT USING (
        tier = 'pro'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier IN ('pro', 'vip')
        )
    );

-- Schedine VIP: visibili solo a utenti vip
CREATE POLICY schedine_select_vip ON schedine
    FOR SELECT USING (
        tier = 'vip'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier = 'vip'
        )
    );

-- Service role (backend) puo' fare tutto
CREATE POLICY schedine_service_all ON schedine
    FOR ALL TO service_role
    USING (true);

-- Schedina_tips: stesse policy delle schedine (via join)
CREATE POLICY schedina_tips_select ON schedina_tips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM schedine s
            WHERE s.id = schedina_tips.schedina_id
            AND (
                (s.tier = 'pro' AND EXISTS (
                    SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.tier IN ('pro', 'vip')
                ))
                OR
                (s.tier = 'vip' AND EXISTS (
                    SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.tier = 'vip'
                ))
            )
        )
    );

CREATE POLICY schedina_tips_service_all ON schedina_tips
    FOR ALL TO service_role
    USING (true);
