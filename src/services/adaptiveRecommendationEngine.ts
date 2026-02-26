import { supabase } from '@/integrations/supabase/client';
import type { TrainingRecommendation } from './trainingRecommendationEngine';

export interface RecommendationHistoryEntry {
  weakness_key: string;
  recommendation_type: string;
  target_section: string | null;
  difficulty: string | null;
  result_score: number | null;
  improvement_delta: number | null;
  completed_at: string;
}

export interface AdaptiveContext {
  history: RecommendationHistoryEntry[];
  consecutiveCounts: Record<string, number>;
}

/**
 * Load recommendation history for adaptive decision-making.
 */
export async function loadAdaptiveContext(studentId: string): Promise<AdaptiveContext> {
  const { data: history } = await supabase
    .from('student_recommendation_history' as any)
    .select('weakness_key, recommendation_type, target_section, difficulty, result_score, improvement_delta, completed_at')
    .eq('student_id', studentId)
    .order('completed_at', { ascending: false })
    .limit(20);

  // Load current consecutive counts
  const { data: currentRecs } = await supabase
    .from('student_training_recommendations')
    .select('weakness_key, consecutive_count' as any)
    .eq('student_id', studentId)
    .eq('is_completed', false);

  const consecutiveCounts: Record<string, number> = {};
  if (currentRecs) {
    for (const r of currentRecs as any[]) {
      consecutiveCounts[r.weakness_key] = r.consecutive_count || 1;
    }
  }

  return {
    history: (history as any[] || []) as RecommendationHistoryEntry[],
    consecutiveCounts,
  };
}

/**
 * Analyze trend for a specific weakness key from history.
 * Returns: 'improving' | 'declining' | 'stagnant' | 'unknown'
 */
function analyzeTrend(
  weaknessKey: string,
  history: RecommendationHistoryEntry[]
): 'improving' | 'declining' | 'stagnant' | 'unknown' {
  const entries = history
    .filter(h => h.weakness_key === weaknessKey && h.result_score != null)
    .slice(0, 3); // Last 3 completed trainings

  if (entries.length < 2) return 'unknown';

  const deltas = entries
    .filter(e => e.improvement_delta != null)
    .map(e => e.improvement_delta!);

  if (deltas.length === 0) return 'unknown';

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  if (avgDelta > 3) return 'improving';
  if (avgDelta < -2) return 'declining';
  return 'stagnant';
}

/**
 * Count how many times the same recommendation type was given consecutively
 * for a weakness key.
 */
function getConsecutiveSameType(
  weaknessKey: string,
  recType: string,
  history: RecommendationHistoryEntry[]
): number {
  const entries = history.filter(h => h.weakness_key === weaknessKey);
  let count = 0;
  for (const e of entries) {
    if (e.recommendation_type === recType) count++;
    else break; // Stop at first different type
  }
  return count;
}

/**
 * Apply adaptive rules to modify recommendations based on training outcomes.
 */
export function applyAdaptiveRules(
  recommendations: TrainingRecommendation[],
  context: AdaptiveContext
): TrainingRecommendation[] {
  return recommendations.map(rec => {
    const trend = analyzeTrend(rec.weakness_key, context.history);
    const consecutiveSameType = getConsecutiveSameType(
      rec.weakness_key,
      rec.recommendation_type,
      context.history
    );

    // Rule 1: If improving → continue same path (no change needed)
    if (trend === 'improving') {
      return rec;
    }

    // Rule 2: If stagnant/declining after 2+ same type → switch strategy
    if ((trend === 'stagnant' || trend === 'declining') && consecutiveSameType >= 2) {
      return switchStrategy(rec, context.history);
    }

    // Rule 3: Prevent repeating same recommendation more than 2 times
    if (consecutiveSameType >= 2) {
      return switchStrategy(rec, context.history);
    }

    return rec;
  });
}

/**
 * Switch recommendation strategy when current approach isn't working.
 */
function switchStrategy(
  rec: TrainingRecommendation,
  history: RecommendationHistoryEntry[]
): TrainingRecommendation {
  const switched = { ...rec };

  // Cycle through strategies based on current type
  switch (rec.recommendation_type) {
    case 'focused_skill':
      // Switch to accuracy drill with easier difficulty
      switched.recommendation_type = 'accuracy_drill';
      switched.title = `تدريب دقة: ${rec.target_section_name || 'عام'}`;
      switched.description = 'لم يتحسن أداؤك بالتدريب المركز. جرّب التركيز على الدقة بأسئلة أسهل.';
      switched.reason = 'تغيير تلقائي: لم يُلاحظ تحسن بعد تدريبين متتاليين.';
      switched.difficulty_level = lowerDifficulty(rec.difficulty_level);
      switched.weakness_key = `adaptive:accuracy:${rec.target_section_name || 'general'}`;
      break;

    case 'accuracy_drill':
      // Switch to speed drill
      switched.recommendation_type = 'speed_drill';
      switched.title = `تدريب سرعة: ${rec.target_section_name || 'عام'}`;
      switched.description = 'جرّب تحسين سرعتك مع الحفاظ على الدقة الحالية.';
      switched.reason = 'تغيير تلقائي: تمارين الدقة لم تحقق النتائج المطلوبة.';
      switched.difficulty_level = 'mixed';
      switched.weakness_key = `adaptive:speed:${rec.target_section_name || 'general'}`;
      break;

    case 'speed_drill':
      // Switch to progressive path
      switched.recommendation_type = 'progressive_path';
      switched.title = `مسار تدريجي: ${rec.target_section_name || 'عام'}`;
      switched.description = 'ابدأ من الأسهل وتدرّج للأصعب لبناء الثقة والمهارة.';
      switched.reason = 'تغيير تلقائي: تنويع أسلوب التدريب لتحقيق نتائج أفضل.';
      switched.difficulty_level = 'easy';
      switched.weakness_key = `adaptive:progressive:${rec.target_section_name || 'general'}`;
      break;

    default:
      // Back to focused skill with different difficulty
      switched.recommendation_type = 'focused_skill';
      switched.title = `تدريب مركّز جديد: ${rec.target_section_name || 'عام'}`;
      switched.description = 'إعادة تركيز التدريب بأسلوب مختلف.';
      switched.reason = 'تغيير تلقائي: تنويع المنهج التدريبي.';
      switched.difficulty_level = 'medium';
      switched.weakness_key = `adaptive:focused:${rec.target_section_name || 'general'}`;
      break;
  }

  return switched;
}

function lowerDifficulty(current: TrainingRecommendation['difficulty_level']): TrainingRecommendation['difficulty_level'] {
  if (current === 'hard') return 'medium';
  if (current === 'medium') return 'easy';
  return 'easy';
}

/**
 * Log a completed recommendation to history.
 */
export async function logRecommendationToHistory(
  studentId: string,
  rec: {
    weakness_key: string;
    recommendation_type: string;
    target_section: string | null;
    difficulty: string | null;
    source_exam_id: string | null;
    training_session_id: string | null;
  },
  resultScore: number | null,
  improvementDelta: number | null
): Promise<void> {
  await supabase
    .from('student_recommendation_history' as any)
    .insert({
      student_id: studentId,
      weakness_key: rec.weakness_key,
      recommendation_type: rec.recommendation_type,
      target_section: rec.target_section,
      difficulty: rec.difficulty,
      result_score: resultScore,
      improvement_delta: improvementDelta,
      source_exam_id: rec.source_exam_id,
      training_session_id: rec.training_session_id,
      completed_at: new Date().toISOString(),
    });
}
