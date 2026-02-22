import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, History, Trophy, AlertTriangle, BookOpen, Clock, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface SessionRow {
  id: string;
  session_type: string;
  status: string;
  exam_snapshot: {
    template: { name_ar: string; slug: string };
  } | null;
  score_json: {
    total_correct: number;
    total_questions: number;
    percentage: number;
  } | null;
  started_at: string;
  completed_at: string | null;
  time_limit_sec: number;
  points_cost: number;
}

const sessionTypeLabels: Record<string, string> = {
  simulation: 'محاكاة',
  practice: 'تدريب',
  analysis: 'تحليل',
};

export default function ExamHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('exam_sessions')
        .select('id, session_type, status, exam_snapshot, score_json, started_at, completed_at, time_limit_sec, points_cost')
        .order('started_at', { ascending: false })
        .limit(50);

      setSessions((data as unknown as SessionRow[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          سجل الاختبارات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">جميع اختباراتك السابقة ونتائجها</p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-lg font-bold">لا توجد اختبارات سابقة</p>
          <p className="text-sm text-muted-foreground mt-1">ابدأ اختبارك الأول من صفحة الاختبارات</p>
          <Button className="mt-4" onClick={() => navigate('/app/exams')}>
            تصفح الاختبارات
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, idx) => {
            const score = s.score_json;
            const passed = score && score.percentage >= 60;
            const examName = s.exam_snapshot?.template?.name_ar || 'اختبار';
            const isCompleted = s.status === 'completed';

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-2xl border bg-card p-4 sm:p-5 shadow-card hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Icon */}
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0 ${
                    !isCompleted
                      ? 'bg-muted text-muted-foreground'
                      : passed
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                  }`}>
                    {!isCompleted ? (
                      <Clock className="h-6 w-6" />
                    ) : passed ? (
                      <Trophy className="h-6 w-6" />
                    ) : (
                      <AlertTriangle className="h-6 w-6" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold truncate">{examName}</h3>
                      <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                        {sessionTypeLabels[s.session_type] || s.session_type}
                      </span>
                      {!isCompleted && (
                        <span className="text-xs rounded-full bg-warning/10 text-warning px-2 py-0.5 font-medium">
                          قيد التنفيذ
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(s.started_at)}
                      {s.points_cost > 0 && ` · ${s.points_cost} نقطة`}
                    </p>
                    {isCompleted && score && (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={score.percentage} className="h-1.5 flex-1 max-w-[150px]" />
                        <span className="text-sm font-mono font-bold">
                          {score.percentage}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({score.total_correct}/{score.total_questions})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    {isCompleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/app/exam-session/${s.id}`)}
                      >
                        <BookOpen className="ml-1 h-4 w-4" />
                        مراجعة
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => navigate(`/app/exam-session/${s.id}`)}
                      >
                        متابعة
                        <ChevronLeft className="mr-1 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
