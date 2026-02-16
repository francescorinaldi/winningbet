-- Add 'draft' status to tips for team-based generation workflow.
-- Draft tips are inserted by analyst teammates and promoted to 'pending'
-- by the reviewer teammate. Any remaining drafts are cleaned up after review.

ALTER TABLE tips DROP CONSTRAINT IF EXISTS tips_status_check;
ALTER TABLE tips ADD CONSTRAINT tips_status_check
  CHECK (status IN ('pending', 'won', 'lost', 'void', 'draft'));

-- Partial index for fast draft tip queries during review phase
CREATE INDEX IF NOT EXISTS idx_tips_status_draft
  ON tips (status) WHERE status = 'draft';
