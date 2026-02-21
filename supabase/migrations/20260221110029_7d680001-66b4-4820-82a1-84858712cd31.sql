
-- Add Egypt
INSERT INTO public.countries (id, name, name_ar, flag, currency, is_active) 
VALUES ('eg', 'Egypt', 'مصر', '🇪🇬', 'EGP', true)
ON CONFLICT (id) DO NOTHING;

-- Create exam_sections table
CREATE TABLE public.exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 1,
  name_ar text NOT NULL,
  time_limit_sec integer,
  question_count integer NOT NULL DEFAULT 20,
  topic_filter_json jsonb DEFAULT '[]'::jsonb,
  difficulty_mix_json jsonb DEFAULT '{"easy":30,"medium":50,"hard":20}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select exam_sections" ON public.exam_sections FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert exam_sections" ON public.exam_sections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update exam_sections" ON public.exam_sections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete exam_sections" ON public.exam_sections FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can view active exam sections" ON public.exam_sections FOR SELECT USING (true);

CREATE INDEX idx_exam_sections_template ON public.exam_sections(exam_template_id);

-- Seed Kuwait exam: امتحان القدرات الجامعي
INSERT INTO public.exam_templates (id, country_id, slug, name_ar, description_ar, default_question_count, default_time_limit_sec)
VALUES 
  ('a1000000-0000-0000-0000-000000000001'::uuid, 'kw', 'aptitude-kw', 'امتحان القدرات الجامعي', 'اختبار القدرات الأكاديمية لطلاب الجامعات في الكويت', 120, 7200);

-- Kuwait sections
INSERT INTO public.exam_sections (exam_template_id, "order", name_ar, question_count, time_limit_sec) VALUES
  ('a1000000-0000-0000-0000-000000000001'::uuid, 1, 'رياضيات', 40, 2400),
  ('a1000000-0000-0000-0000-000000000001'::uuid, 2, 'لغة عربية', 30, 1800),
  ('a1000000-0000-0000-0000-000000000001'::uuid, 3, 'لغة إنجليزية', 30, 1800),
  ('a1000000-0000-0000-0000-000000000001'::uuid, 4, 'كيمياء', 20, 1200);

-- Seed Saudi exam: امتحان القدرات (كمي/لفظي)
INSERT INTO public.exam_templates (id, country_id, slug, name_ar, description_ar, default_question_count, default_time_limit_sec)
VALUES 
  ('a1000000-0000-0000-0000-000000000002'::uuid, 'sa', 'qudurat', 'امتحان القدرات (كمي/لفظي)', 'اختبار القدرات العامة - القسم الكمي واللفظي', 120, 7200);

-- Saudi sections
INSERT INTO public.exam_sections (exam_template_id, "order", name_ar, question_count, time_limit_sec) VALUES
  ('a1000000-0000-0000-0000-000000000002'::uuid, 1, 'القسم الكمي', 52, 3600),
  ('a1000000-0000-0000-0000-000000000002'::uuid, 2, 'القسم اللفظي', 68, 3600);

-- Add section_id column to questions referencing exam_sections
-- questions.section_id already exists as text, let's keep it compatible
