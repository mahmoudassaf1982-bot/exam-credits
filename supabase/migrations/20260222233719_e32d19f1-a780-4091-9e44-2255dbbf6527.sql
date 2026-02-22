
-- Add a server-only column to store correct answers (not exposed to users via RLS)
ALTER TABLE public.exam_sessions ADD COLUMN answers_key_json jsonb DEFAULT '{}'::jsonb;

-- Add a column to store full questions with answers (only populated after completion)
ALTER TABLE public.exam_sessions ADD COLUMN review_questions_json jsonb DEFAULT NULL;

COMMENT ON COLUMN public.exam_sessions.answers_key_json IS 'Server-only: correct answer keys per section. Not exposed to client during exam.';
COMMENT ON COLUMN public.exam_sessions.review_questions_json IS 'Full questions with correct answers, populated only after exam submission.';
