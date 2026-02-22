
-- Drop the public SELECT policies
DROP POLICY IF EXISTS "Anyone can view active exam sections" ON public.exam_sections;
DROP POLICY IF EXISTS "Anyone can view exam_standards" ON public.exam_standards;
DROP POLICY IF EXISTS "Anyone can view trusted_sources" ON public.trusted_sources;

-- Recreate as authenticated-only
CREATE POLICY "Authenticated users can view exam sections"
  ON public.exam_sections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view exam_standards"
  ON public.exam_standards FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view trusted_sources"
  ON public.trusted_sources FOR SELECT TO authenticated
  USING (true);
