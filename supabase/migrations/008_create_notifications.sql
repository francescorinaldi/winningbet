-- Notifications table (Phase 3)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('tip_new', 'tip_result', 'streak', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Partial index for fast unread queries
CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC)
    WHERE read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON notifications
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_service_all ON notifications
    FOR ALL TO service_role
    USING (true);
