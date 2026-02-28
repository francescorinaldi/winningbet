-- 017: Referral Code — tracking conversioni per il programma Centro Partner
-- referral_code: codice assegnato al partner (univoco, es. "PLANETWIN-NAPOLI")
-- referred_by:   codice del partner che ha portato questo utente

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON profiles(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by
  ON profiles(referred_by)
  WHERE referred_by IS NOT NULL;

COMMENT ON COLUMN profiles.referral_code IS
  'Codice referral univoco del partner (es. PLANETWIN-NAPOLI). Assegnato manualmente ai partner.';

COMMENT ON COLUMN profiles.referred_by IS
  'Codice referral del partner che ha portato questo utente. Settato al momento della registrazione via URL ?ref=CODE.';
