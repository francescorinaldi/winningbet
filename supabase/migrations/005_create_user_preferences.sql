-- User preferences table for personalization (Phase 2)
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_league TEXT DEFAULT 'serie-a',
    favorite_teams TEXT[] DEFAULT '{}',
    notification_tips BOOLEAN DEFAULT true,
    notification_results BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id)
);

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_select_own ON user_preferences
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_preferences_insert_own ON user_preferences
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_preferences_update_own ON user_preferences
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_preferences_service_all ON user_preferences
    FOR ALL TO service_role
    USING (true);
