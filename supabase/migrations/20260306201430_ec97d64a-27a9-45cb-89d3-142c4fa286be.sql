
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to questions table (1536 dimensions for OpenAI embeddings)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create duplicate_guard_logs table
CREATE TABLE IF NOT EXISTS public.duplicate_guard_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_draft_id uuid,
  question_text text,
  exam_template_id text,
  section_id text,
  similarity_score numeric DEFAULT 0,
  concept_match_score numeric DEFAULT 0,
  matched_question_id uuid,
  matched_question_text text,
  action text NOT NULL DEFAULT 'accepted',
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on duplicate_guard_logs
ALTER TABLE public.duplicate_guard_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy: admins only
CREATE POLICY "Admins can manage duplicate_guard_logs"
  ON public.duplicate_guard_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create IVFFlat index for vector similarity search on questions
-- Using ivfflat with cosine distance, filtered by exam_template_id
CREATE INDEX IF NOT EXISTS idx_questions_embedding_ivfflat
  ON public.questions
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Composite index to support filtered vector searches
CREATE INDEX IF NOT EXISTS idx_questions_exam_section_embedding
  ON public.questions (exam_template_id, section_id)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;
