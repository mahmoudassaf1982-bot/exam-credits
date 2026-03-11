
-- Create ai_provider_state table
CREATE TABLE public.ai_provider_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_provider text NOT NULL DEFAULT 'claude',
  active_provider text NOT NULL DEFAULT 'claude',
  fallback_provider text NOT NULL DEFAULT 'openai',
  status text NOT NULL DEFAULT 'healthy',
  failure_reason text NULL,
  last_failure_at timestamptz NULL,
  last_recovery_at timestamptz NULL,
  last_email_sent_at timestamptz NULL,
  last_healthcheck_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_provider_state ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admins can manage ai_provider_state"
  ON public.ai_provider_state FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Seed default row
INSERT INTO public.ai_provider_state (primary_provider, active_provider, fallback_provider, status)
VALUES ('claude', 'claude', 'openai', 'healthy');
