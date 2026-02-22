
-- ══════════════════════════════════════════════════
-- 1. Remove overly permissive SELECT policies
-- ══════════════════════════════════════════════════

-- exam_sections: remove "true" SELECT for authenticated
DROP POLICY IF EXISTS "Authenticated users can view exam sections" ON public.exam_sections;

-- exam_standards: remove "true" SELECT for authenticated
DROP POLICY IF EXISTS "Authenticated users can view exam_standards" ON public.exam_standards;

-- trusted_sources: remove "true" SELECT for authenticated
DROP POLICY IF EXISTS "Authenticated users can view trusted_sources" ON public.trusted_sources;

-- questions: remove public SELECT for approved (assemble-exam uses service role)
DROP POLICY IF EXISTS "Users can view approved questions" ON public.questions;

-- ══════════════════════════════════════════════════
-- 2. Move answers_key_json to a separate locked table
--    so users cannot read correct answers from exam_sessions
-- ══════════════════════════════════════════════════

CREATE TABLE public.exam_answer_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  answers_key_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_answer_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can read answer keys (edge functions use service role)
CREATE POLICY "Admins can view answer keys"
  ON public.exam_answer_keys
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage answer keys"
  ON public.exam_answer_keys
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookup by session
CREATE INDEX idx_exam_answer_keys_session_id ON public.exam_answer_keys (session_id);

-- ══════════════════════════════════════════════════
-- 3. Remove answers_key_json column from exam_sessions
--    (no longer needed here since we have a separate table)
-- ══════════════════════════════════════════════════

ALTER TABLE public.exam_sessions DROP COLUMN IF EXISTS answers_key_json;
