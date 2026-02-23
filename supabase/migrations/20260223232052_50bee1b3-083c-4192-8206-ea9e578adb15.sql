-- Fix double-encoded options in questions table
-- Options are stored as jsonb strings like '"[{...}]"' instead of actual arrays '[{...}]'
UPDATE public.questions
SET options = options::text::jsonb
WHERE jsonb_typeof(options) = 'string';

-- Also fix any double-encoded options in existing exam_sessions.questions_json
-- We need to iterate over each section's questions and parse string options
CREATE OR REPLACE FUNCTION public.fix_session_options()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  sess RECORD;
  section_key TEXT;
  section_questions JSONB;
  fixed_questions JSONB;
  q JSONB;
  i INT;
  new_questions_json JSONB;
BEGIN
  FOR sess IN SELECT id, questions_json FROM exam_sessions WHERE questions_json IS NOT NULL
  LOOP
    new_questions_json := '{}'::jsonb;
    FOR section_key IN SELECT jsonb_object_keys(sess.questions_json)
    LOOP
      section_questions := sess.questions_json->section_key;
      fixed_questions := '[]'::jsonb;
      FOR i IN 0..jsonb_array_length(section_questions)-1
      LOOP
        q := section_questions->i;
        IF jsonb_typeof(q->'options') = 'string' THEN
          q := jsonb_set(q, '{options}', (q->>'options')::jsonb);
        END IF;
        fixed_questions := fixed_questions || jsonb_build_array(q);
      END LOOP;
      new_questions_json := jsonb_set(new_questions_json, ARRAY[section_key], fixed_questions);
    END LOOP;
    UPDATE exam_sessions SET questions_json = new_questions_json WHERE id = sess.id;
  END LOOP;
END;
$$;

SELECT public.fix_session_options();

-- Clean up the temp function
DROP FUNCTION public.fix_session_options();