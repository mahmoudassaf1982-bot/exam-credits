
-- 1) Create exam_profiles table
CREATE TABLE public.exam_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_template_id uuid NOT NULL UNIQUE REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_exam_profiles_status ON public.exam_profiles(status);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_exam_profile_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Invalid exam_profile status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_exam_profile_status
  BEFORE INSERT OR UPDATE ON public.exam_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_exam_profile_status();

-- Updated_at trigger
CREATE TRIGGER trg_exam_profiles_updated_at
  BEFORE UPDATE ON public.exam_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.exam_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage exam_profiles"
  ON public.exam_profiles FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view approved exam_profiles"
  ON public.exam_profiles FOR SELECT
  USING (status = 'approved');

-- 2) Add profile_snapshot_json to ai_jobs
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS profile_snapshot_json jsonb;
