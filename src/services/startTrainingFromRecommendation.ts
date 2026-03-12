import { supabase } from '@/integrations/supabase/client';
import type { RecommendationRow } from '@/hooks/useTrainingRecommendationsRealtime';
import type { TrainingRecommendation } from '@/services/trainingRecommendationEngine';

interface StartTrainingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  insufficientBalance?: {
    required: number;
    current: number;
  };
  sessionConfig?: {
    max_questions: number;
    target_difficulty: string;
    target_section_id?: string;
    time_limit_sec: number;
  };
}

/**
 * Parse estimated duration string (e.g. "10 دقائق") to minutes.
 */
function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 15;
}

/**
 * Derive question count from duration (approx 1.5 min per question).
 */
function deriveQuestionCount(durationMinutes: number): number {
  const count = Math.round(durationMinutes / 1.5);
  return Math.max(5, Math.min(count, 30));
}

/**
 * Start a training session directly from a recommendation.
 * Passes the recommendation's exact parameters to the edge function.
 */
export async function startTrainingFromRecommendation(
  recommendation: RecommendationRow
): Promise<StartTrainingResult> {
  const rec = recommendation.recommendation_json as TrainingRecommendation;

  // If already started and has a session, return existing
  if (recommendation.training_session_id && recommendation.started_at) {
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

  // Derive session parameters from recommendation
  const durationMinutes = parseDurationMinutes(rec.estimated_duration || '15 دقائق');
  const maxQuestions = deriveQuestionCount(durationMinutes);
  const timeLimitSec = durationMinutes * 60;

  const sessionConfig = {
    max_questions: maxQuestions,
    target_difficulty: rec.difficulty_level || 'mixed',
    target_section_id: targetSectionId,
    time_limit_sec: timeLimitSec,
  };

  // Create training session via smart training pipeline with recommendation params
  const { data, error } = await supabase.functions.invoke('assemble-adaptive-training', {
    body: {
      exam_template_id: examTemplateId,
      max_questions: maxQuestions,
      // Recommendation-specific parameters
      target_difficulty: rec.difficulty_level || 'mixed',
      target_section_id: targetSectionId,
      time_limit_override_sec: timeLimitSec,
      recommendation_type: rec.recommendation_type,
    },
  });

  if (error || data?.error) {
    // Check for insufficient balance (402)
    if (data?.required !== undefined && data?.current !== undefined) {
      return {
        success: false,
        error: data.error || 'رصيد النقاط غير كافٍ',
        insufficientBalance: {
          required: data.required,
          current: data.current,
        },
      };
    }
    return { success: false, error: data?.error || 'فشل في إنشاء جلسة التدريب' };
  }

  const sessionId = data.session_id;

  // Consistency guard: verify the created session matches expected config
  const actualMaxQuestions = data.max_questions;
  const actualPoolSize = data.pool_size;
  if (actualMaxQuestions && actualMaxQuestions !== maxQuestions) {
    console.warn(
      `[RecommendationConsistency] max_questions mismatch: expected=${maxQuestions}, actual=${actualMaxQuestions}`
    );
  }
  if (actualPoolSize && actualPoolSize < maxQuestions) {
    console.warn(
      `[RecommendationConsistency] pool smaller than target: pool=${actualPoolSize}, target=${maxQuestions}`
    );
  }

  // Mark recommendation as started
  await supabase
    .from('student_training_recommendations')
    .update({
      started_at: new Date().toISOString(),
      training_session_id: sessionId,
    } as any)
    .eq('id', recommendation.id);

  return { success: true, sessionId, sessionConfig };
}
