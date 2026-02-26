import { supabase } from '@/integrations/supabase/client';
import { updateStudentMemory, getStudentMemory } from './studentMemory';
import { generateRecommendations, saveRecommendations } from './trainingRecommendationEngine';
import { loadAdaptiveContext, applyAdaptiveRules, logRecommendationToHistory } from './adaptiveRecommendationEngine';
import { updateLearningDNA } from './learningDNAEngine';

/**
 * Complete post-training pipeline:
 * 1. Mark recommendation as completed + log to history
 * 2. Update student memory profile
 * 3. Generate new adaptive recommendations
 */
export async function runPostTrainingPipeline(
  studentId: string,
  sessionId: string,
  sessionScore: number | null
): Promise<void> {
  console.log('[PostTraining] Starting pipeline for session', sessionId);

  // 1. Find and complete the recommendation linked to this session
  const { data: linkedRec } = await supabase
    .from('student_training_recommendations')
    .select('*')
    .eq('student_id', studentId)
    .eq('training_session_id', sessionId)
    .eq('is_completed', false)
    .maybeSingle();

  if (linkedRec) {
    const rec = linkedRec as any;
    const oldAccuracy = rec.recommendation_json?.current_accuracy ?? null;
    const improvementDelta = sessionScore != null && oldAccuracy != null
      ? sessionScore - oldAccuracy
      : null;

    // Mark completed
    await supabase
      .from('student_training_recommendations')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        result_score: sessionScore,
        improvement_delta: improvementDelta,
      } as any)
      .eq('id', rec.id);

    // Log to history
    await logRecommendationToHistory(
      studentId,
      {
        weakness_key: rec.weakness_key,
        recommendation_type: rec.recommendation_type,
        target_section: rec.target_section,
        difficulty: rec.difficulty,
        source_exam_id: rec.source_exam_id,
        training_session_id: rec.training_session_id,
      },
      sessionScore,
      improvementDelta
    );

    console.log('[PostTraining] Completed recommendation', rec.weakness_key, 'delta:', improvementDelta);
  }

  // 2. Update student memory
  const memory = await updateStudentMemory(studentId);
  console.log('[PostTraining] Memory updated');

  // 2.5. Update Learning DNA
  await updateLearningDNA(studentId);
  console.log('[PostTraining] Learning DNA updated');

  // 3. Load thinking report (latest)
  const { data: thinkingData } = await supabase
    .from('student_thinking_reports')
    .select('report_json')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const thinkingReport = thinkingData ? (thinkingData.report_json as any) : null;

  // 4. Generate base recommendations
  let recommendations = generateRecommendations(memory, thinkingReport);

  // 5. Apply adaptive rules based on history
  const context = await loadAdaptiveContext(studentId);
  recommendations = applyAdaptiveRules(recommendations, context);

  // 6. Save new recommendations (with consecutive count tracking)
  await saveAdaptiveRecommendations(studentId, sessionId, recommendations, context);

  console.log('[PostTraining] Pipeline complete. Generated', recommendations.length, 'adaptive recommendations');
}

/**
 * Save recommendations with consecutive count tracking.
 */
async function saveAdaptiveRecommendations(
  studentId: string,
  sourceSessionId: string,
  recommendations: import('./trainingRecommendationEngine').TrainingRecommendation[],
  context: import('./adaptiveRecommendationEngine').AdaptiveContext
): Promise<void> {
  const rows = recommendations.map(rec => {
    // Track consecutive count
    const prevCount = context.consecutiveCounts[rec.weakness_key] || 0;
    const consecutiveCount = prevCount + 1;

    return {
      student_id: studentId,
      source_exam_id: sourceSessionId,
      weakness_key: rec.weakness_key,
      recommendation_json: rec,
      recommendation_type: rec.recommendation_type,
      recommended_mode: rec.suggested_training_mode || 'practice',
      target_section: rec.target_section_name || null,
      difficulty: rec.difficulty_level || 'mixed',
      reason_text: rec.reason || '',
      is_completed: false,
      started_at: null,
      completed_at: null,
      training_session_id: null,
      result_score: null,
      improvement_delta: null,
      consecutive_count: consecutiveCount,
    };
  });

  const { error } = await supabase
    .from('student_training_recommendations' as any)
    .upsert(rows, { onConflict: 'student_id,weakness_key' });

  if (error) {
    console.error('[PostTraining] save error:', error);
  }
}
