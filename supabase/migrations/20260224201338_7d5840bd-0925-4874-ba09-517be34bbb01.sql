
-- Create score_predictions table
CREATE TABLE public.score_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exam_template_id UUID NOT NULL,
  predicted_score NUMERIC NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  section_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  training_session_count INTEGER NOT NULL DEFAULT 0,
  exam_session_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, exam_template_id)
);

-- Enable RLS
ALTER TABLE public.score_predictions ENABLE ROW LEVEL SECURITY;

-- Users can view their own predictions
CREATE POLICY "Users can view own predictions"
  ON public.score_predictions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all predictions"
  ON public.score_predictions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_score_predictions_user ON public.score_predictions(user_id, exam_template_id);
