
-- Add tracking fields to student_training_recommendations
ALTER TABLE public.student_training_recommendations
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS result_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS improvement_delta numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS training_session_id uuid DEFAULT NULL;

-- Enable realtime for recommendations
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_training_recommendations;
