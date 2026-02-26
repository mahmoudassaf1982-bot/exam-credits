
-- Feature 1: Student Score Predictions (range-based)
CREATE TABLE IF NOT EXISTS student_score_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exam_session_id uuid NOT NULL UNIQUE,
  exam_template_id uuid NOT NULL,
  predicted_min integer NOT NULL DEFAULT 0,
  predicted_max integer NOT NULL DEFAULT 0,
  readiness_level text NOT NULL DEFAULT 'LOW',
  confidence numeric NOT NULL DEFAULT 0,
  weak_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  strong_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Feature 2: Student Live Insights
CREATE TABLE IF NOT EXISTS student_live_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exam_session_id uuid NOT NULL,
  insight_type text NOT NULL,
  message text NOT NULL,
  section_name text,
  question_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_student_score_predictions_student ON student_score_predictions(student_id);
CREATE INDEX idx_student_score_predictions_session ON student_score_predictions(exam_session_id);
CREATE INDEX idx_student_live_insights_session ON student_live_insights(exam_session_id);
CREATE INDEX idx_student_live_insights_student ON student_live_insights(student_id);

-- RLS
ALTER TABLE student_score_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_live_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own predictions" ON student_score_predictions
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Service can insert predictions" ON student_score_predictions
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can manage predictions" ON student_score_predictions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own insights" ON student_live_insights
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own insights" ON student_live_insights
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can manage insights" ON student_live_insights
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
