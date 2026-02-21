
-- Create countries table
CREATE TABLE public.countries (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  name_ar text NOT NULL,
  flag text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select countries" ON public.countries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert countries" ON public.countries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update countries" ON public.countries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete countries" ON public.countries FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can view active countries" ON public.countries FOR SELECT USING (is_active = true);

INSERT INTO public.countries (id, name, name_ar, flag, currency, is_active) VALUES
  ('sa', 'Saudi Arabia', 'السعودية', '🇸🇦', 'SAR', true),
  ('ae', 'UAE', 'الإمارات', '🇦🇪', 'AED', true),
  ('kw', 'Kuwait', 'الكويت', '🇰🇼', 'KWD', true),
  ('bh', 'Bahrain', 'البحرين', '🇧🇭', 'BHD', true),
  ('om', 'Oman', 'عمان', '🇴🇲', 'OMR', true),
  ('qa', 'Qatar', 'قطر', '🇶🇦', 'QAR', true);

-- Create exam_templates table
CREATE TABLE public.exam_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  slug text NOT NULL DEFAULT '',
  name_ar text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  default_time_limit_sec integer NOT NULL DEFAULT 7200,
  default_question_count integer NOT NULL DEFAULT 100,
  simulation_cost_points integer NOT NULL DEFAULT 10,
  practice_cost_points integer NOT NULL DEFAULT 5,
  analysis_cost_points integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select exam_templates" ON public.exam_templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert exam_templates" ON public.exam_templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update exam_templates" ON public.exam_templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete exam_templates" ON public.exam_templates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can view active exam_templates" ON public.exam_templates FOR SELECT USING (is_active = true);

CREATE INDEX idx_exam_templates_country ON public.exam_templates(country_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam_template ON public.questions(exam_template_id);
