import { supabase } from '@/integrations/supabase/client';

export type DNAType =
  | 'analytical'
  | 'fast_executor'
  | 'cautious'
  | 'accuracy_focused'
  | 'speed_focused'
  | 'balanced'
  | 'adaptive';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface LearningDNA {
  id: string;
  student_id: string;
  dna_type: DNAType;
  confidence_score: number;
  evolution_stage: number;
  trend_direction: TrendDirection;
  last_updated_at: string;
  history_json: DNASnapshot[];
}

export interface DNASnapshot {
  dna_type: DNAType;
  confidence_score: number;
  trend_direction: TrendDirection;
  stage: number;
  timestamp: string;
  metrics: {
    accuracy: number;
    speed_profile: string;
    sessions_count: number;
  };
}

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

interface SessionData {
  score_json: any;
  started_at: string;
  completed_at: string | null;
  time_limit_sec: number;
  session_type: string;
}

// ─── DNA Labels ───
export const dnaLabels: Record<DNAType, { label: string; emoji: string; description: string }> = {
  analytical: {
    label: 'تحليلي',
    emoji: '🔬',
    description: 'تفكر بعمق وتحلل كل سؤال بدقة',
  },
  fast_executor: {
    label: 'سريع التنفيذ',
    emoji: '⚡',
    description: 'تجيب بسرعة لكن تحتاج تركيز أكثر على الدقة',
  },
  cautious: {
    label: 'حذر ومتأنٍّ',
    emoji: '🛡️',
    description: 'دقيق في إجاباتك لكن تحتاج لتسريع وتيرتك',
  },
  accuracy_focused: {
    label: 'مركّز على الدقة',
    emoji: '🎯',
    description: 'أولويتك هي الإجابة الصحيحة مهما كان الوقت',
  },
  speed_focused: {
    label: 'مركّز على السرعة',
    emoji: '🚀',
    description: 'تنجز بسرعة وتحتاج لموازنة السرعة مع الدقة',
  },
  balanced: {
    label: 'متوازن',
    emoji: '⚖️',
    description: 'توازن جيد بين السرعة والدقة',
  },
  adaptive: {
    label: 'متكيّف',
    emoji: '🧬',
    description: 'يتحسن أداؤك باستمرار بعد كل تدريب',
  },
};

export const trendLabels: Record<TrendDirection, { label: string; icon: string }> = {
  improving: { label: 'في تحسّن', icon: '↑' },
  stable: { label: 'مستقر', icon: '→' },
  declining: { label: 'يحتاج دعم', icon: '↓' },
};

// ─── Smart Insight Generator ───
export function generateDNAInsight(dna: LearningDNA): string {
  const insights: Record<DNAType, Record<TrendDirection, string>> = {
    fast_executor: {
      improving: 'ممتاز! سرعتك عالية وبدأت دقتك تتحسن. استمر.',
      stable: 'أنت سريع لكن تفقد نقاطاً بسبب التسرع. خذ وقتك في القراءة.',
      declining: 'أداؤك يتراجع. حاول التركيز على فهم السؤال قبل الإجابة.',
    },
    cautious: {
      improving: 'رائع! دقتك ممتازة وسرعتك تتحسن.',
      stable: 'دقتك عالية لكن البطء قد يسبب ضغط الوقت. تدرّب على السرعة.',
      declining: 'حافظ على دقتك وحاول تمارين السرعة المركّزة.',
    },
    analytical: {
      improving: 'تحليلك العميق يؤتي ثماره. استمر بنفس النهج.',
      stable: 'تحليلك جيد. جرّب تمارين مختلطة لتعزيز المرونة.',
      declining: 'لا تفرط في التحليل. أحياناً الإجابة البسيطة هي الصحيحة.',
    },
    accuracy_focused: {
      improving: 'دقتك في تحسن مستمر! أضف تمارين سرعة للتوازن.',
      stable: 'دقتك جيدة. حان وقت تحسين إدارة الوقت.',
      declining: 'ركّز على الأقسام الضعيفة بتدريبات مركّزة.',
    },
    speed_focused: {
      improving: 'سرعتك ممتازة وتتحسن. أضف تمارين دقة.',
      stable: 'سريع لكن الدقة بحاجة لتحسين. جرّب التمهّل قليلاً.',
      declining: 'السرعة وحدها لا تكفي. ركّز على الفهم أولاً.',
    },
    balanced: {
      improving: 'أداء متوازن وممتاز! استمر بالتدريب المتنوع.',
      stable: 'أداؤك مستقر ومتوازن. ابحث عن التحدي الأعلى.',
      declining: 'حاول التركيز على الأقسام الأضعف لاستعادة التوازن.',
    },
    adaptive: {
      improving: 'رائع! أنت تتكيّف وتتحسن بسرعة. المنصة تتعلم منك أيضاً.',
      stable: 'أداؤك متكيّف ومستقر. جرّب مستويات صعوبة أعلى.',
      declining: 'التنويع في التدريب سيساعدك على العودة للمسار الصحيح.',
    },
  };

  return insights[dna.dna_type]?.[dna.trend_direction] || 'استمر في التدريب لنتعرف أكثر على أسلوب تعلمك.';
}

