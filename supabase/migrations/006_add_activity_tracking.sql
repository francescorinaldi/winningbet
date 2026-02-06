-- Activity tracking columns on profiles (Phase 3)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_visit_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_visits INTEGER DEFAULT 0;
