
-- Create a function for vector similarity search filtered by exam/section
CREATE OR REPLACE FUNCTION public.match_similar_questions(
  query_embedding vector,
  p_exam_template_id text,
  p_section_id text DEFAULT NULL,
  match_threshold double precision DEFAULT 0.85,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  text_ar text,
  topic text,
  difficulty text,
  section_id text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.text_ar,
    q.topic,
    q.difficulty,
    q.section_id,
    (1 - (q.embedding <=> query_embedding))::double precision AS similarity
  FROM public.questions q
  WHERE q.embedding IS NOT NULL
    AND q.deleted_at IS NULL
    AND q.exam_template_id = p_exam_template_id
    AND (p_section_id IS NULL OR q.section_id = p_section_id)
  ORDER BY q.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
