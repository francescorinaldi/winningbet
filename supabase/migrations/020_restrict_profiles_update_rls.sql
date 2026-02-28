-- Fix: prevent privilege escalation via profiles_update_own.
--
-- The original policy allows authenticated users to UPDATE any column
-- on their own profile row — including `role` and `tier`, which are
-- admin-controlled. An attacker could set role='admin' via the
-- browser Supabase client and then read all partner_applications
-- through the partner_app_select_admin policy.
--
-- Solution (two-part):
--   1. Revoke UPDATE on role/tier columns from authenticated users
--      and recreate a simple ownership-based policy (no self-referential
--      subqueries that would cause RLS recursion).
--   2. Drop partner_app_select_admin (admin reads partner_applications
--      exclusively through the service_role backend, not via RLS).

-- Part 1: Column-level privileges to block admin-controlled fields.
-- This is more robust than WITH CHECK subqueries which can cause
-- infinite recursion when the subquery references the same table.
REVOKE UPDATE (role, tier) ON profiles FROM authenticated;

DROP POLICY IF EXISTS profiles_update_own ON profiles;

CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Part 2: Remove the admin SELECT policy on partner_applications.
-- Admin reads now go exclusively through the service_role backend
-- (api/admin.js uses SUPABASE_SECRET_KEY), so no RLS-based admin
-- access is needed. This eliminates the escalation vector entirely.
DROP POLICY IF EXISTS partner_app_select_admin ON partner_applications;
