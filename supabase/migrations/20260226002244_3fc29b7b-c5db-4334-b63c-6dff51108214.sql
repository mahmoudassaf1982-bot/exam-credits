
-- ═══════════════════════════════════════════════════════════════
-- AI Job Queue System - Phase 1 MVP
-- ═══════════════════════════════════════════════════════════════

-- 1) ai_jobs table
CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('generate_draft','review_draft','quality_gate','publish_draft')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','partial','succeeded','failed','canceled')),
  priority int NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  idempotency_key text UNIQUE NOT NULL,
  target_draft_id uuid,
  target_exam_session_id uuid,
  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress_total int NOT NULL DEFAULT 0,
  progress_done int NOT NULL DEFAULT 0,
  progress_failed int NOT NULL DEFAULT 0,
  last_error text,
  attempt_count int NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_at timestamptz
);

-- Indexes for ai_jobs
CREATE INDEX idx_ai_jobs_claimable ON public.ai_jobs (status, next_run_at)
  WHERE status IN ('queued','partial');
CREATE INDEX idx_ai_jobs_locked ON public.ai_jobs (locked_at)
  WHERE locked_by IS NOT NULL;

-- 2) ai_job_items table
CREATE TABLE public.ai_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  item_index int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb,
  error text,
  attempt_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (job_id, item_index)
);

CREATE INDEX idx_ai_job_items_job_status ON public.ai_job_items (job_id, status);

-- 3) ai_dead_letter_jobs (DLQ)
CREATE TABLE public.ai_dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  type text NOT NULL,
  params_json jsonb,
  last_error text,
  attempts int NOT NULL DEFAULT 0,
  failed_at timestamptz NOT NULL DEFAULT now()
);

-- 4) ai_system_state (Circuit Breaker) - singleton row
CREATE TABLE public.ai_system_state (
  id int PRIMARY KEY DEFAULT 1,
  gemini_circuit_open_until timestamptz,
  gemini_failures_window int NOT NULL DEFAULT 0,
  gemini_last_failure_at timestamptz
);

-- Insert the singleton row
INSERT INTO public.ai_system_state (id) VALUES (1);

-- 5) RLS policies
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_dead_letter_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_system_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ai_jobs" ON public.ai_jobs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ai_job_items" ON public.ai_job_items
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ai_dead_letter_jobs" ON public.ai_dead_letter_jobs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ai_system_state" ON public.ai_system_state
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6) Updated_at trigger
CREATE TRIGGER set_ai_jobs_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
