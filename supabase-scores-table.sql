-- ============================================================
-- Scores table — real-time judge score sync
-- Run this in the Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

CREATE TABLE IF NOT EXISTS scores (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comp_id      text NOT NULL,
  round_id     text NOT NULL,
  gymnast_id   text NOT NULL,
  apparatus    text NOT NULL,
  d_score      numeric,
  e_scores     jsonb DEFAULT '[]'::jsonb,
  bonus        numeric DEFAULT 0,
  penalty      numeric DEFAULT 0,
  final_score  numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz DEFAULT now(),
  submitted_by text,
  UNIQUE (comp_id, round_id, gymnast_id, apparatus)
);

-- RLS
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores FORCE ROW LEVEL SECURITY;

-- SELECT: public (results, coaches, judges)
CREATE POLICY "scores_select_public" ON scores FOR SELECT USING (true);

-- INSERT: public (judges submit via anon key)
CREATE POLICY "scores_insert_public" ON scores FOR INSERT WITH CHECK (true);

-- UPDATE: public (judges need UPSERT via merge-duplicates)
CREATE POLICY "scores_update_public" ON scores FOR UPDATE USING (true) WITH CHECK (true);

-- DELETE: competition owner only
CREATE POLICY "scores_delete_comp_owner" ON scores FOR DELETE
  USING (EXISTS (SELECT 1 FROM competitions c WHERE c.id = scores.comp_id AND c.user_id = auth.uid()));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
