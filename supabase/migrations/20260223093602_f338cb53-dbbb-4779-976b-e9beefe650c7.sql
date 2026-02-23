
-- Add expires_at to exam_sessions
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Change default status to 'not_started' for new sessions
ALTER TABLE public.exam_sessions
  ALTER COLUMN status SET DEFAULT 'not_started';

-- Drop the existing permissive UPDATE policy for users
DROP POLICY IF EXISTS "Users can update own sessions" ON public.exam_sessions;

-- Users can only update answers_json on their own in_progress sessions
CREATE POLICY "Users can update own session answers"
  ON public.exam_sessions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'in_progress')
  WITH CHECK (auth.uid() = user_id AND status = 'in_progress');
