
-- A) Add calibration columns to questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accuracy numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difficulty_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_calibrated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_calibrated_attempts integer NOT NULL DEFAULT 0;

-- B) Add target difficulty percentages to exam_templates
ALTER TABLE public.exam_templates
  ADD COLUMN IF NOT EXISTS target_easy_pct integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS target_medium_pct integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS target_hard_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS health_alert_threshold_pct integer NOT NULL DEFAULT 10;

-- C) Create calibration audit log table
CREATE TABLE IF NOT EXISTS public.calibration_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL,
  old_difficulty text NOT NULL,
  new_difficulty text NOT NULL,
  accuracy numeric NOT NULL,
  attempts_count integer NOT NULL,
  calibrated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.calibration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage calibration_log" ON public.calibration_log
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
