-- User bets tracking table (Phase 3)
CREATE TABLE user_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tip_id UUID NOT NULL REFERENCES tips(id) ON DELETE CASCADE,
    followed BOOLEAN DEFAULT true,
    stake NUMERIC(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, tip_id)
);

-- RLS
ALTER TABLE user_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_bets_select_own ON user_bets
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_bets_insert_own ON user_bets
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_bets_update_own ON user_bets
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_bets_delete_own ON user_bets
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_bets_service_all ON user_bets
    FOR ALL TO service_role
    USING (true);