// ─── Core DNA Engine ───

/**
 * Compute & upsert Learning DNA for a student.
 * Called after memory update in the post-training pipeline.
 */
export async function updateLearningDNA(studentId: string): Promise<LearningDNA | null> {
  // 1. Load inputs in parallel
  const [memoryRes, sessionsRes, thinkingRes, existingDnaRes] = await Promise.all([
    supabase
      .from('student_memory_profile')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle(),
    supabase
      .from('exam_sessions')
      .select('score_json, started_at, completed_at, time_limit_sec, session_type')
      .eq('user_id', studentId)
      .in('status', ['completed', 'submitted'])
      .not('score_json', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10),
    supabase
      .from('student_thinking_reports')
      .select('report_json')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('student_learning_dna' as any)
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle(),
  ]);

  const memory: MemoryProfile | null = memoryRes.data
    ? {
        strength_map: (memoryRes.data as any).strength_map || {},
        weakness_map: (memoryRes.data as any).weakness_map || {},
        speed_profile: (memoryRes.data as any).speed_profile || 'normal',
        accuracy_profile: Number((memoryRes.data as any).accuracy_profile) || 0,
      }
    : null;

  const sessions: SessionData[] = (sessionsRes.data || []) as any[];
  const thinkingReports = (thinkingRes.data || []).map((d: any) => d.report_json);
  const existingDna = existingDnaRes.data as unknown as LearningDNA | null;

  if (!memory || sessions.length === 0) return existingDna;

  // 2. Detect DNA type
  const detectedType = detectDNAType(memory, sessions, thinkingReports);

  // 3. Calculate confidence (more sessions = higher confidence, max 95)
  const sessionsCount = sessions.length;
  const confidence = Math.min(95, Math.round(20 + sessionsCount * 8));

  // 4. Detect trend from recent sessions
  const trend = detectTrend(sessions);

  // 5. Determine if DNA should change (stability guard: need >=2 consistent sessions)
  let finalType = detectedType;
  let evolutionStage = existingDna?.evolution_stage || 1;
  const history: DNASnapshot[] = existingDna?.history_json || [];

  if (existingDna && existingDna.dna_type !== detectedType) {
    // Check if last snapshot also had different type (2-session consistency check)
    const lastSnapshot = history.length > 0 ? history[history.length - 1] : null;
    if (lastSnapshot && lastSnapshot.dna_type === detectedType) {
      // Two consistent signals → allow evolution
      finalType = detectedType;
      evolutionStage = (existingDna.evolution_stage || 1) + 1;
    } else {
      // Only 1 signal → keep existing, but record snapshot for next check
      finalType = existingDna.dna_type as DNAType;
    }
  }

  // 6. Build snapshot
  const snapshot: DNASnapshot = {
    dna_type: detectedType,
    confidence_score: confidence,
    trend_direction: trend,
    stage: evolutionStage,
    timestamp: new Date().toISOString(),
    metrics: {
      accuracy: memory.accuracy_profile,
      speed_profile: memory.speed_profile,
      sessions_count: sessionsCount,
    },
  };

  // Keep max 20 snapshots
  const updatedHistory = [...history, snapshot].slice(-20);

  // 7. Upsert
  const dnaRow = {
    student_id: studentId,
    dna_type: finalType,
    confidence_score: confidence,
    evolution_stage: evolutionStage,
    trend_direction: trend,
    last_updated_at: new Date().toISOString(),
    history_json: updatedHistory,
  };

  const { data, error } = await supabase
    .from('student_learning_dna' as any)
    .upsert(dnaRow, { onConflict: 'student_id' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[LearningDNA] upsert error:', error);
    return existingDna;
  }

  console.log('[LearningDNA] Updated:', finalType, 'confidence:', confidence, 'stage:', evolutionStage);
  return data as unknown as LearningDNA;
}

/**
 * Detect DNA type from behavioral signals.
 */
function detectDNAType(
  memory: MemoryProfile,
  sessions: SessionData[],
  thinkingReports: any[]
): DNAType {
  const { speed_profile, accuracy_profile } = memory;
  const patterns = thinkingReports.flatMap((r: any) => r?.patterns_detected || []);

  // Check training response (adaptive detection)
  const trainingSessions = sessions.filter((s) => s.session_type === 'training');
  if (trainingSessions.length >= 2) {
    const scores = trainingSessions
      .slice(0, 3)
      .map((s) => (s.score_json as any)?.percentage ?? 0);
    if (scores.length >= 2 && scores[0] > scores[scores.length - 1] + 5) {
      return 'adaptive'; // Improving after training
    }
  }

  // Speed vs accuracy classification
  if (speed_profile === 'fast' && accuracy_profile < 55) return 'fast_executor';
  if (speed_profile === 'fast' && accuracy_profile >= 55 && accuracy_profile < 70) return 'speed_focused';
  if (speed_profile === 'slow' && accuracy_profile >= 75) return 'cautious';
  if (speed_profile === 'slow' && accuracy_profile >= 60) return 'accuracy_focused';

  // Pattern-based detection
  if (patterns.includes('overthinking')) return 'analytical';
  if (patterns.includes('rushing') || patterns.includes('guessing')) return 'fast_executor';

  // Consistency check
  if (accuracy_profile >= 65 && accuracy_profile <= 80 && speed_profile === 'normal') return 'balanced';

  // Default based on primary metric
  if (accuracy_profile >= 70) return 'accuracy_focused';
  if (accuracy_profile < 50) return 'fast_executor';

  return 'balanced';
}

/**
 * Detect trend from recent session scores.
 */
function detectTrend(sessions: SessionData[]): TrendDirection {
  if (sessions.length < 3) return 'stable';

  const recent = sessions.slice(0, 5).map((s) => (s.score_json as any)?.percentage ?? 0);
  if (recent.length < 3) return 'stable';

  // Compare average of first half vs second half (recent first)
  const mid = Math.floor(recent.length / 2);
  const recentAvg = recent.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const olderAvg = recent.slice(mid).reduce((a, b) => a + b, 0) / (recent.length - mid);

  const delta = recentAvg - olderAvg;
  if (delta > 4) return 'improving';
  if (delta < -4) return 'declining';
  return 'stable';
}

/**
 * Fetch existing DNA for display.
 */
export async function getLearningDNA(studentId: string): Promise<LearningDNA | null> {
  const { data, error } = await supabase
    .from('student_learning_dna' as any)
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data as any as LearningDNA;
}
