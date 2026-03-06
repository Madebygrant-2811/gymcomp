-- ============================================================
-- GYMCOMP — Supabase RLS Policy Audit & Remediation
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================
-- This script is IDEMPOTENT — safe to run multiple times.
-- It drops existing policies by name before recreating them.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COMPETITIONS TABLE
-- ────────────────────────────────────────────────────────────
-- Columns: id (uuid PK), data (jsonb), user_id (uuid FK → auth.users),
--          status (text), created_at (timestamptz)
--
-- Access model:
--   • Owner (auth.uid() = user_id): full CRUD
--   • Anon / any authenticated user: SELECT only (for judge PIN
--     entry, public results, club submission validation)
-- ────────────────────────────────────────────────────────────

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions FORCE ROW LEVEL SECURITY;

-- SELECT: anyone can read (judges, public results pages, club submission screen)
DROP POLICY IF EXISTS "competitions_select_public" ON competitions;
CREATE POLICY "competitions_select_public" ON competitions
  FOR SELECT
  USING (true);

-- INSERT: only authenticated users, stamped with their own user_id
DROP POLICY IF EXISTS "competitions_insert_owner" ON competitions;
CREATE POLICY "competitions_insert_owner" ON competitions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: only the owner
DROP POLICY IF EXISTS "competitions_update_owner" ON competitions;
CREATE POLICY "competitions_update_owner" ON competitions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: only the owner
DROP POLICY IF EXISTS "competitions_delete_owner" ON competitions;
CREATE POLICY "competitions_delete_owner" ON competitions
  FOR DELETE
  USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE
-- ────────────────────────────────────────────────────────────
-- Columns: id (uuid PK, = auth.users.id), full_name, club_name,
--          location, role, referral
--
-- Access model:
--   • Each user can only read/write their own profile row
--   • No public/anon access needed
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- SELECT: own row only
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- INSERT: own row only (id must match auth.uid())
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: own row only
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: own row only (future-proofing; not used by app today)
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles
  FOR DELETE
  USING (auth.uid() = id);


-- ────────────────────────────────────────────────────────────
-- 3. SUBMISSIONS TABLE
-- ────────────────────────────────────────────────────────────
-- Columns: id (text PK), comp_id (text FK → competitions.id),
--          club_name, contact_name, contact_email,
--          gymnasts (jsonb), submitted_at (timestamptz),
--          status (text: pending/accepted/declined)
--
-- Access model:
--   • Anon INSERT: clubs submit without logging in
--   • SELECT: the competition owner (via comp_id → competitions.user_id)
--   • UPDATE: the competition owner (accept/decline)
--   • DELETE: the competition owner (future-proofing)
--
-- The key relationship: submissions.comp_id → competitions.id,
-- and we check the requesting user owns that competition.
-- ────────────────────────────────────────────────────────────

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;

-- INSERT: anyone (public club submission form, no auth required)
DROP POLICY IF EXISTS "submissions_insert_public" ON submissions;
CREATE POLICY "submissions_insert_public" ON submissions
  FOR INSERT
  WITH CHECK (true);

-- SELECT: only the owner of the parent competition
DROP POLICY IF EXISTS "submissions_select_comp_owner" ON submissions;
CREATE POLICY "submissions_select_comp_owner" ON submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM competitions c
      WHERE c.id = submissions.comp_id
        AND c.user_id = auth.uid()
    )
  );

-- UPDATE: only the owner of the parent competition
DROP POLICY IF EXISTS "submissions_update_comp_owner" ON submissions;
CREATE POLICY "submissions_update_comp_owner" ON submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM competitions c
      WHERE c.id = submissions.comp_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM competitions c
      WHERE c.id = submissions.comp_id
        AND c.user_id = auth.uid()
    )
  );

-- DELETE: only the owner of the parent competition
DROP POLICY IF EXISTS "submissions_delete_comp_owner" ON submissions;
CREATE POLICY "submissions_delete_comp_owner" ON submissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM competitions c
      WHERE c.id = submissions.comp_id
        AND c.user_id = auth.uid()
    )
  );
