
-- Add language column to questions table
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ar';

-- Add available_languages to exam_templates  
ALTER TABLE public.exam_templates
  ADD COLUMN IF NOT EXISTS available_languages jsonb NOT NULL DEFAULT '["ar"]'::jsonb;

-- Create index for language-based queries
CREATE INDEX IF NOT EXISTS idx_questions_language ON public.questions(language);
CREATE INDEX IF NOT EXISTS idx_questions_approved_language ON public.questions(is_approved, country_id, language);
