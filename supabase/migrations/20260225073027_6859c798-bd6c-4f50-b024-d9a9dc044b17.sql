-- Fix ALL restrictive RLS policies on questions table to be PERMISSIVE
DROP POLICY IF EXISTS "Admins can delete questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can select all questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can update questions" ON public.questions;
DROP POLICY IF EXISTS "Students can view approved questions" ON public.questions;

CREATE POLICY "Admins can manage questions" ON public.questions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view approved questions" ON public.questions FOR SELECT TO authenticated
  USING (status = 'approved' AND deleted_at IS NULL);

-- Also fix other tables with same RESTRICTIVE issue
DROP POLICY IF EXISTS "Admins can manage calibration_log" ON public.calibration_log;
CREATE POLICY "Admins can manage calibration_log" ON public.calibration_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage exam_standards" ON public.exam_standards;
CREATE POLICY "Admins can manage exam_standards" ON public.exam_standards FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage sync_audit_log" ON public.sync_audit_log;
CREATE POLICY "Admins can manage sync_audit_log" ON public.sync_audit_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage trusted_sources" ON public.trusted_sources;
CREATE POLICY "Admins can manage trusted_sources" ON public.trusted_sources FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix exam_sessions restrictive policies
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.exam_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.exam_sessions;
DROP POLICY IF EXISTS "Users can update own session answers" ON public.exam_sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON public.exam_sessions;

CREATE POLICY "Admins can view all sessions" ON public.exam_sessions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own sessions" ON public.exam_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session answers" ON public.exam_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'in_progress')
  WITH CHECK (auth.uid() = user_id AND status = 'in_progress');

CREATE POLICY "Users can view own sessions" ON public.exam_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Fix exam_sections
DROP POLICY IF EXISTS "Admins can delete exam_sections" ON public.exam_sections;
DROP POLICY IF EXISTS "Admins can insert exam_sections" ON public.exam_sections;
DROP POLICY IF EXISTS "Admins can select exam_sections" ON public.exam_sections;
DROP POLICY IF EXISTS "Admins can update exam_sections" ON public.exam_sections;

CREATE POLICY "Admins can manage exam_sections" ON public.exam_sections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow authenticated users to read exam_sections (needed by assemble-exam via service role, but also for UI)
CREATE POLICY "Authenticated can view exam_sections" ON public.exam_sections FOR SELECT TO authenticated
  USING (true);

-- Fix exam_templates
DROP POLICY IF EXISTS "Admins can delete exam_templates" ON public.exam_templates;
DROP POLICY IF EXISTS "Admins can insert exam_templates" ON public.exam_templates;
DROP POLICY IF EXISTS "Admins can select exam_templates" ON public.exam_templates;
DROP POLICY IF EXISTS "Admins can update exam_templates" ON public.exam_templates;
DROP POLICY IF EXISTS "Anyone can view active exam_templates" ON public.exam_templates;

CREATE POLICY "Admins can manage exam_templates" ON public.exam_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active exam_templates" ON public.exam_templates FOR SELECT TO authenticated
  USING (is_active = true);