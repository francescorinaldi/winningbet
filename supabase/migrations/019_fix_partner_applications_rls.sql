-- Fix: restrict partner_app_service_all policy to service_role only
-- and add safe INSERT policy for authenticated users (own row, pending only, no admin fields).
-- Addresses Copilot review PR #186 R3: authenticated users could bypass server-side
-- validation and insert arbitrary applications with admin-only fields.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS partner_app_service_all ON partner_applications;

-- Service role (backend) can do everything — explicitly scoped to service_role
CREATE POLICY partner_app_service_all ON partner_applications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can insert only their own application with safe defaults:
-- - must be their own user_id
-- - status must be 'pending'
-- - admin-only fields must be NULL
CREATE POLICY partner_app_insert_own ON partner_applications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND status = 'pending'
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND vies_valid IS NULL
        AND vies_company_name IS NULL
        AND vies_address IS NULL
        AND notes IS NULL
        AND rejection_reason IS NULL
    );
