
CREATE TABLE public.generation_guardian_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL,
  triggered_by text NOT NULL DEFAULT 'admin',
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'allowed',
  reason_if_blocked text,
  context_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_guardian_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage guardian_logs"
  ON public.generation_guardian_logs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_guardian_logs_exam ON public.generation_guardian_logs(exam_template_id);
CREATE INDEX idx_guardian_logs_status ON public.generation_guardian_logs(status);
