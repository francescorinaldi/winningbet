-- Fix: prevent privilege escalation via profiles_update_own.
--
-- The original policy allows authenticated users to UPDATE any column
-- on their own profile row — including `role` and `tier`, which are
-- admin-controlled. An attacker could set role='admin' via the
-- browser Supabase client and then read all partner_applications
-- through the partner_app_select_admin policy.
--
-- Solution (two-part):
--   1. Replace profiles_update_own with a column-restricted policy
--      that only allows updating safe, user-controlled fields.
--   2. Drop partner_app_select_admin (admin reads partner_applications
--      exclusively through the service_role backend, not via RLS).

-- Part 1: Restrict profiles update to safe columns only.
-- PostgreSQL RLS cannot restrict columns directly in USING/WITH CHECK,
-- so we use a WITH CHECK that ensures role and tier are never changed
-- by comparing NEW values against the existing row via a subquery.
DROP POLICY IF EXISTS profiles_update_own ON profiles;

CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid())
        AND tier IS NOT DISTINCT FROM (SELECT p.tier FROM profiles p WHERE p.user_id = auth.uid())
    );

-- Part 2: Remove the admin SELECT policy on partner_applications.
-- Admin reads now go exclusively through the service_role backend
-- (api/admin.js uses SUPABASE_SECRET_KEY), so no RLS-based admin
-- access is needed. This eliminates the escalation vector entirely.
DROP POLICY IF EXISTS partner_app_select_admin ON partner_applications;
