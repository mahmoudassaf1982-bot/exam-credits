
-- Update claim_next_job to include 'failed' status and handle next_run_at NULL
CREATE OR REPLACE FUNCTION public.claim_next_job(worker_id text)
 RETURNS SETOF ai_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _job ai_jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job
  FROM public.ai_jobs
  WHERE status IN ('queued', 'failed')
    AND (next_run_at IS NULL OR next_run_at <= NOW())
    AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_jobs
  SET locked_by   = worker_id,
      locked_at   = NOW(),
      status      = 'running',
      started_at  = COALESCE(started_at, NOW()),
      attempt_count = attempt_count + 1,
      updated_at  = NOW()
  WHERE id = _job.id;

  RETURN QUERY
    SELECT * FROM public.ai_jobs WHERE id = _job.id;
END;
$function$;
