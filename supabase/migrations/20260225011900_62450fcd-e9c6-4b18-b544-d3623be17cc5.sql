
-- Fix: Drop restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Admins can manage question_drafts" ON public.question_drafts;

CREATE POLICY "Admins can manage question_drafts"
  ON public.question_drafts
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
