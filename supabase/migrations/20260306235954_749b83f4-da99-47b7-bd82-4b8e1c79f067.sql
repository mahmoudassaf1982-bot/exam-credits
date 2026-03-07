
-- Create storage bucket for exam source files (PDFs, guidelines)
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-sources', 'exam-sources', false);

-- RLS for exam-sources bucket: only admins can upload/read
CREATE POLICY "Admins can upload exam sources"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-sources'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can read exam sources"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-sources'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete exam sources"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-sources'
  AND public.has_role(auth.uid(), 'admin')
);

-- Table to track uploaded source files per exam template
CREATE TABLE public.exam_profile_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id UUID NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  file_size_bytes INTEGER DEFAULT 0,
  extracted_text TEXT,
  notes TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_profile_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage exam_profile_sources"
ON public.exam_profile_sources FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
