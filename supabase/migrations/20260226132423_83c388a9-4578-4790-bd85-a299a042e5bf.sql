
-- Create student_training_recommendations table
CREATE TABLE public.student_training_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  source_exam_id UUID,
  weakness_key TEXT NOT NULL,
  recommendation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate recommendations for same weakness
CREATE UNIQUE INDEX idx_student_rec_weakness ON public.student_training_recommendations (student_id, weakness_key) WHERE is_completed = false;

-- RLS
ALTER TABLE public.student_training_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recommendations"
  ON public.student_training_recommendations FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own recommendations"
  ON public.student_training_recommendations FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can update own recommendations"
  ON public.student_training_recommendations FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can manage recommendations"
  ON public.student_training_recommendations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
