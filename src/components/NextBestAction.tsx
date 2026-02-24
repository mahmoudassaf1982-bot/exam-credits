import { TrendingUp, Target, AlertTriangle, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

interface SectionBreakdown {
  section_id: string;
  section_name: string;
  skill_score: number;
  weight: number;
  weighted_contribution: number;
}

interface Props {
  predictedScore: number;
  confidenceLevel: string;
  sectionBreakdown: SectionBreakdown[];
  targetScore?: number;
}

function computeNBA({ predictedScore, confidenceLevel, sectionBreakdown, targetScore = 60 }: Props) {
  if (!sectionBreakdown || sectionBreakdown.length === 0) return null;

  // Rule 1: Low confidence → diagnostic
  if (confidenceLevel === 'low') {
    return {
      icon: BookOpen,
      color: 'text-primary',
      bg: 'bg-primary/10',
      message: 'ابدأ بجلسة تدريب تشخيصية لتحديد مستواك في كل قسم.',
      action: 'ابدأ تدريب تشخيصي',
    };
  }

  // Rule 2: Any section < 40% → prioritize immediately
  const criticalSection = [...sectionBreakdown].sort((a, b) => a.skill_score - b.skill_score)[0];
  if (criticalSection && criticalSection.skill_score < 40) {
    return {
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      message: `قسم "${criticalSection.section_name}" يحتاج تركيز فوري (${criticalSection.skill_score}%). أكمل 3 جلسات تدريب عليه.`,
      action: 'ركّز على القسم الأضعف',
    };
  }

  // Rule 3: predicted < target → focus on weakest high-weight section
  if (predictedScore < targetScore) {
    // Sort by "improvement potential" = weight * (100 - skill_score)
    const bestTarget = [...sectionBreakdown].sort(
      (a, b) => b.weight * (100 - b.skill_score) - a.weight * (100 - a.skill_score)
    )[0];

    if (bestTarget) {
      const sessionsNeeded = bestTarget.skill_score < 50 ? 3 : 2;
      return {
        icon: Target,
        color: 'text-gold',
        bg: 'bg-gold/10',
        message: `أسرع تحسّن لدرجتك عبر قسم "${bestTarget.section_name}" (${bestTarget.skill_score}%، وزنه ${bestTarget.weight}%). أكمل ${sessionsNeeded} جلسات تدريب.`,
        action: 'حسّن أضعف قسم',
      };
    }
  }

  // Rule 4: On track
  return {
    icon: TrendingUp,
    color: 'text-success',
    bg: 'bg-success/10',
    message: 'أداؤك جيد! استمر بالتدريب للحفاظ على مستواك وتعزيز الأقسام المتوسطة.',
    action: 'استمر بالتدريب',
  };
}

export function NextBestAction(props: Props) {
  const nba = computeNBA(props);
  if (!nba) return null;

  const Icon = nba.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="flex items-start gap-3 rounded-xl border bg-card p-3"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${nba.bg} ${nba.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-foreground">🎯 الخطوة التالية</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{nba.message}</p>
      </div>
    </motion.div>
  );
}
