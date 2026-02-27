import { motion } from 'framer-motion';
import { Trophy, BookOpen, CheckCircle2, TrendingUp, TrendingDown, BarChart3, Dna, Gauge } from 'lucide-react';
import type { LearningDNA } from '@/services/learningDNAEngine';
import { dnaLabels, trendLabels } from '@/services/learningDNAEngine';

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

interface SessionItem {
  score_json: { percentage: number; total_correct: number; total_questions: number } | null;
}

interface Props {
  dna: LearningDNA | null;
  memory: MemoryProfile | null;
  sessions: SessionItem[];
}

export default function OverviewSummary({ dna, memory, sessions }: Props) {
  const completed = sessions.filter(s => s.score_json);
  const totalCorrect = completed.reduce((sum, s) => sum + (s.score_json?.total_correct || 0), 0);
  const totalQ = completed.reduce((sum, s) => sum + (s.score_json?.total_questions || 0), 0);
  const avgPct = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const passCount = completed.filter(s => (s.score_json?.percentage || 0) >= 60).length;

  const dnaLabel = dna ? dnaLabels[dna.dna_type as keyof typeof dnaLabels] || dnaLabels.balanced : null;
  const trend = dna ? trendLabels[dna.trend_direction as keyof typeof trendLabels] || trendLabels.stable : null;

  const cards = [
    {
      icon: Trophy,
      value: `${avgPct}%`,
      label: 'المعدل العام',
      color: avgPct >= 60 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
    },
    {
      icon: BookOpen,
      value: `${completed.length}`,
      label: 'اختبار مكتمل',
      color: 'bg-primary/10 text-primary',
    },
    {
      icon: CheckCircle2,
      value: `${totalCorrect}/${totalQ}`,
      label: 'إجابات صحيحة',
      color: 'bg-success/10 text-success',
    },
    {
      icon: Gauge,
      value: memory ? `${memory.accuracy_profile}%` : '—',
      label: 'دقة الأداء',
      color: 'bg-info/10 text-info',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border bg-card p-4 shadow-card text-center"
          >
            <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-xl font-black">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* DNA + Strengths/Weaknesses summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        {dna && dnaLabel && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border bg-card p-5 shadow-card"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{dnaLabel.emoji}</span>
              <div>
                <h3 className="font-bold text-foreground">{dnaLabel.label}</h3>
                <p className="text-xs text-muted-foreground">{dnaLabel.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">المستوى {dna.evolution_stage}</span>
              <span className={`flex items-center gap-1 font-medium ${dna.trend_direction === 'improving' ? 'text-success' : dna.trend_direction === 'declining' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {dna.trend_direction === 'improving' ? <TrendingUp className="h-3.5 w-3.5" /> : dna.trend_direction === 'declining' ? <TrendingDown className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
                {trend?.label}
              </span>
              <span className="text-muted-foreground">ثقة: {dna.confidence_score}%</span>
            </div>
          </motion.div>
        )}

        {memory && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border bg-card p-5 shadow-card"
          >
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              ملخص المهارات
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-success font-semibold mb-1">نقاط القوة ({Object.keys(memory.strength_map).length})</p>
                {Object.entries(memory.strength_map).slice(0, 3).map(([name, pct]) => (
                  <p key={name} className="truncate text-muted-foreground">{name}: <span className="font-mono text-success">{pct}%</span></p>
                ))}
              </div>
              <div>
                <p className="text-destructive font-semibold mb-1">نقاط الضعف ({Object.keys(memory.weakness_map).length})</p>
                {Object.entries(memory.weakness_map).slice(0, 3).map(([name, pct]) => (
                  <p key={name} className="truncate text-muted-foreground">{name}: <span className="font-mono text-destructive">{pct}%</span></p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
