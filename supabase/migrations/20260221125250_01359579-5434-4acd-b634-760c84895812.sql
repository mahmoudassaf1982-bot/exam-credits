
ALTER TABLE public.trusted_sources ADD CONSTRAINT trusted_sources_exam_source_unique UNIQUE (exam_template_id, source_name);
