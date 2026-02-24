
-- 1. Create question_drafts table
CREATE TABLE public.question_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  country_id text NOT NULL,
  exam_template_id text NULL,
  section_id text NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  count integer NOT NULL DEFAULT 10,
  generator_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  reviewer_model text NOT NULL DEFAULT 'google/gemini-2.5-pro',
  draft_questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewer_report_json jsonb NULL,
  status text NOT NULL DEFAULT 'pending_review',
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  notes text NULL
);

-- 2. Add draft_id to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS draft_id uuid NULL REFERENCES public.question_drafts(id);

-- 3. RLS on question_drafts
ALTER TABLE public.question_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage question_drafts"
  ON public.question_drafts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Add validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_question_draft_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending_review', 'needs_fix', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid draft status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_question_draft_status
  BEFORE INSERT OR UPDATE ON public.question_drafts
  FOR EACH ROW EXECUTE FUNCTION public.validate_question_draft_status();

-- 5. Ensure students can only see approved questions (add permissive policy)
CREATE POLICY "Students can view approved questions"
  ON public.questions FOR SELECT
  TO authenticated
  USING (status = 'approved' AND deleted_at IS NULL);
