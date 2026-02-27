-- ============================================
-- WinningBet — Fantacalcio Hub
-- ============================================
-- Tabella per i consigli Fantacalcio generati dall'AI.
--
-- Pick types:
--   captain      — Consigli capitano (FREE: top 3 per gameweek)
--   differential — Colpi a sorpresa, ownership bassa + ceiling alto (PRO)
--   buy          — Giocatori da acquistare (VIP)
--   sell         — Giocatori da cedere (VIP)
--
-- La skill /fr3-generate-fantacalcio genera i picks ogni settimana
-- e li inserisce sostituendo quelli della settimana precedente.
-- week_date = lunedì della gameweek corrente (ISO week).
-- ============================================

CREATE TABLE IF NOT EXISTS fantacalcio_picks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league          TEXT NOT NULL CHECK (league IN ('serie-a', 'premier-league')),
    pick_type       TEXT NOT NULL CHECK (pick_type IN ('captain', 'differential', 'buy', 'sell')),
    player_name     TEXT NOT NULL,
    team_name       TEXT NOT NULL,
    role            TEXT CHECK (role IN ('P', 'D', 'C', 'A')),
    reasoning       TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'vip')),
    week_date       DATE NOT NULL,
    confidence      INTEGER CHECK (confidence BETWEEN 0 AND 100),
    expected_points NUMERIC(4,1),
    ownership_pct   NUMERIC(5,1),
    rank            INTEGER NOT NULL DEFAULT 1 CHECK (rank BETWEEN 1 AND 10),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicità: un solo pick per tipo/posizione/settimana/lega
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantacalcio_picks_week
    ON fantacalcio_picks(league, pick_type, rank, week_date);

CREATE INDEX IF NOT EXISTS idx_fantacalcio_picks_league_week
    ON fantacalcio_picks(league, week_date DESC);

CREATE INDEX IF NOT EXISTS idx_fantacalcio_picks_type
    ON fantacalcio_picks(pick_type);

-- ===================
-- ROW-LEVEL SECURITY
-- ===================
ALTER TABLE fantacalcio_picks ENABLE ROW LEVEL SECURITY;

-- Captain picks: visibili a tutti gli utenti autenticati (free tier)
CREATE POLICY fantacalcio_captain_select ON fantacalcio_picks
    FOR SELECT USING (
        pick_type = 'captain'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
        )
    );

-- Differential picks: visibili a utenti PRO e VIP
CREATE POLICY fantacalcio_differential_select ON fantacalcio_picks
    FOR SELECT USING (
        pick_type = 'differential'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier IN ('pro', 'vip')
        )
    );

-- Buy/Sell picks: visibili solo a utenti VIP
CREATE POLICY fantacalcio_transfer_select ON fantacalcio_picks
    FOR SELECT USING (
        pick_type IN ('buy', 'sell')
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier = 'vip'
        )
    );

-- Service role (backend/skill) puo' fare tutto
CREATE POLICY fantacalcio_service_all ON fantacalcio_picks
    FOR ALL TO service_role
    USING (true);
