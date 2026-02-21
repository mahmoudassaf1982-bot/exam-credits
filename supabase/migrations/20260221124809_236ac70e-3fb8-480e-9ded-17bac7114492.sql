
-- Table: trusted_sources - stores official sources for each exam
CREATE TABLE public.trusted_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url text,
  description text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trusted_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage trusted_sources" ON public.trusted_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view trusted_sources" ON public.trusted_sources FOR SELECT USING (true);

-- Table: exam_standards - detailed standards per exam
CREATE TABLE public.exam_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  time_limit_minutes integer,
  difficulty_distribution jsonb DEFAULT '{"easy":30,"medium":50,"hard":20}'::jsonb,
  topics jsonb DEFAULT '[]'::jsonb,
  source_id uuid REFERENCES public.trusted_sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage exam_standards" ON public.exam_standards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view exam_standards" ON public.exam_standards FOR SELECT USING (true);

-- Table: sync_audit_log - logs all sync operations
CREATE TABLE public.sync_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync_audit_log" ON public.sync_audit_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_trusted_sources_updated_at BEFORE UPDATE ON public.trusted_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exam_standards_updated_at BEFORE UPDATE ON public.exam_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
