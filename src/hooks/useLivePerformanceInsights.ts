import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InsightMessage {
  id: string;
  type: string;
  message: string;
  sectionName?: string;
  questionIndex: number;
}

interface AnswerEvent {
  questionId: string;
  optionId: string;
  questionIndex: number;
  sectionName: string;
  difficulty: string;
  topic: string;
  timestamp: number;
}

interface PatternState {
  totalAnswered: number;
  answerTimestamps: number[];
  difficultyAnswers: Record<string, { total: number; fast: number }>;
  sectionAnswers: Record<string, number>;
  consecutiveSlowCount: number;
  lastInsightAt: number;
  insightCount: number;
}

const INSIGHT_INTERVAL = 5; // Show insight every N questions
const SLOW_THRESHOLD_MS = 45000; // 45 seconds = slow answer
const FAST_THRESHOLD_MS = 5000; // 5 seconds = possibly guessing

/**
 * Hook that monitors exam answers in real-time and generates
 * lightweight performance insights without interrupting exam flow.
 */
export function useLivePerformanceInsights(
  sessionId: string | undefined,
  studentId: string | undefined
) {
  const [insights, setInsights] = useState<InsightMessage[]>([]);
  const patternRef = useRef<PatternState>({
    totalAnswered: 0,
    answerTimestamps: [],
    difficultyAnswers: {},
    sectionAnswers: {},
    consecutiveSlowCount: 0,
    lastInsightAt: 0,
    insightCount: 0,
  });

  const addInsight = useCallback((type: string, message: string, sectionName?: string, questionIndex?: number) => {
    const insight: InsightMessage = {
      id: crypto.randomUUID(),
      type,
      message,
      sectionName,
      questionIndex: questionIndex ?? patternRef.current.totalAnswered,
    };
    
    setInsights(prev => [...prev, insight]);
    
    // Show non-blocking toast
    toast.info(message, {
      duration: 4000,
      position: 'bottom-left',
      className: 'text-sm',
    });

    // Save to DB (fire-and-forget)
    if (sessionId && studentId) {
      supabase
        .from('student_live_insights' as any)
        .insert({
          student_id: studentId,
          exam_session_id: sessionId,
          insight_type: type,
          message,
          section_name: sectionName,
          question_index: questionIndex ?? patternRef.current.totalAnswered,
        })
        .then(({ error }) => {
          if (error) console.warn('[LiveInsights] Save error:', error);
        });
    }

    patternRef.current.lastInsightAt = Date.now();
    patternRef.current.insightCount += 1;
  }, [sessionId, studentId]);

  /**
   * Call this on every answer selection to track patterns.
   */
  const trackAnswer = useCallback((event: AnswerEvent) => {
    const state = patternRef.current;
    state.totalAnswered += 1;
    state.answerTimestamps.push(event.timestamp);

    // Track difficulty
    if (!state.difficultyAnswers[event.difficulty]) {
      state.difficultyAnswers[event.difficulty] = { total: 0, fast: 0 };
    }
    state.difficultyAnswers[event.difficulty].total += 1;

    // Track section
    state.sectionAnswers[event.sectionName] = (state.sectionAnswers[event.sectionName] || 0) + 1;

    // Calculate time spent on this answer
    const prevTimestamp = state.answerTimestamps.length >= 2
      ? state.answerTimestamps[state.answerTimestamps.length - 2]
      : event.timestamp - 15000; // default 15s
    const timeSpent = event.timestamp - prevTimestamp;

    // Track fast answers (possible guessing)
    if (timeSpent < FAST_THRESHOLD_MS) {
      state.difficultyAnswers[event.difficulty].fast += 1;
    }

    // Track slow answers
    if (timeSpent > SLOW_THRESHOLD_MS) {
      state.consecutiveSlowCount += 1;
    } else {
      state.consecutiveSlowCount = 0;
    }

    // Only generate insights at intervals
    if (state.totalAnswered % INSIGHT_INTERVAL !== 0) return;
    if (Date.now() - state.lastInsightAt < 10000) return; // min 10s between insights

    // Pattern detection
    detectPatterns(state, event, addInsight);
  }, [addInsight]);

  return { insights, trackAnswer };
}

function detectPatterns(
  state: PatternState,
  latestEvent: AnswerEvent,
  addInsight: (type: string, message: string, section?: string, idx?: number) => void
) {
  // 1. Slow answering pattern
  if (state.consecutiveSlowCount >= 3) {
    addInsight(
      'slow_pace',
      `⏳ أنت تبطئ في ${latestEvent.sectionName}. حاول التحرك أسرع.`,
      latestEvent.sectionName,
      latestEvent.questionIndex
    );
    state.consecutiveSlowCount = 0;
    return;
  }

  // 2. Guessing pattern (many fast answers)
  const recentTimestamps = state.answerTimestamps.slice(-5);
  if (recentTimestamps.length >= 5) {
    let fastCount = 0;
    for (let i = 1; i < recentTimestamps.length; i++) {
      if (recentTimestamps[i] - recentTimestamps[i - 1] < FAST_THRESHOLD_MS) fastCount++;
    }
    if (fastCount >= 3) {
      addInsight(
        'guessing_pattern',
        '⚡ إجاباتك سريعة جداً. تأكد من قراءة السؤال بعناية.',
        latestEvent.sectionName,
        latestEvent.questionIndex
      );
      return;
    }
  }

  // 3. Difficulty collapse (struggling with hard questions)
  const hardStats = state.difficultyAnswers['hard'];
  if (hardStats && hardStats.total >= 3 && hardStats.fast / hardStats.total > 0.6) {
    addInsight(
      'difficulty_collapse',
      '🎯 الأسئلة الصعبة تحتاج وقتاً أكثر. لا تتسرع فيها.',
      latestEvent.sectionName,
      latestEvent.questionIndex
    );
    return;
  }

  // 4. Good pace encouragement (every 15 questions)
  if (state.totalAnswered % 15 === 0 && state.consecutiveSlowCount === 0) {
    const avgTime = state.answerTimestamps.length >= 2
      ? (state.answerTimestamps[state.answerTimestamps.length - 1] - state.answerTimestamps[0]) / (state.answerTimestamps.length - 1)
      : 0;
    
    if (avgTime > 0 && avgTime < 30000 && avgTime > FAST_THRESHOLD_MS) {
      addInsight(
        'good_pace',
        '✅ وتيرتك ممتازة! استمر بنفس الأداء.',
        latestEvent.sectionName,
        latestEvent.questionIndex
      );
    }
  }
}
