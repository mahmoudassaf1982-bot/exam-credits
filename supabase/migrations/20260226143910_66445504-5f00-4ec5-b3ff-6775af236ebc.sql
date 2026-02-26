-- Drop the too-narrow unique index on (student_id, recommendation_type)
DROP INDEX IF EXISTS uq_student_training_recommendations_student_type;

-- Create unique index on (student_id, weakness_key) which is truly unique per recommendation
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_training_recs_student_weakness
ON public.student_training_recommendations (student_id, weakness_key);