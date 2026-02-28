-- Add applicant_email column to partner_applications for denormalized email storage.
-- This avoids N+1 cross-service lookups to auth.users when listing applications.
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS applicant_email TEXT;

-- Backfill existing rows from auth.users (if any exist)
UPDATE partner_applications pa
SET applicant_email = au.email
FROM auth.users au
WHERE pa.user_id = au.id
  AND pa.applicant_email IS NULL;
