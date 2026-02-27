import { motion } from 'framer-motion';
import { History, Clock, Target, Trophy, TrendingUp, Zap, BookOpen } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';

interface SessionItem {
  id: string;
  session_type: string;
  score_json: {
    total_correct: number;
    total_questions: number;
    percentage: number;
  } | null;
  completed_at: string | null;
  started_at: string;
  time_limit_sec: number;
  exam_snapshot: {
    template: { name_ar: string };
    practice_mode?: string;
    target_section_name?: string;
  } | null;
}

interface Props {
  sessions: SessionItem[];
}

const modeLabels: Record<string, string> = {
  practice: 'تدريب',
  simulation: 'محاكاة',
  training: 'تدريب ذكي',
  diagnostic: 'تشخيصي',
};

export default function TrainingHistoryList({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <History className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">لا يوجد سجل تدريبات بعد</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
      <div className="p-5 border-b flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-lg">سجل التدريبات والاختبارات</h2>
        <span className="text-xs text-muted-foreground mr-auto">{sessions.length} جلسة</span>
      </div>
      <div className="divide-y max-h-[500px] overflow-y-auto">
        {sessions.map((s, i) => {
          const pct = s.score_json?.percentage ?? 0;
          const passed = pct >= 60;
          const elapsed = s.completed_at && s.started_at
            ? Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000)
            : null;
          const section = s.exam_snapshot?.target_section_name;
          const mode = modeLabels[s.session_type] || s.session_type;

          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                to={`/app/exam-session/${s.id}`}
                className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  {passed ? <Trophy className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.exam_snapshot?.template?.name_ar || 'اختبار'}
                    {section && <span className="text-muted-foreground"> · {section}</span>}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium">{mode}</span>
                    {elapsed && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {elapsed} د
                      </span>
                    )}
                    <span>
                      {s.completed_at ? new Date(s.completed_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Progress value={pct} className="h-1.5 w-14" />
                  <span className={`text-sm font-bold font-mono ${passed ? 'text-success' : 'text-destructive'}`}>
                    {pct}%
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
