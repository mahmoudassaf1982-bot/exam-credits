import { motion } from 'framer-motion';
import { Brain, Clock, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Insight {
  id: string;
  type: string;
  message: string;
  sectionName?: string;
  questionIndex: number;
}

interface Props {
  insights: Insight[];
}

const typeConfig: Record<string, { icon: typeof Brain; color: string }> = {
  slow_pace: { icon: Clock, color: 'text-gold' },
  guessing_pattern: { icon: Zap, color: 'text-destructive' },
  difficulty_collapse: { icon: AlertTriangle, color: 'text-destructive' },
  good_pace: { icon: CheckCircle2, color: 'text-success' },
};

export default function InsightsTimeline({ insights }: Props) {
  if (insights.length === 0) return null;

  // Group by section
  const grouped = insights.reduce<Record<string, Insight[]>>((acc, ins) => {
    const key = ins.sectionName || 'عام';
    if (!acc[key]) acc[key] = [];
    acc[key].push(ins);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border bg-card p-6 shadow-card space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">🧠 رؤى الأداء المباشرة</h2>
          <p className="text-xs text-muted-foreground">
            {insights.length} ملاحظة أثناء الاختبار
          </p>
        </div>
      </div>

      {Object.entries(grouped).map(([sectionName, sectionInsights]) => (
        <div key={sectionName} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground border-b pb-1">
            {sectionName}
          </p>
          {sectionInsights.map((insight, idx) => {
            const config = typeConfig[insight.type] || typeConfig.good_pace;
            const Icon = config.icon;
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-start gap-3 text-sm"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-foreground">{insight.message}</p>
                  <p className="text-xs text-muted-foreground">سؤال #{insight.questionIndex + 1}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      ))}
    </motion.div>
  );
}
