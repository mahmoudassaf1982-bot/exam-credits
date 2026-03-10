import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Zap, RefreshCw, Home } from 'lucide-react';
import AdaptiveQuestionFlow from '@/components/exam/AdaptiveQuestionFlow';
import CATSessionSummary from '@/components/exam/CATSessionSummary';
import { runPostTrainingPipeline } from '@/services/postTrainingPipeline';
import type { CATQuestion, CATSessionState } from '@/services/catAdaptiveEngine';
import type { generateCATSummary } from '@/services/catAdaptiveEngine';

export default function AdaptiveTrainingSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, refreshWallet } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionPool, setQuestionPool] = useState<CATQuestion[]>([]);
  const [answerKeys, setAnswerKeys] = useState<Record<string, { correct_option_id: string; explanation?: string }>>({});
  const [maxQuestions, setMaxQuestions] = useState(20);
  const [examName, setExamName] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<ReturnType<typeof generateCATSummary> | null>(null);

  // Load session data
  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch session to get exam_snapshot
        const { data: session, error: sErr } = await supabase
          .from('exam_sessions')
          .select('id, exam_snapshot, status, score_json, cat_session_json')
          .eq('id', sessionId)
          .single();

        if (sErr || !session) {
          setError('الجلسة غير موجودة');
          setLoading(false);
          return;
        }

        const snapshot = session.exam_snapshot as any;
        setExamName(snapshot?.template?.name_ar || 'تدريب تكيّفي');

        // If already completed, show summary
        if (session.status === 'completed' || session.status === 'submitted') {
          if (session.cat_session_json) {
            const catData = session.cat_session_json as any;
            setSummaryData({
              abilityScore: catData.ability_score || 0,
              accuracyRate: catData.accuracy_rate || 0,
              speedRating: catData.speed_rating || 'متوسط',
              accuracyRating: catData.accuracy_rating || 'متوسط',
              weakTopics: catData.weak_topics || [],
              strongTopics: catData.strong_topics || [],
              difficultyProgression: catData.difficulty_progression || [],
              totalQuestions: catData.per_question_data?.length || 0,
              correctCount: catData.per_question_data?.filter((q: any) => q.is_correct).length || 0,
            });
            setShowSummary(true);
          }
          setLoading(false);
          return;
        }

        // Fetch the pool data from localStorage (set during assembly)
        const poolData = sessionStorage.getItem(`cat-pool-${sessionId}`);
        if (!poolData) {
          setError('بيانات الجلسة غير متوفرة. يرجى بدء جلسة جديدة.');
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(poolData);
        setQuestionPool(parsed.question_pool || []);
        setAnswerKeys(parsed.answer_keys || {});
        setMaxQuestions(parsed.max_questions || 20);
        setLoading(false);
      } catch (err) {
        console.error('[AdaptiveSession] Error:', err);
        setError('حدث خطأ غير متوقع');
        setLoading(false);
      }
    };

    loadSession();
  }, [sessionId]);

  const handleComplete = useCallback(async (
    summary: ReturnType<typeof generateCATSummary>,
    answers: Record<string, string>,
    catState: CATSessionState
  ) => {
    if (submitting || !sessionId || !user) return;
    setSubmitting(true);

    try {
      const { data: result, error: submitErr } = await supabase.functions.invoke('submit-adaptive-training', {
        body: {
          session_id: sessionId,
          answers,
          cat_session_data: {
            answers: catState.answers,
            difficultyProgression: catState.difficultyProgression,
            abilityEstimate: catState.abilityEstimate,
            accuracyRate: catState.accuracyRate,
            avgResponseTimeMs: catState.avgResponseTimeMs,
            topicPerformance: catState.topicPerformance,
          },
        },
      });

      if (submitErr || result?.error) {
        toast.error(result?.error || 'فشل في حفظ النتيجة');
        setSubmitting(false);
        return;
      }

      // Use server-verified summary
      const serverSummary = result.cat_summary;
      if (serverSummary) {
        setSummaryData({
          abilityScore: serverSummary.ability_score,
          accuracyRate: serverSummary.accuracy_rate,
          speedRating: serverSummary.speed_rating,
          accuracyRating: serverSummary.accuracy_rating,
          weakTopics: serverSummary.weak_topics || [],
          strongTopics: serverSummary.strong_topics || [],
          difficultyProgression: serverSummary.difficulty_progression || [],
          totalQuestions: serverSummary.per_question_data?.length || summary.totalQuestions,
          correctCount: serverSummary.per_question_data?.filter((q: any) => q.is_correct).length || summary.correctCount,
        });
      } else {
        setSummaryData(summary);
      }

      setShowSummary(true);
      setSubmitting(false);
      refreshWallet();

      // Clean up session storage
      sessionStorage.removeItem(`cat-pool-${sessionId}`);

      // Run post-training pipeline in background
      const sessionScore = result.score?.percentage || summary.accuracyRate;
      runPostTrainingPipeline(user.id, sessionId, sessionScore)
        .then(() => console.log('[CAT] Post-training pipeline complete'))
        .catch(e => console.error('[CAT] Pipeline error:', e));
    } catch (err) {
      console.error('[CAT] Submit error:', err);
      toast.error('فشل في حفظ النتيجة');
      setSubmitting(false);
    }
  }, [submitting, sessionId, user, refreshWallet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6" dir="rtl">
        <div className="text-center max-w-md space-y-4">
          <Zap className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">{error}</h2>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate('/app/exams')} variant="outline">
              <Home className="h-4 w-4 ml-2" />
              العودة للاختبارات
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showSummary && summaryData) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" dir="rtl">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 text-center">
            <p className="text-sm text-muted-foreground">⚡ تدريب تكيّفي</p>
            <h1 className="text-xl font-black">{examName}</h1>
          </div>
          <CATSessionSummary
            summary={summaryData}
            onBack={() => navigate('/app/exams')}
            onStartSmartTraining={() => navigate('/app/exams')}
          />
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-semibold">جارٍ حفظ النتائج وتحديث التحليلات...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              تدريب تكيّفي
            </h2>
            <span className="text-xs text-muted-foreground">{examName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/exams')}>
            <ArrowLeft className="h-4 w-4 ml-1" />
            خروج
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <AdaptiveQuestionFlow
          questionPool={questionPool}
          answerKeys={answerKeys}
          maxQuestions={maxQuestions}
          onComplete={handleComplete}
          onExit={() => navigate('/app/exams')}
        />
      </div>
    </div>
  );
}
