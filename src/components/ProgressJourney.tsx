import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface Session {
  id: string;
  percentage: number;
  completedAt: string;
}

interface Props {
  sessions: Session[];
}

function getTrend(current: number, previous: number | null): 'up' | 'down' | 'stable' {
  if (previous === null) return 'stable';
  const delta = current - previous;
  if (delta > 3) return 'up';
  if (delta < -3) return 'down';
  return 'stable';
}

const dotColors = {
  up: 'bg-success border-success/30',
  down: 'bg-destructive border-destructive/30',
  stable: 'bg-muted-foreground border-muted-foreground/30',
};

const lineColors = {
  up: 'bg-success/40',
  down: 'bg-destructive/40',
  stable: 'bg-border',
};

export default function ProgressJourney({ sessions }: Props) {
  if (sessions.length < 2) return null;

  const last5 = sessions.slice(0, 5).reverse(); // oldest → newest

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="rounded-2xl border bg-card shadow-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">مسار التقدم</h3>
        <span className="text-[10px] text-muted-foreground mr-auto">آخر {last5.length} جلسات</span>
      </div>

      <div className="flex items-center justify-between gap-1 px-1">
        {last5.map((s, i) => {
          const prev = i > 0 ? last5[i - 1].percentage : null;
          const trend = getTrend(s.percentage, prev);
          const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
          const trendTextColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

          return (
            <div key={s.id} className="flex flex-col items-center gap-1.5 flex-1">
              {/* Score */}
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className={`text-xs font-bold font-mono ${s.percentage >= 60 ? 'text-success' : 'text-destructive'}`}
              >
                {s.percentage}%
              </motion.span>

              {/* Dot + Line */}
              <div className="relative flex items-center justify-center w-full">
                {i > 0 && (
                  <div className={`absolute left-0 right-1/2 h-0.5 ${lineColors[trend]} rounded-full -translate-y-px`} />
                )}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 300 }}
                  className={`relative z-10 h-3 w-3 rounded-full border-2 ${dotColors[trend]}`}
                />
                {i < last5.length - 1 && (
                  <div className={`absolute left-1/2 right-0 h-0.5 ${lineColors[getTrend(last5[i + 1].percentage, s.percentage)]} rounded-full -translate-y-px`} />
                )}
              </div>

              {/* Trend icon */}
              <TrendIcon className={`h-3 w-3 ${trendTextColor}`} />

              {/* Date */}
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                {new Date(s.completedAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
