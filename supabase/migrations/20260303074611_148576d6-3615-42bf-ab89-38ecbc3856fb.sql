
-- Add operation column for profile builder jobs
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS operation TEXT;

-- Update type constraint to include profile_builder
ALTER TABLE public.ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_type_check;
ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_type_check 
  CHECK (type IN ('generate_draft', 'review_draft', 'quality_gate', 'publish_draft', 'generate_questions_draft', 'profile_builder'));

-- Add performance index for retry/lock queries
CREATE INDEX IF NOT EXISTS idx_ai_jobs_retry_lock 
  ON public.ai_jobs (status, next_run_at, locked_at);

-- Create atomic lock RPC for profile builder jobs
CREATE OR REPLACE FUNCTION public.lock_profile_job(p_job_id UUID, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _locked BOOLEAN := FALSE;
BEGIN
  UPDATE public.ai_jobs
  SET locked_by = p_worker_id,
      locked_at = NOW(),
      status = 'running',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
  WHERE id = p_job_id
    AND status IN ('queued', 'failed')
    AND (next_run_at IS NULL OR next_run_at <= NOW())
    AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '10 minutes')
  ;
  
  GET DIAGNOSTICS _locked = ROW_COUNT;
  RETURN _locked;
END;
$$;
