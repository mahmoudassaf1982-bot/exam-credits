import { supabase } from '@/integrations/supabase/client';

export interface TrainingRecommendation {
  recommendation_type: 'focused_skill' | 'accuracy_drill' | 'speed_drill' | 'progressive_path' | 'balanced';
  title: string;
  description: string;
  reason: string;
  goal: string;
  weakness_key: string;
  suggested_training_mode: 'practice';
  difficulty_level: 'easy' | 'medium' | 'hard' | 'mixed';
  estimated_duration: string;
  target_section_name: string | null;
  target_accuracy: number;
  current_accuracy: number;
}

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

interface ThinkingReport {
  thinking_style: string;
  main_issue: string;
  patterns_detected: string[];
  stats: {
    avg_time_ms: number;
    fast_answers_pct: number;
    slow_answers_pct: number;
    accuracy_pct: number;
    hard_accuracy_pct: number;
    easy_accuracy_pct: number;
  };
}

export interface DNAContext {
  dna_type: string;
  trend_direction: string;
  evolution_stage: number;
  confidence_score: number;
}

/**
 * Generate training recommendations based on student weaknesses, thinking patterns, and DNA.
 * Pure logic — no heavy AI calls.
 */
export function generateRecommendations(
  memory: MemoryProfile | null,
  thinkingReport: ThinkingReport | null,
  dna?: DNAContext | null
): TrainingRecommendation[] {
  const recs: TrainingRecommendation[] = [];

  if (!memory) {
    // No data yet → balanced training
    recs.push({
      recommendation_type: 'balanced',
      title: 'تدريب متوازن شامل',
      description: 'ابدأ بتدريب شامل لاكتشاف نقاط قوتك وضعفك.',
      reason: 'لا توجد بيانات كافية بعد لتحديد نقاط الضعف.',
      goal: 'بناء ملف أداء أولي',
      weakness_key: '__balanced__',
      suggested_training_mode: 'practice',
      difficulty_level: 'mixed',
      estimated_duration: '10 دقائق',
      target_section_name: null,
      target_accuracy: 70,
      current_accuracy: 0,
    });
    return recs;
  }

  const patterns = thinkingReport?.patterns_detected || [];
  const isFast = memory.speed_profile === 'fast';
  const isSlow = memory.speed_profile === 'slow';

  // 1) Focused skill training for each weakness < 60%
  const weakEntries = Object.entries(memory.weakness_map)
    .filter(([, pct]) => pct < 60)
    .sort((a, b) => a[1] - b[1]);

  for (const [sectionName, accuracy] of weakEntries) {
    // Determine difficulty based on current accuracy
    let difficulty: TrainingRecommendation['difficulty_level'] = 'mixed';
    if (accuracy < 30) difficulty = 'easy';
    else if (accuracy < 50) difficulty = 'medium';

    recs.push({
      recommendation_type: 'focused_skill',
      title: `تدريب مركّز: ${sectionName}`,
      description: `ركّز على أسئلة ${sectionName} لرفع مستواك من ${accuracy}% إلى 70%.`,
      reason: `لأن دقتك في ${sectionName} هي ${accuracy}% فقط.`,
      goal: `الهدف: رفع الدقة إلى 70%`,
      weakness_key: `skill:${sectionName}`,
      suggested_training_mode: 'practice',
      difficulty_level: difficulty,
      estimated_duration: '10 دقائق',
      target_section_name: sectionName,
      target_accuracy: 70,
      current_accuracy: accuracy,
    });
  }

  // 2) Speed + accuracy imbalance
  if (isFast && memory.accuracy_profile < 60) {
    recs.push({
      recommendation_type: 'accuracy_drill',
      title: 'تدريب تحسين الدقة',
      description: 'أنت سريع لكن بحاجة لمزيد من الدقة. خذ وقتك في قراءة الأسئلة.',
      reason: `سرعتك عالية لكن الدقة ${memory.accuracy_profile}% فقط.`,
      goal: `الهدف: رفع الدقة إلى 70% مع الحفاظ على السرعة`,
      weakness_key: 'pattern:accuracy_drill',
      suggested_training_mode: 'practice',
      difficulty_level: 'medium',
      estimated_duration: '15 دقيقة',
      target_section_name: null,
      target_accuracy: 70,
      current_accuracy: memory.accuracy_profile,
    });
  }

  if (isSlow && memory.accuracy_profile >= 70) {
    recs.push({
      recommendation_type: 'speed_drill',
      title: 'تدريب تحسين السرعة',
      description: 'دقتك ممتازة! حاول الإجابة أسرع لتحسين إدارة الوقت.',
      reason: `دقتك ${memory.accuracy_profile}% ممتازة لكن سرعتك بطيئة.`,
      goal: 'الهدف: إنهاء الاختبار في الوقت المحدد',
      weakness_key: 'pattern:speed_drill',
      suggested_training_mode: 'practice',
      difficulty_level: 'mixed',
      estimated_duration: '10 دقائق',
      target_section_name: null,
      target_accuracy: 70,
      current_accuracy: memory.accuracy_profile,
    });
  }

  // 3) Thinking pattern-based recommendations
  if (patterns.includes('guessing') && !recs.find(r => r.recommendation_type === 'accuracy_drill')) {
    recs.push({
      recommendation_type: 'accuracy_drill',
      title: 'تدريب ضد التخمين',
      description: 'تم اكتشاف نمط تخمين. تدرّب على القراءة المتأنية واستبعاد الخيارات.',
      reason: 'تم اكتشاف نمط تخمين في إجاباتك الأخيرة.',
      goal: 'الهدف: تقليل التخمين وزيادة الثقة',
      weakness_key: 'pattern:anti_guessing',
      suggested_training_mode: 'practice',
      difficulty_level: 'easy',
      estimated_duration: '10 دقائق',
      target_section_name: null,
      target_accuracy: 60,
      current_accuracy: thinkingReport?.stats.accuracy_pct || 0,
    });
  }

  if (patterns.includes('fatigue')) {
    recs.push({
      recommendation_type: 'progressive_path',
      title: 'تدريب بناء التحمّل',
      description: 'أداؤك ينخفض مع تقدم الاختبار. تدرّب على جلسات كاملة لبناء القدرة على التحمل.',
      reason: 'تم اكتشاف انخفاض الأداء في النصف الثاني من الاختبار.',
      goal: 'الهدف: الحفاظ على أداء مستقر طوال الاختبار',
      weakness_key: 'pattern:endurance',
      suggested_training_mode: 'practice',
      difficulty_level: 'mixed',
      estimated_duration: '15 دقيقة',
      target_section_name: null,
      target_accuracy: 70,
      current_accuracy: memory.accuracy_profile,
    });
  }

  // 4) Progressive path for repeated weaknesses (weakness between 60-69%)
  const borderlineWeaknesses = Object.entries(memory.weakness_map)
    .filter(([, pct]) => pct >= 60 && pct < 70)
    .sort((a, b) => a[1] - b[1]);

  for (const [sectionName, accuracy] of borderlineWeaknesses) {
    recs.push({
      recommendation_type: 'progressive_path',
      title: `تدريب تدريجي: ${sectionName}`,
      description: `أنت قريب من الإتقان! تدرّب بشكل تدريجي (سهل → متوسط → صعب) لرفع مستواك.`,
      reason: `دقتك في ${sectionName} هي ${accuracy}%، قريبة من المطلوب.`,
      goal: `الهدف: رفع الدقة إلى 80%`,
      weakness_key: `progressive:${sectionName}`,
      suggested_training_mode: 'practice',
      difficulty_level: 'hard',
      estimated_duration: '10 دقائق',
      target_section_name: sectionName,
      target_accuracy: 80,
      current_accuracy: accuracy,
    });
  }

  // ─── DNA-Based Recommendations ───
  if (dna && dna.confidence_score >= 50) {
    const hasDnaRec = (type: string) => recs.some(r => r.weakness_key.startsWith(`dna:${type}`));

    switch (dna.dna_type) {
      case 'fast_executor':
        if (!hasDnaRec('accuracy')) {
          recs.push({
            recommendation_type: 'accuracy_drill',
            title: 'تدريب دقة مخصص لنمطك',
            description: 'نمطك سريع التنفيذ — ركّز على القراءة المتأنية والدقة قبل السرعة.',
            reason: 'بصمة التعلم: سريع التنفيذ. الدقة هي أولويتك الآن.',
            goal: 'رفع الدقة مع الحفاظ على السرعة',
            weakness_key: 'dna:accuracy:fast_executor',
            suggested_training_mode: 'practice',
            difficulty_level: dna.trend_direction === 'declining' ? 'easy' : 'medium',
            estimated_duration: dna.trend_direction === 'declining' ? '10 دقائق' : '15 دقيقة',
            target_section_name: null,
            target_accuracy: 70,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'cautious':
        if (!hasDnaRec('speed')) {
          recs.push({
            recommendation_type: 'speed_drill',
            title: 'تدريب سرعة مخصص لنمطك',
            description: 'نمطك حذر ومتأنٍّ — تدرّب على الإجابة أسرع مع الحفاظ على دقتك.',
            reason: 'بصمة التعلم: حذر ومتأنٍّ. السرعة هي أولويتك الآن.',
            goal: 'تحسين إدارة الوقت',
            weakness_key: 'dna:speed:cautious',
            suggested_training_mode: 'practice',
            difficulty_level: 'mixed',
            estimated_duration: '10 دقائق',
            target_section_name: null,
            target_accuracy: 70,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'analytical':
        if (!hasDnaRec('mixed')) {
          recs.push({
            recommendation_type: 'progressive_path',
            title: 'تدريب تفكير مرن',
            description: 'نمطك تحليلي — جرّب أسئلة مختلطة لتعزيز المرونة وتقليل التحليل الزائد.',
            reason: 'بصمة التعلم: تحليلي. التنويع يعزز المرونة.',
            goal: 'تحسين سرعة اتخاذ القرار',
            weakness_key: 'dna:mixed:analytical',
            suggested_training_mode: 'practice',
            difficulty_level: 'mixed',
            estimated_duration: '15 دقيقة',
            target_section_name: null,
            target_accuracy: 75,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'accuracy_focused':
        if (!hasDnaRec('speed_ramp')) {
          recs.push({
            recommendation_type: 'speed_drill',
            title: 'تدريب سرعة تصاعدي',
            description: 'دقتك ممتازة! جرّب جلسات قصيرة موقوتة لتحسين سرعتك.',
            reason: 'بصمة التعلم: مركّز على الدقة. أضف السرعة للتوازن.',
            goal: 'إنهاء الاختبار في الوقت',
            weakness_key: 'dna:speed_ramp:accuracy_focused',
            suggested_training_mode: 'practice',
            difficulty_level: dna.trend_direction === 'declining' ? 'easy' : 'medium',
            estimated_duration: '10 دقائق',
            target_section_name: null,
            target_accuracy: 70,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'speed_focused':
        if (!hasDnaRec('accuracy_gate')) {
          recs.push({
            recommendation_type: 'accuracy_drill',
            title: 'تدريب بوابة الدقة',
            description: 'سرعتك عالية! يجب تحقيق دقة ≥65% قبل التقدم لمستوى أصعب.',
            reason: 'بصمة التعلم: مركّز على السرعة. الدقة شرط التقدم.',
            goal: 'تحقيق دقة ≥65% للتقدم',
            weakness_key: 'dna:accuracy_gate:speed_focused',
            suggested_training_mode: 'practice',
            difficulty_level: dna.trend_direction === 'declining' ? 'easy' : 'medium',
            estimated_duration: '10 دقائق',
            target_section_name: null,
            target_accuracy: 65,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'adaptive':
        if (!hasDnaRec('progressive')) {
          recs.push({
            recommendation_type: 'progressive_path',
            title: 'تحدّي تصاعدي',
            description: 'أنت متكيّف ومتحسن — جرّب أسئلة أصعب لدفع حدودك.',
            reason: 'بصمة التعلم: متكيّف. الوقت لمستوى أعلى.',
            goal: 'التقدم لمستوى صعوبة أعلى',
            weakness_key: 'dna:progressive:adaptive',
            suggested_training_mode: 'practice',
            difficulty_level: 'hard',
            estimated_duration: '15 دقيقة',
            target_section_name: null,
            target_accuracy: 80,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;

      case 'balanced':
      default:
        if (!hasDnaRec('progressive_balanced')) {
          recs.push({
            recommendation_type: 'progressive_path',
            title: 'تدريب تدريجي متوازن',
            description: 'أداؤك متوازن! استمر بالتدريب المتنوع مع زيادة الصعوبة تدريجياً.',
            reason: 'بصمة التعلم: متوازن. التنوع يحافظ على التقدم.',
            goal: 'الحفاظ على الأداء المتميز',
            weakness_key: 'dna:progressive_balanced:balanced',
            suggested_training_mode: 'practice',
            difficulty_level: 'mixed',
            estimated_duration: '10 دقائق',
            target_section_name: null,
            target_accuracy: 80,
            current_accuracy: memory.accuracy_profile,
          });
        }
        break;
    }
  }

  // ─── Declining trend adjustments ───
  if (dna && dna.trend_direction === 'declining' && dna.confidence_score >= 50) {
    for (const rec of recs) {
      // Shorter sessions
      rec.estimated_duration = '10 دقائق';
      // Lower difficulty by 1 step
      if (rec.difficulty_level === 'hard') rec.difficulty_level = 'medium';
      else if (rec.difficulty_level === 'medium') rec.difficulty_level = 'easy';
    }
  }

  // Fallback: if no weaknesses found
  if (recs.length === 0) {
    recs.push({
      recommendation_type: 'balanced',
      title: 'استمر بالتدريب المتوازن',
      description: 'أداؤك جيد في جميع الأقسام. استمر بالتدريب الشامل للحفاظ على مستواك.',
      reason: 'جميع أقسامك فوق 70% — أحسنت!',
      goal: 'الهدف: الحفاظ على الأداء المتميز',
      weakness_key: '__balanced__',
      suggested_training_mode: 'practice',
      difficulty_level: 'mixed',
      estimated_duration: '10 دقائق',
      target_section_name: null,
      target_accuracy: 85,
      current_accuracy: memory.accuracy_profile,
    });
  }

  // Limit to top 4 most important
  return recs.slice(0, 4);
}

/**
 * Save recommendations to DB (upsert by weakness_key, replacing incomplete ones).
 */
export async function saveRecommendations(
  studentId: string,
  sourceExamId: string | null,
  recommendations: TrainingRecommendation[]
): Promise<boolean> {
  // Build upsert rows with normalised columns
  const rows = recommendations.map(rec => ({
    student_id: studentId,
    source_exam_id: sourceExamId,
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
  }));

  // Upsert on (student_id, weakness_key) — replaces stale recs automatically
  const { error } = await supabase
    .from('student_training_recommendations' as any)
    .upsert(rows, { onConflict: 'student_id,weakness_key' });

  if (error) {
    console.error('[recommendations] save error:', error);
    return false;
  }

  console.log('[recommendations] saved', rows.length, 'recommendations for student', studentId);
  return true;
}

/**
 * Load active (incomplete) recommendations for a student.
 */
export async function loadRecommendations(studentId: string): Promise<TrainingRecommendation[]> {
  const { data, error } = await supabase
    .from('student_training_recommendations' as any)
    .select('recommendation_json')
    .eq('student_id', studentId)
    .eq('is_completed', false)
    .order('created_at', { ascending: false })
    .limit(4);

  if (error || !data) return [];
  return (data as any[]).map(d => d.recommendation_json as TrainingRecommendation);
}

/**
 * Mark a recommendation as completed.
 */
export async function completeRecommendation(studentId: string, weaknessKey: string): Promise<void> {
  await supabase
    .from('student_training_recommendations' as any)
    .update({ is_completed: true })
    .eq('student_id', studentId)
    .eq('weakness_key', weaknessKey)
    .eq('is_completed', false);
}
