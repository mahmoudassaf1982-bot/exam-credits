-- Add normalized persistence fields for recommendation auto-loop
ALTER TABLE public.student_training_recommendations
ADD COLUMN IF NOT EXISTS recommendation_type text,
ADD COLUMN IF NOT EXISTS recommended_mode text,
ADD COLUMN IF NOT EXISTS target_section text,
ADD COLUMN IF NOT EXISTS difficulty text,
ADD COLUMN IF NOT EXISTS reason_text text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill new columns from recommendation_json
UPDATE public.student_training_recommendations
SET
  recommendation_type = COALESCE(recommendation_type, recommendation_json->>'recommendation_type', 'balanced'),
  recommended_mode = COALESCE(recommended_mode, recommendation_json->>'suggested_training_mode', 'practice'),
  target_section = COALESCE(target_section, recommendation_json->>'target_section_name'),
  difficulty = COALESCE(difficulty, recommendation_json->>'difficulty_level', 'mixed'),
  reason_text = COALESCE(reason_text, recommendation_json->>'reason', '')
WHERE recommendation_type IS NULL
   OR recommended_mode IS NULL
   OR difficulty IS NULL
   OR reason_text IS NULL;

-- Ensure recommendation_type is always present
ALTER TABLE public.student_training_recommendations
ALTER COLUMN recommendation_type SET NOT NULL;

-- Keep only latest row per (student_id, recommendation_type) so unique key can be enforced
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY student_id, recommendation_type
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.student_training_recommendations
)
DELETE FROM public.student_training_recommendations r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- Enforce upsert key required by auto-loop
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_training_recommendations_student_type
ON public.student_training_recommendations (student_id, recommendation_type);

-- Keep updated_at fresh on updates
DROP TRIGGER IF EXISTS trg_student_training_recommendations_updated_at ON public.student_training_recommendations;
CREATE TRIGGER trg_student_training_recommendations_updated_at
BEFORE UPDATE ON public.student_training_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure realtime publication is enabled for this table
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.student_training_recommendations;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;