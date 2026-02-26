import { supabase } from '@/integrations/supabase/client';

interface AnswerData {
  questionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  difficulty: string;
  topic: string;
  timeSpentMs: number;
}

interface ThinkingReport {
  thinking_style: string;
  main_issue: string;
  recommendations: string[];
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

const FAST_MS = 8000;
const SLOW_MS = 60000;

/**
 * Analyze the student's thinking patterns from a session's answers.
 * Pure client-side logic — no API calls.
 */
export function analyzeThinkingPattern(answers: AnswerData[]): ThinkingReport {
  if (answers.length === 0) {
    return {
      thinking_style: 'غير محدد',
      main_issue: 'لا توجد بيانات كافية',
      recommendations: ['أكمل المزيد من الأسئلة للحصول على تحليل دقيق.'],
      patterns_detected: [],
      stats: { avg_time_ms: 0, fast_answers_pct: 0, slow_answers_pct: 0, accuracy_pct: 0, hard_accuracy_pct: 0, easy_accuracy_pct: 0 },
    };
  }

  const total = answers.length;
  const correct = answers.filter(a => a.selectedOptionId === a.correctOptionId).length;
  const accuracyPct = Math.round((correct / total) * 100);

  const times = answers.map(a => a.timeSpentMs);
  const avgTime = times.reduce((a, b) => a + b, 0) / total;
  const fastCount = times.filter(t => t < FAST_MS).length;
  const slowCount = times.filter(t => t > SLOW_MS).length;
  const fastPct = Math.round((fastCount / total) * 100);
  const slowPct = Math.round((slowCount / total) * 100);

  // Difficulty breakdown
  const hard = answers.filter(a => a.difficulty === 'hard');
  const easy = answers.filter(a => a.difficulty === 'easy');
  const hardCorrect = hard.filter(a => a.selectedOptionId === a.correctOptionId).length;
  const easyCorrect = easy.filter(a => a.selectedOptionId === a.correctOptionId).length;
  const hardAccuracy = hard.length > 0 ? Math.round((hardCorrect / hard.length) * 100) : -1;
  const easyAccuracy = easy.length > 0 ? Math.round((easyCorrect / easy.length) * 100) : -1;

  // Fatigue detection: compare first half vs second half accuracy
  const mid = Math.floor(total / 2);
  const firstHalf = answers.slice(0, mid);
  const secondHalf = answers.slice(mid);
  const firstAcc = firstHalf.length > 0 ? firstHalf.filter(a => a.selectedOptionId === a.correctOptionId).length / firstHalf.length : 0;
  const secondAcc = secondHalf.length > 0 ? secondHalf.filter(a => a.selectedOptionId === a.correctOptionId).length / secondHalf.length : 0;
  const fatigueDrop = firstAcc - secondAcc;

  // Pattern detection
  const patterns: string[] = [];
  if (fastPct >= 40) patterns.push('rushing');
  if (slowPct >= 30) patterns.push('overthinking');
  if (fastPct >= 30 && accuracyPct < 50) patterns.push('guessing');
  if (fatigueDrop > 0.15) patterns.push('fatigue');
  if (hardAccuracy >= 0 && easyAccuracy >= 0 && easyAccuracy - hardAccuracy > 30) patterns.push('difficulty_collapse');

  // Consecutive wrong on hard
  let consecutiveWrong = 0;
  let maxConsecutiveWrong = 0;
  for (const a of answers) {
    if (a.selectedOptionId !== a.correctOptionId) {
      consecutiveWrong++;
      maxConsecutiveWrong = Math.max(maxConsecutiveWrong, consecutiveWrong);
    } else {
      consecutiveWrong = 0;
    }
  }
  if (maxConsecutiveWrong >= 5) patterns.push('multi_step_breakdown');

  // Determine thinking style
  let thinkingStyle: string;
  let mainIssue: string;

  if (patterns.includes('rushing') || patterns.includes('guessing')) {
    thinkingStyle = '⚡ متسرّع';
    mainIssue = 'تميل للإجابة بسرعة كبيرة مما يؤثر على الدقة.';
  } else if (patterns.includes('overthinking')) {
    thinkingStyle = '🤔 مفرط التفكير';
    mainIssue = 'تقضي وقتاً أطول من اللازم مما يسبب ضغط الوقت.';
  } else if (patterns.includes('fatigue')) {
    thinkingStyle = '😓 يتأثر بالإرهاق';
    mainIssue = 'أداؤك ينخفض بشكل ملحوظ في النصف الثاني من الاختبار.';
  } else if (patterns.includes('difficulty_collapse')) {
    thinkingStyle = '📉 يتراجع مع الصعوبة';
    mainIssue = 'الأسئلة الصعبة تسبب تراجعاً كبيراً في الأداء.';
  } else if (accuracyPct >= 70) {
    thinkingStyle = '🎯 منهجي ومتوازن';
    mainIssue = 'أداءك قوي ومستقر. استمر بنفس النهج.';
  } else {
    thinkingStyle = '📊 بحاجة لتطوير';
    mainIssue = 'هناك فرص تحسين في أكثر من جانب.';
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (patterns.includes('rushing') || patterns.includes('guessing')) {
    recommendations.push('اقرأ كل سؤال مرتين قبل اختيار الإجابة.');
  }
  if (patterns.includes('overthinking')) {
    recommendations.push('حدد وقتاً أقصى لكل سؤال (60 ثانية) وانتقل للتالي.');
  }
  if (patterns.includes('fatigue')) {
    recommendations.push('تدرّب على اختبارات كاملة لزيادة قدرتك على التحمل.');
  }
  if (patterns.includes('difficulty_collapse')) {
    recommendations.push('ركّز على التدريب على الأسئلة الصعبة بشكل منفصل.');
  }
  if (patterns.includes('multi_step_breakdown')) {
    recommendations.push('عند الخطأ المتكرر، توقف وأعد قراءة السؤال بتركيز.');
  }
  if (recommendations.length === 0) {
    recommendations.push('حافظ على وتيرتك الحالية.');
  }
  if (recommendations.length < 3 && accuracyPct < 80) {
    recommendations.push('راجع الأقسام الضعيفة بعد كل اختبار.');
  }
  if (recommendations.length < 3) {
    recommendations.push('استمر في التدريب المنتظم لتعزيز الثقة.');
  }

  return {
    thinking_style: thinkingStyle,
    main_issue: mainIssue,
    recommendations: recommendations.slice(0, 3),
    patterns_detected: patterns,
    stats: {
      avg_time_ms: Math.round(avgTime),
      fast_answers_pct: fastPct,
      slow_answers_pct: slowPct,
      accuracy_pct: accuracyPct,
      hard_accuracy_pct: hardAccuracy >= 0 ? hardAccuracy : 0,
      easy_accuracy_pct: easyAccuracy >= 0 ? easyAccuracy : 0,
    },
  };
}

/**
 * Save thinking report (UPSERT by exam_session_id).
 */
export async function saveThinkingReport(
  studentId: string,
  examSessionId: string,
  report: ThinkingReport
): Promise<boolean> {
  const { error } = await supabase
    .from('student_thinking_reports' as any)
    .upsert(
      {
        student_id: studentId,
        exam_session_id: examSessionId,
        report_json: report,
      },
      { onConflict: 'exam_session_id' }
    );

  if (error) {
    console.error('[thinkingAnalysis] save error:', error);
    return false;
  }
  return true;
}

/**
 * Load existing thinking report for a session.
 */
export async function loadThinkingReport(examSessionId: string): Promise<ThinkingReport | null> {
  const { data, error } = await supabase
    .from('student_thinking_reports' as any)
    .select('report_json')
    .eq('exam_session_id', examSessionId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as any).report_json as ThinkingReport;
}
