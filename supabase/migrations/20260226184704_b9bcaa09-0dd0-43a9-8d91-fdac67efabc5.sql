
-- History table to track completed recommendation outcomes
CREATE TABLE public.student_recommendation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  weakness_key TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  target_section TEXT,
  difficulty TEXT,
  result_score NUMERIC,
  improvement_delta NUMERIC,
  source_exam_id UUID,
  training_session_id UUID,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_rec_history_student ON public.student_recommendation_history(student_id, weakness_key, completed_at DESC);

-- RLS
ALTER TABLE public.student_recommendation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own history" ON public.student_recommendation_history
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own history" ON public.student_recommendation_history
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can manage history" ON public.student_recommendation_history
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add consecutive_count to recommendations table
ALTER TABLE public.student_training_recommendations
  ADD COLUMN IF NOT EXISTS consecutive_count INTEGER NOT NULL DEFAULT 1;

-- Enable realtime for history table
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_recommendation_history;
