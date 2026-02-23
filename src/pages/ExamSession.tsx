import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Layers,
  HelpCircle,
  Trophy,
  BookOpen,
  RefreshCw,
  Home,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import ExamReview from '@/components/exam/ExamReview';

interface QuestionData {
  id: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  difficulty: string;
  topic: string;
}

interface FullQuestionData extends QuestionData {
  correct_option_id: string;
  explanation?: string;
}

interface SectionSnapshot {
  id: string;
  name_ar: string;
  order: number;
  question_count: number;
  time_limit_sec: number | null;
}

interface ExamSessionData {
  id: string;
  session_type: string;
  status: string;
  exam_snapshot: {
    template: {
      id: string;
      name_ar: string;
      slug: string;
      default_time_limit_sec: number;
    };
    sections: SectionSnapshot[];
  };
  questions_json: Record<string, QuestionData[]>;
  review_questions_json: Record<string, FullQuestionData[]> | null;
  answers_json: Record<string, string>;
  score_json: Record<string, unknown> | null;
  time_limit_sec: number;
  started_at: string;
  expires_at: string | null;
}

/** Safely parse options that may be double-encoded as a JSON string */
function safeParseOptions(options: unknown): { id: string; textAr: string }[] {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

/** Normalize questions_json to ensure options are always arrays */
function normalizeQuestionsJson(questionsJson: Record<string, unknown[]>): Record<string, QuestionData[]> {
  const result: Record<string, QuestionData[]> = {};
  for (const [sectionId, questions] of Object.entries(questionsJson)) {
    result[sectionId] = (questions || []).map((q: any) => ({
      ...q,
      options: safeParseOptions(q.options),
    }));
  }
  return result;
}

export default function ExamSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { refreshWallet } = useAuth();

  const [session, setSession] = useState<ExamSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ message: string; detail?: string } | null>(null);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [scoreData, setScoreData] = useState<Record<string, unknown> | null>(null);
  const [reviewQuestions, setReviewQuestions] = useState<Record<string, FullQuestionData[]> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiresAtRef = useRef<Date | null>(null);
  const serverTimeOffsetRef = useRef<number>(0);
  const attemptTokenRef = useRef<string | null>(null);

  // Load session and call start-exam
  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    
    setLoading(true);
    setErrorState(null);

    try {
      console.log('[ExamSession] Loading session:', sessionId);

      const { data, error } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error || !data) {
        console.error('[ExamSession] Fetch error:', error);
        setErrorState({ 
          message: 'فشل في تحميل الجلسة',
          detail: error?.message || 'الجلسة غير موجودة' 
        });
        setLoading(false);
        return;
      }

      const sessionData = data as unknown as ExamSessionData;

      // Validate essential fields
      if (!sessionData.exam_snapshot?.template?.name_ar || !sessionData.questions_json) {
        console.error('[ExamSession] Missing essential data:', {
          hasSnapshot: !!sessionData.exam_snapshot,
          hasTemplate: !!sessionData.exam_snapshot?.template,
          hasQuestions: !!sessionData.questions_json,
        });
        setErrorState({ 
          message: 'بيانات الجلسة غير مكتملة',
          detail: 'يرجى المحاولة مرة أخرى أو التواصل مع الدعم' 
        });
        setLoading(false);
        return;
      }

      // Normalize options (handle double-encoded JSON strings)
      sessionData.questions_json = normalizeQuestionsJson(
        sessionData.questions_json as unknown as Record<string, unknown[]>
      );

      setSession(sessionData);
      setAnswers((sessionData.answers_json as Record<string, string>) || {});

      if (sessionData.status === 'completed' || sessionData.status === 'submitted') {
        setShowResults(true);
        setScoreData(sessionData.score_json);
        setReviewQuestions(sessionData.review_questions_json || null);
        setLoading(false);
        return;
      }

      if (sessionData.status === 'expired') {
        toast.error('انتهى وقت الاختبار');
        navigate('/app/exams');
        return;
      }

      // Call start-exam (idempotent) to get server-controlled timing
      console.log('[ExamSession] Calling start-exam...');
      const { data: startData, error: startError } = await supabase.functions.invoke('start-exam', {
        body: { session_id: sessionId },
      });

      if (startError) {
        console.error('[ExamSession] start-exam error:', startError);
        setErrorState({ 
          message: 'فشل في بدء الاختبار',
          detail: typeof startError === 'object' ? JSON.stringify(startError) : String(startError)
        });
        setLoading(false);
        return;
      }

      if (!startData?.expires_at || !startData?.attempt_token) {
        console.error('[ExamSession] start-exam missing fields:', startData);
        setErrorState({ 
          message: 'فشل في بدء الاختبار',
          detail: startData?.error || 'استجابة غير مكتملة من الخادم'
        });
        setLoading(false);
        return;
      }

      // Store attempt token in memory only
      attemptTokenRef.current = startData.attempt_token;

      // Calculate server time offset for accurate countdown
      const serverNow = new Date(startData.server_now).getTime();
      const clientNow = Date.now();
      serverTimeOffsetRef.current = serverNow - clientNow;

      const expiresAt = new Date(startData.expires_at);
      expiresAtRef.current = expiresAt;

      const adjustedNow = clientNow + serverTimeOffsetRef.current;
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - adjustedNow) / 1000));
      setTimeLeft(remaining);

      setSession(prev => prev ? {
        ...prev,
        status: 'in_progress',
        started_at: startData.started_at,
        expires_at: startData.expires_at,
      } : null);

      console.log('[ExamSession] Session started, time remaining:', remaining);
      setLoading(false);
    } catch (err) {
      console.error('[ExamSession] Unexpected error:', err);
      setErrorState({ 
        message: 'حدث خطأ غير متوقع',
        detail: err instanceof Error ? err.message : 'يرجى المحاولة مرة أخرى'
      });
      setLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Timer
  useEffect(() => {
    if (showResults || loading || !session || session.status !== 'in_progress' || !expiresAtRef.current) return;

    timerRef.current = setInterval(() => {
      const adjustedNow = Date.now() + serverTimeOffsetRef.current;
      const remaining = Math.max(0, Math.floor((expiresAtRef.current!.getTime() - adjustedNow) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        handleSubmit();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showResults, loading, session]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sections = session?.exam_snapshot?.sections || [];
  const currentSection = sections[currentSectionIdx];
  const currentSectionQuestions = currentSection
    ? (session?.questions_json?.[currentSection.id] || [])
    : [];
  const currentQuestion = currentSectionQuestions[currentQuestionIdx];

  const totalQuestions = sections.reduce(
    (sum, s) => sum + (session?.questions_json?.[s.id]?.length || 0),
    0
  );

  const answeredCount = Object.keys(answers).length;

  const handleSelectAnswer = useCallback(
    (questionId: string, optionId: string) => {
      setAnswers((prev) => {
        const updated = { ...prev, [questionId]: optionId };
        if (sessionId) {
          supabase
            .from('exam_sessions')
            .update({ answers_json: updated as any })
            .eq('id', sessionId)
            .then();
        }
        return updated;
      });
    },
    [sessionId]
  );

  const handleSubmit = useCallback(async () => {
    if (submitting || !session || !sessionId) return;
    setSubmitting(true);

    if (timerRef.current) clearInterval(timerRef.current);

    const idempotencyKey = crypto.randomUUID();

    const { data: result, error } = await supabase.functions.invoke('submit-exam', {
      body: { session_id: sessionId, answers, idempotency_key: idempotencyKey, attempt_token: attemptTokenRef.current },
    });

    if (error || (!result?.score && !result?.expired)) {
      toast.error('فشل في حفظ النتيجة');
      setSubmitting(false);
      return;
    }

    if (result?.expired) {
      toast.error('انتهى وقت الاختبار');
      navigate('/app/exams');
      return;
    }

    setScoreData(result.score);
    setReviewQuestions(result.review_questions || null);
    setShowResults(true);
    setSubmitting(false);
    refreshWallet();
  }, [submitting, session, sessionId, answers, refreshWallet, navigate]);

  // ── Loading State ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error State ──
  if (errorState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6" dir="rtl">
        <div className="text-center max-w-md space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">{errorState.message}</h2>
          {errorState.detail && (
            <p className="text-muted-foreground text-sm">{errorState.detail}</p>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={loadSession} variant="default">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة المحاولة
            </Button>
            <Button onClick={() => navigate('/app/exams')} variant="outline">
              <Home className="h-4 w-4 ml-2" />
              العودة للاختبارات
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  // ── Results View ──
  if (showResults && scoreData) {
    const score = scoreData as {
      total_correct: number;
      total_questions: number;
      total_attempted: number;
      percentage: number;
      section_scores: Record<string, { correct: number; total: number; name: string }>;
    };
    const passed = score.percentage >= 60;

    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" dir="rtl">
        <div className="mx-auto max-w-2xl space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border bg-card p-8 text-center shadow-card"
          >
            <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${passed ? 'bg-success/10' : 'bg-destructive/10'}`}>
              {passed ? (
                <Trophy className="h-10 w-10 text-success" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-destructive" />
              )}
            </div>
            <h1 className="text-2xl font-black">
              {passed ? 'مبروك! اجتزت الاختبار' : 'لم تجتز الاختبار'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {session.exam_snapshot.template.name_ar}
            </p>

            <div className="mt-6 flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-4xl font-black text-primary">{score.percentage}%</p>
                <p className="text-sm text-muted-foreground">النسبة</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-black">{score.total_correct}/{score.total_questions}</p>
                <p className="text-sm text-muted-foreground">الإجابات الصحيحة</p>
              </div>
            </div>
          </motion.div>

          {/* Section breakdown */}
          <div className="rounded-2xl border bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Layers className="h-5 w-5" />
              نتائج الأقسام
            </h2>
            <div className="space-y-3">
              {Object.entries(score.section_scores).map(([sId, s]) => {
                const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
                return (
                  <div key={sId} className="rounded-xl bg-muted/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <span className="text-sm font-mono">{s.correct}/{s.total}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate('/app/exams')}
            >
              <ArrowLeft className="ml-2 h-4 w-4" />
              العودة للاختبارات
            </Button>
            <Button
              className="flex-1"
              onClick={() => setShowReview(true)}
            >
              <BookOpen className="ml-2 h-4 w-4" />
              مراجعة الإجابات
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review View ──
  if (showReview && session) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" dir="rtl">
        <div className="mx-auto max-w-2xl">
          <ExamReview
            sections={sections}
            questionsJson={reviewQuestions || {}}
            answers={answers}
            onBack={() => setShowReview(false)}
          />
        </div>
      </div>
    );
  }

  // ── Exam View ──
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-sm sm:text-base truncate max-w-[200px]">
              {session.exam_snapshot.template.name_ar}
            </h2>
            {currentSection && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Layers className="h-3 w-3" />
                {currentSection.name_ar}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-mono font-bold ${timeLeft < 300 ? 'bg-destructive/10 text-destructive animate-pulse' : 'bg-muted'}`}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="border-b bg-card px-4 py-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              {answeredCount} / {totalQuestions} تم الإجابة
            </span>
            <span>القسم {currentSectionIdx + 1} من {sections.length}</span>
          </div>
          <Progress value={(answeredCount / totalQuestions) * 100} className="h-1.5" />
        </div>
      </div>

      {/* Question area */}
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {currentQuestion ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Question number & text */}
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                    {currentQuestionIdx + 1}
                  </div>
                  <p className="text-lg font-semibold leading-relaxed">
                    {currentQuestion.text_ar}
                  </p>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {(currentQuestion.options || []).map((opt, idx) => {
                  const isSelected = answers[currentQuestion.id] === opt.id;
                  const optionLetters = ['أ', 'ب', 'ج', 'د'];
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectAnswer(currentQuestion.id, opt.id)}
                      className={`w-full flex items-center gap-4 rounded-xl border p-4 text-right transition-all
                        ${isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
                        }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold flex-shrink-0
                        ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {optionLetters[idx] || idx + 1}
                      </div>
                      <span className="font-medium">{opt.textAr}</span>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-primary mr-auto flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="rounded-2xl border bg-card p-12 text-center">
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-bold">لا توجد أسئلة في هذا القسم</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (currentQuestionIdx > 0) {
                setCurrentQuestionIdx(currentQuestionIdx - 1);
              } else if (currentSectionIdx > 0) {
                setCurrentSectionIdx(currentSectionIdx - 1);
                const prevSection = sections[currentSectionIdx - 1];
                const prevCount = session.questions_json?.[prevSection.id]?.length || 0;
                setCurrentQuestionIdx(Math.max(0, prevCount - 1));
              }
            }}
            disabled={currentSectionIdx === 0 && currentQuestionIdx === 0}
          >
            <ChevronRight className="ml-1 h-4 w-4" />
            السابق
          </Button>

          {/* Question dots */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-md px-2">
            {currentSectionQuestions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestionIdx(idx)}
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 transition-all
                  ${idx === currentQuestionIdx
                    ? 'bg-primary w-5'
                    : answers[q.id]
                    ? 'bg-primary/40'
                    : 'bg-muted-foreground/20'
                  }`}
              />
            ))}
          </div>

          {currentSectionIdx === sections.length - 1 &&
          currentQuestionIdx === currentSectionQuestions.length - 1 ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gradient-gold text-gold-foreground font-bold"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              ) : null}
              إنهاء الاختبار
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                if (currentQuestionIdx < currentSectionQuestions.length - 1) {
                  setCurrentQuestionIdx(currentQuestionIdx + 1);
                } else if (currentSectionIdx < sections.length - 1) {
                  setCurrentSectionIdx(currentSectionIdx + 1);
                  setCurrentQuestionIdx(0);
                }
              }}
            >
              التالي
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
