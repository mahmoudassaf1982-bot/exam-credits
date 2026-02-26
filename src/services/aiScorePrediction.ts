import { supabase } from '@/integrations/supabase/client';

interface SectionScore {
  correct: number;
  total: number;
  name: string;
}

interface ScoreJson {
  total_correct: number;
  total_questions: number;
  total_attempted: number;
  percentage: number;
  section_scores: Record<string, SectionScore>;
}

interface PredictionResult {
  predicted_min: number;
  predicted_max: number;
  readiness_level: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  weak_sections: string[];
  strong_sections: string[];
  factors: {
    accuracy_score: number;
    difficulty_handling: number;
    time_efficiency: number;
    consistency_trend: number;
  };
}

/**
 * Calculate weighted prediction of real exam score based on session performance data.
 * 
 * Weights:
 *  - Accuracy (40%): raw correct/total ratio
 *  - Difficulty handling (25%): performance on hard vs easy questions
 *  - Time efficiency (20%): completion rate and time pressure handling
 *  - Consistency/trend (15%): improvement over recent sessions
 */
export async function predictRealExamScore(
  studentId: string,
  examSessionId: string,
  examTemplateId: string,
  currentScore: ScoreJson
): Promise<PredictionResult> {
  // 1. Accuracy score (40%)
  const accuracyScore = currentScore.total_questions > 0
    ? (currentScore.total_correct / currentScore.total_questions) * 100
    : 0;

  // 2. Difficulty handling (25%) — analyze section-level performance variance
  const sectionScores = Object.values(currentScore.section_scores || {});
  let difficultyHandling = accuracyScore; // fallback
  if (sectionScores.length > 0) {
    const sectionPcts = sectionScores
      .filter(s => s.total > 0)
      .map(s => (s.correct / s.total) * 100);
    if (sectionPcts.length > 0) {
      const avg = sectionPcts.reduce((a, b) => a + b, 0) / sectionPcts.length;
      const variance = sectionPcts.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / sectionPcts.length;
      const stdDev = Math.sqrt(variance);
      // Low variance = good difficulty handling; high variance = struggles with harder sections
      difficultyHandling = Math.max(0, Math.min(100, avg - (stdDev * 0.5)));
    }
  }

  // 3. Time efficiency (20%) — based on completion rate
  const completionRate = currentScore.total_questions > 0
    ? (currentScore.total_attempted / currentScore.total_questions) * 100
    : 0;
  const timeEfficiency = completionRate; // completed all = good time management

  // 4. Consistency/trend (15%) — fetch recent sessions for trend
  let consistencyTrend = accuracyScore;
  let historicalCount = 0;
  try {
    const { data: recentSessions } = await supabase
      .from('exam_sessions')
      .select('score_json, completed_at')
      .eq('user_id', studentId)
      .eq('exam_template_id', examTemplateId)
      .in('status', ['completed', 'submitted'])
      .not('score_json', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);

    if (recentSessions && recentSessions.length > 1) {
      historicalCount = recentSessions.length;
      const percentages = recentSessions
        .map(s => (s.score_json as any)?.percentage as number)
        .filter(p => typeof p === 'number');
      
      if (percentages.length >= 2) {
        // Recent trend: compare last 3 to earlier ones
        const recent = percentages.slice(0, Math.min(3, percentages.length));
        const earlier = percentages.slice(Math.min(3, percentages.length));
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlierAvg = earlier.length > 0
          ? earlier.reduce((a, b) => a + b, 0) / earlier.length
          : recentAvg;
        
        // Improving trend gives bonus, declining gives penalty
        const trendDelta = recentAvg - earlierAvg;
        consistencyTrend = Math.max(0, Math.min(100, recentAvg + (trendDelta * 0.3)));
      }
    }
  } catch (e) {
    console.warn('[predictRealExamScore] Could not fetch historical data:', e);
  }

  // Weighted composite score
  const weightedScore =
    accuracyScore * 0.40 +
    difficultyHandling * 0.25 +
    timeEfficiency * 0.20 +
    consistencyTrend * 0.15;

  // Prediction range: ±3-8% depending on confidence
  const confidence = calculateConfidence(historicalCount, currentScore.total_questions, completionRate);
  const margin = confidence >= 0.7 ? 3 : confidence >= 0.4 ? 5 : 8;
  
  const predictedMin = Math.max(0, Math.round(weightedScore - margin));
  const predictedMax = Math.min(100, Math.round(weightedScore + margin));

  // Readiness level
  const readinessLevel: 'HIGH' | 'MEDIUM' | 'LOW' =
    weightedScore >= 70 && confidence >= 0.5 ? 'HIGH' :
    weightedScore >= 50 ? 'MEDIUM' : 'LOW';

  // Weak & strong sections
  const weakSections = sectionScores
    .filter(s => s.total > 0 && (s.correct / s.total) < 0.6)
    .map(s => s.name);
  const strongSections = sectionScores
    .filter(s => s.total > 0 && (s.correct / s.total) >= 0.75)
    .map(s => s.name);

  return {
    predicted_min: predictedMin,
    predicted_max: predictedMax,
    readiness_level: readinessLevel,
    confidence: Math.round(confidence * 100) / 100,
    weak_sections: weakSections,
    strong_sections: strongSections,
    factors: {
      accuracy_score: Math.round(accuracyScore),
      difficulty_handling: Math.round(difficultyHandling),
      time_efficiency: Math.round(timeEfficiency),
      consistency_trend: Math.round(consistencyTrend),
    },
  };
}

function calculateConfidence(
  historicalCount: number,
  totalQuestions: number,
  completionRate: number
): number {
  // More history = higher confidence
  const historyFactor = Math.min(1, historicalCount / 8) * 0.4;
  // More questions = higher confidence  
  const questionFactor = Math.min(1, totalQuestions / 50) * 0.3;
  // Higher completion = higher confidence
  const completionFactor = (completionRate / 100) * 0.3;
  
  return Math.min(0.95, historyFactor + questionFactor + completionFactor);
}

/**
 * Save prediction to DB (UPSERT by exam_session_id)
 */
export async function savePrediction(
  studentId: string,
  examSessionId: string,
  examTemplateId: string,
  prediction: PredictionResult
) {
  const { error } = await supabase
    .from('student_score_predictions' as any)
    .upsert(
      {
        student_id: studentId,
        exam_session_id: examSessionId,
        exam_template_id: examTemplateId,
        predicted_min: prediction.predicted_min,
        predicted_max: prediction.predicted_max,
        readiness_level: prediction.readiness_level,
        confidence: prediction.confidence,
        weak_sections: prediction.weak_sections,
        strong_sections: prediction.strong_sections,
        factors: prediction.factors,
      },
      { onConflict: 'exam_session_id' }
    );

  if (error) {
    console.error('[savePrediction] Error:', error);
  }
  return !error;
}
