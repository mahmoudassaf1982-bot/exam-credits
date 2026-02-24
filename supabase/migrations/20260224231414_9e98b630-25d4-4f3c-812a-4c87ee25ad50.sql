
-- Add status column to questions table (replacing is_approved boolean)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Migrate existing data: is_approved=true -> 'approved', false -> 'pending_review'
UPDATE public.questions SET status = CASE WHEN is_approved = true THEN 'approved' ELSE 'pending_review' END;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_questions_status ON public.questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_deleted_at ON public.questions(deleted_at);

-- RPC: Bulk update question status
CREATE OR REPLACE FUNCTION public.bulk_update_question_status(
  question_ids uuid[],
  new_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF new_status NOT IN ('draft', 'pending_review', 'approved', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;

  UPDATE public.questions
  SET status = new_status,
      is_approved = (new_status = 'approved')
  WHERE id = ANY(question_ids)
    AND deleted_at IS NULL;
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- RPC: Bulk soft delete questions
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_questions(
  question_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.questions
  SET deleted_at = now()
  WHERE id = ANY(question_ids)
    AND deleted_at IS NULL;
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- RPC: Bulk update status by filter (for "select all matching")
CREATE OR REPLACE FUNCTION public.bulk_update_status_by_filter(
  new_status text,
  filter_country_id text DEFAULT NULL,
  filter_exam_template_id text DEFAULT NULL,
  filter_section_id text DEFAULT NULL,
  filter_difficulty text DEFAULT NULL,
  filter_status text DEFAULT NULL,
  filter_search text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF new_status NOT IN ('draft', 'pending_review', 'approved', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;

  UPDATE public.questions
  SET status = new_status,
      is_approved = (new_status = 'approved')
  WHERE deleted_at IS NULL
    AND (filter_country_id IS NULL OR country_id = filter_country_id)
    AND (filter_exam_template_id IS NULL OR exam_template_id = filter_exam_template_id)
    AND (filter_section_id IS NULL OR section_id = filter_section_id)
    AND (filter_difficulty IS NULL OR difficulty = filter_difficulty)
    AND (filter_status IS NULL OR status = filter_status)
    AND (filter_search IS NULL OR (text_ar ILIKE '%' || filter_search || '%' OR topic ILIKE '%' || filter_search || '%'));
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
