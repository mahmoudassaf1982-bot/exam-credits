
-- Create skill_memory table to track per-section skill scores
CREATE TABLE public.skill_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exam_template_id UUID NOT NULL,
  section_id TEXT NOT NULL,
  section_name TEXT NOT NULL DEFAULT '',
  skill_score NUMERIC NOT NULL DEFAULT 50,
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_answered INTEGER NOT NULL DEFAULT 0,
  weighted_correct NUMERIC NOT NULL DEFAULT 0,
  weighted_total NUMERIC NOT NULL DEFAULT 0,
  last_exam_score NUMERIC,
  last_exam_date TIMESTAMP WITH TIME ZONE,
  last_training_score NUMERIC,
  last_training_date TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, exam_template_id, section_id)
);

-- Enable RLS
ALTER TABLE public.skill_memory ENABLE ROW LEVEL SECURITY;

-- Users can view their own skill memory
CREATE POLICY "Users can view own skill_memory"
  ON public.skill_memory FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all skill memory
CREATE POLICY "Admins can view all skill_memory"
  ON public.skill_memory FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_skill_memory_user_template ON public.skill_memory(user_id, exam_template_id);

-- Trigger for updated_at
CREATE TRIGGER update_skill_memory_updated_at
  BEFORE UPDATE ON public.skill_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
