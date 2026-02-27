-- 016: Ruolo Partner (Centro Scommesse B2B)
-- role è ortogonale al tier. Assegnazione manuale:
--   UPDATE profiles SET role = 'partner', tier = 'vip' WHERE user_id = '<uuid>';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('partner', 'admin'))
  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role)
  WHERE role IS NOT NULL;

COMMENT ON COLUMN profiles.role IS
  'Ruolo B2B opzionale: partner (gestore centro scommesse) o admin. NULL = utente normale.';
