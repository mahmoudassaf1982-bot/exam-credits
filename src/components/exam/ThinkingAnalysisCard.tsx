import { motion } from 'framer-motion';
import { Brain, Lightbulb, AlertTriangle, Zap, Clock, Target } from 'lucide-react';

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

interface Props {
  report: ThinkingReport;
}

const patternLabels: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  rushing: { label: 'تسرّع', icon: Zap, color: 'text-destructive' },
  overthinking: { label: 'تفكير مفرط', icon: Clock, color: 'text-gold' },
  guessing: { label: 'تخمين', icon: AlertTriangle, color: 'text-destructive' },
  fatigue: { label: 'إرهاق', icon: AlertTriangle, color: 'text-gold' },
  difficulty_collapse: { label: 'تراجع مع الصعوبة', icon: Target, color: 'text-destructive' },
  multi_step_breakdown: { label: 'انهيار متسلسل', icon: AlertTriangle, color: 'text-destructive' },
};

export default function ThinkingAnalysisCard({ report }: Props) {
  const avgTimeSec = Math.round(report.stats.avg_time_ms / 1000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl border bg-card p-6 shadow-card space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">🧠 تحليل نمط التفكير</h2>
          <p className="text-xs text-muted-foreground">تحليل ذكي لسلوكك أثناء الاختبار</p>
        </div>
      </div>

      {/* Style & Issue */}
      <div className="rounded-xl bg-muted/50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">نمط التفكير</span>
          <span className="text-sm font-bold">{report.thinking_style}</span>
        </div>
        <p className="text-sm text-foreground">{report.main_issue}</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <p className="text-lg font-black font-mono">{avgTimeSec}s</p>
          <p className="text-[10px] text-muted-foreground">متوسط الوقت</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <p className="text-lg font-black font-mono">{report.stats.accuracy_pct}%</p>
          <p className="text-[10px] text-muted-foreground">الدقة</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <p className="text-lg font-black font-mono">{report.stats.hard_accuracy_pct}%</p>
          <p className="text-[10px] text-muted-foreground">دقة الصعب</p>
        </div>
      </div>

      {/* Patterns */}
      {report.patterns_detected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.patterns_detected.map((p) => {
            const cfg = patternLabels[p] || { label: p, icon: AlertTriangle, color: 'text-muted-foreground' };
            const Icon = cfg.icon;
            return (
              <span
                key={p}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.color}`}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          توصيات التحسين
        </div>
        {report.recommendations.map((rec, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
              {idx + 1}
            </span>
            <p className="text-foreground">{rec}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
