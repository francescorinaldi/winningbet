-- ============================================
-- WinningBet — Add telegram_user_id to profiles
-- ============================================
-- Stores the user's Telegram user ID for bot interactions.
-- Used by: telegram-webhook.js (linking), stripe-webhook.js (invite/kick).
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;

-- Index for reverse lookup: Telegram user ID -> profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_user_id
    ON profiles(telegram_user_id)
    WHERE telegram_user_id IS NOT NULL;
