
CREATE TABLE public.student_training_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exam_template_id uuid NOT NULL,
  cycle_number integer NOT NULL DEFAULT 1,
  used_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cycle_started_at timestamp with time zone NOT NULL DEFAULT now(),
  cycle_completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_template_id, cycle_number)
);

ALTER TABLE public.student_training_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cycles"
  ON public.student_training_cycles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage cycles"
  ON public.student_training_cycles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
