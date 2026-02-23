
-- Add attempt_token_hash column to exam_sessions (server-side only, never exposed via RLS)
ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS attempt_token_hash text DEFAULT NULL;

-- Ensure the existing RLS UPDATE policy only allows updating answers_json (not attempt_token_hash)
-- The existing policy "Users can update own session answers" already restricts to status='in_progress'
-- and the client can only update answers_json via the anon key.
-- The attempt_token_hash column is ONLY written by service_role in edge functions.

COMMENT ON COLUMN public.exam_sessions.attempt_token_hash IS 'Server-side only. SHA-256 hash of the attempt token. Never exposed to clients via RLS.';
