CREATE OR REPLACE FUNCTION public.validate_question_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Block approval if missing required fields
  IF (NEW.status = 'approved' OR NEW.is_approved = true) THEN
    IF NEW.exam_template_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve question without exam_template_id (question: %)', NEW.id;
    END IF;
    IF NEW.section_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve question without section_id (question: %)', NEW.id;
    END IF;
    IF NEW.country_id IS NULL OR NEW.country_id = '' THEN
      RAISE EXCEPTION 'Cannot approve question without valid country_id (question: %)', NEW.id;
    END IF;
    -- Validate section belongs to the exam template
    IF NOT EXISTS (
      SELECT 1 FROM public.exam_sections 
      WHERE id::text = NEW.section_id 
        AND exam_template_id::text = NEW.exam_template_id
    ) THEN
      RAISE EXCEPTION 'section_id % does not belong to exam_template_id % (question: %)', NEW.section_id, NEW.exam_template_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_question_approval
BEFORE INSERT OR UPDATE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.validate_question_approval();