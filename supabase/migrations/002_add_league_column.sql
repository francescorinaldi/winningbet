-- ============================================
-- WinningBet — Add league column to tips
-- ============================================
-- The tips table was missing the `league` column required for
-- multi-league support. API endpoints filter and insert by league,
-- but the column did not exist in the schema.
-- ============================================

-- Add league column with default 'serie-a' for existing rows
ALTER TABLE tips ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'serie-a';

-- Index for league-based filtering (used by /api/tips, /api/generate-tips, /api/settle-tips)
CREATE INDEX IF NOT EXISTS idx_tips_league ON tips(league);

-- Composite index for the most common query pattern: league + status + match_date
CREATE INDEX IF NOT EXISTS idx_tips_league_status_date ON tips(league, status, match_date DESC);
