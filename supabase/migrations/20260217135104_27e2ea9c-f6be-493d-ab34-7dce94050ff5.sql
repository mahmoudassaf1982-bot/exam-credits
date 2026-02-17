
-- Create questions table
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  exam_template_id text,
  section_id text,
  topic text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  text_ar text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id text NOT NULL,
  explanation text,
  is_approved boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Admin-only policies using has_role function
CREATE POLICY "Admins can select all questions"
ON public.questions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert questions"
ON public.questions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update questions"
ON public.questions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete questions"
ON public.questions FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Index for common queries
CREATE INDEX idx_questions_country ON public.questions(country_id);
CREATE INDEX idx_questions_topic ON public.questions(topic);
CREATE INDEX idx_questions_difficulty ON public.questions(difficulty);
