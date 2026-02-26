
-- Create student_learning_dna table
CREATE TABLE public.student_learning_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE,
  dna_type TEXT NOT NULL DEFAULT 'balanced',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  evolution_stage INTEGER NOT NULL DEFAULT 1,
  trend_direction TEXT NOT NULL DEFAULT 'stable',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  history_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.student_learning_dna ENABLE ROW LEVEL SECURITY;

-- RLS: Students can read own DNA
CREATE POLICY "Users can view own DNA"
  ON public.student_learning_dna
  FOR SELECT
  USING (auth.uid() = student_id);

-- RLS: Students can upsert own DNA
CREATE POLICY "Users can upsert own DNA"
  ON public.student_learning_dna
  FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can update own DNA"
  ON public.student_learning_dna
  FOR UPDATE
  USING (auth.uid() = student_id);

-- RLS: Admins full access
CREATE POLICY "Admins can manage DNA"
  ON public.student_learning_dna
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_learning_dna;
