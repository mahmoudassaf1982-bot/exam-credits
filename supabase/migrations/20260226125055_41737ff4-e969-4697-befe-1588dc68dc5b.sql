
-- Student Memory Profile
CREATE TABLE public.student_memory_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  strength_map jsonb NOT NULL DEFAULT '{}',
  weakness_map jsonb NOT NULL DEFAULT '{}',
  speed_profile text NOT NULL DEFAULT 'normal',
  accuracy_profile numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_memory_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory profile"
  ON public.student_memory_profile FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Users can upsert own memory profile"
  ON public.student_memory_profile FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can update own memory profile"
  ON public.student_memory_profile FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can manage memory profiles"
  ON public.student_memory_profile FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Student Thinking Reports
CREATE TABLE public.student_thinking_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exam_session_id uuid NOT NULL UNIQUE,
  report_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_thinking_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own thinking reports"
  ON public.student_thinking_reports FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own thinking reports"
  ON public.student_thinking_reports FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can manage thinking reports"
  ON public.student_thinking_reports FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
