
-- Create exam_sessions table for tracking student exam attempts
CREATE TABLE public.exam_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exam_template_id UUID NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'practice',
  status TEXT NOT NULL DEFAULT 'in_progress',
  exam_snapshot JSONB DEFAULT '{}'::jsonb,
  questions_json JSONB DEFAULT '[]'::jsonb,
  answers_json JSONB DEFAULT '{}'::jsonb,
  score_json JSONB DEFAULT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  time_limit_sec INTEGER NOT NULL DEFAULT 7200,
  points_cost INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON public.exam_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own sessions
CREATE POLICY "Users can insert own sessions"
  ON public.exam_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own sessions"
  ON public.exam_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
  ON public.exam_sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_exam_sessions_user_id ON public.exam_sessions(user_id);
CREATE INDEX idx_exam_sessions_status ON public.exam_sessions(status);
