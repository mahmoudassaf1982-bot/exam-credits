import { supabase } from '@/integrations/supabase/client';
import type { RecommendationRow } from '@/hooks/useTrainingRecommendationsRealtime';

interface StartTrainingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Start a training session directly from a recommendation.
 * Uses the existing assemble-exam pipeline.
 */
export async function startTrainingFromRecommendation(
  recommendation: RecommendationRow
): Promise<StartTrainingResult> {
  const rec = recommendation.recommendation_json;

  // If already started and has a session, return existing
  if (recommendation.training_session_id && recommendation.started_at) {
    // Check if session still exists and is active
    const { data: existing } = await supabase
      .from('exam_sessions')
      .select('id, status')
      .eq('id', recommendation.training_session_id)
      .single();

    if (existing && (existing.status === 'in_progress' || existing.status === 'not_started')) {
      return { success: true, sessionId: existing.id };
    }
  }

  // Find exam template for the student's country
  // We need to resolve which exam template to use
  const { data: profile } = await supabase
    .from('profiles')
    .select('country_id')
    .eq('id', recommendation.student_id)
    .single();

  if (!profile) {
    return { success: false, error: 'لم يتم العثور على ملف الطالب' };
  }

  // Get exam template for this country
  const { data: templates } = await supabase
    .from('exam_templates')
    .select('id, name_ar')
    .eq('country_id', profile.country_id)
    .eq('is_active', true)
    .limit(1);

  if (!templates || templates.length === 0) {
    return { success: false, error: 'لا يوجد اختبار متاح لدولتك' };
  }

  const examTemplateId = templates[0].id;

  // Resolve target section ID from section name if available
  let targetSectionId: string | undefined;
  if (rec.target_section_name) {
    const { data: sections } = await supabase
      .from('exam_sections')
      .select('id, name_ar')
      .eq('exam_template_id', examTemplateId);

    if (sections) {
      const match = sections.find(s => s.name_ar === rec.target_section_name);
      if (match) targetSectionId = match.id;
    }
  }

  // Create training session via assemble-exam
  const body: Record<string, unknown> = {
    exam_template_id: examTemplateId,
    session_type: 'practice',
  };

  if (targetSectionId) {
    body.target_section_id = targetSectionId;
  }

  const { data, error } = await supabase.functions.invoke('assemble-exam', { body });

  if (error || data?.error) {
    return { success: false, error: data?.error || 'فشل في إنشاء جلسة التدريب' };
  }

  const sessionId = data.session_id;

  // Mark recommendation as started
  await supabase
    .from('student_training_recommendations')
    .update({
      started_at: new Date().toISOString(),
      training_session_id: sessionId,
    } as any)
    .eq('id', recommendation.id);

  return { success: true, sessionId };
}
