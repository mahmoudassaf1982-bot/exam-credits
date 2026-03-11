
-- Create question_hints_cache table
CREATE TABLE public.question_hints_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  exam_template_id uuid,
  hint_text text NOT NULL,
  hint_mode text NOT NULL DEFAULT 'smart_hint',
  language text NOT NULL DEFAULT 'ar',
  model text,
  usage_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate cache entries
ALTER TABLE public.question_hints_cache
  ADD CONSTRAINT question_hints_cache_unique_hint UNIQUE (question_id, hint_mode, language);

-- Index for fast lookups
CREATE INDEX idx_question_hints_cache_lookup
  ON public.question_hints_cache (question_id, hint_mode, language, is_active);

-- Enable RLS
ALTER TABLE public.question_hints_cache ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage question_hints_cache"
  ON public.question_hints_cache
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
