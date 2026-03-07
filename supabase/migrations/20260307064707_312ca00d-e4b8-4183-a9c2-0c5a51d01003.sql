
-- Table for DNA version history
CREATE TABLE public.exam_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  source_pdfs jsonb DEFAULT '[]'::jsonb,
  change_summary text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exam_profile_versions ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage exam_profile_versions"
  ON public.exam_profile_versions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX idx_profile_versions_template ON public.exam_profile_versions(exam_template_id, version_number DESC);
