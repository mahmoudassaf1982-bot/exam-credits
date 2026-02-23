
-- Add anti-cheat columns to exam_sessions
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_submit_id uuid;

-- Create exam_submissions table
CREATE TABLE public.exam_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  result_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_idempotency UNIQUE (session_id, idempotency_key)
);

-- Only one final submission per session
CREATE UNIQUE INDEX uq_one_submission_per_session ON public.exam_submissions (session_id);

-- Enable RLS
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view own submissions
CREATE POLICY "Users can view own submissions"
  ON public.exam_submissions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all submissions
CREATE POLICY "Admins can manage submissions"
  ON public.exam_submissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
