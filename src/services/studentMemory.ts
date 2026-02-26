import { supabase } from '@/integrations/supabase/client';

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

/**
 * Aggregate all completed sessions for a student into a strength/weakness memory profile.
 * Called after every completed exam/training session.
 */
export async function updateStudentMemory(studentId: string): Promise<MemoryProfile | null> {
  // Fetch all completed sessions
  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('score_json, started_at, completed_at, time_limit_sec')
    .eq('user_id', studentId)
    .in('status', ['completed', 'submitted'])
    .not('score_json', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(50);

  if (!sessions || sessions.length === 0) return null;

  const sectionAccuracy: Record<string, { correct: number; total: number }> = {};
  let totalCorrect = 0;
  let totalQuestions = 0;
  let totalTimeRatio = 0;
  let sessionsWithTime = 0;

  for (const s of sessions) {
    const score = s.score_json as any;
    if (!score) continue;

    totalCorrect += score.total_correct || 0;
    totalQuestions += score.total_questions || 0;

    // Time analysis
    if (s.started_at && s.completed_at && s.time_limit_sec) {
      const elapsed = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
      totalTimeRatio += elapsed / s.time_limit_sec;
      sessionsWithTime++;
    }

    // Section-level aggregation
    const sectionScores = score.section_scores as Record<string, { correct: number; total: number; name: string }> | undefined;
    if (sectionScores) {
      for (const [, sec] of Object.entries(sectionScores)) {
        const key = sec.name || 'unknown';
        if (!sectionAccuracy[key]) sectionAccuracy[key] = { correct: 0, total: 0 };
        sectionAccuracy[key].correct += sec.correct;
        sectionAccuracy[key].total += sec.total;
      }
    }
  }

  // Build strength/weakness maps (section → accuracy %)
  const strengthMap: Record<string, number> = {};
  const weaknessMap: Record<string, number> = {};

  for (const [name, data] of Object.entries(sectionAccuracy)) {
    if (data.total === 0) continue;
    const pct = Math.round((data.correct / data.total) * 100);
    if (pct >= 70) {
      strengthMap[name] = pct;
    } else {
      weaknessMap[name] = pct;
    }
  }

  // Speed profile
  const avgTimeRatio = sessionsWithTime > 0 ? totalTimeRatio / sessionsWithTime : 1;
  const speedProfile = avgTimeRatio < 0.6 ? 'fast' : avgTimeRatio < 0.85 ? 'normal' : 'slow';

  // Overall accuracy
  const accuracyProfile = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const profile: MemoryProfile = {
    strength_map: strengthMap,
    weakness_map: weaknessMap,
    speed_profile: speedProfile,
    accuracy_profile: accuracyProfile,
  };

  // UPSERT
  const { error } = await supabase
    .from('student_memory_profile' as any)
    .upsert(
      {
        student_id: studentId,
        strength_map: strengthMap,
        weakness_map: weaknessMap,
        speed_profile: speedProfile,
        accuracy_profile: accuracyProfile,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'student_id' }
    );

  if (error) {
    console.error('[studentMemory] upsert error:', error);
  }

  return profile;
}

/**
 * Retrieve the current memory profile for a student.
 */
export async function getStudentMemory(studentId: string): Promise<MemoryProfile | null> {
  const { data, error } = await supabase
    .from('student_memory_profile' as any)
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    strength_map: (data as any).strength_map || {},
    weakness_map: (data as any).weakness_map || {},
    speed_profile: (data as any).speed_profile || 'normal',
    accuracy_profile: Number((data as any).accuracy_profile) || 0,
  };
}
