import { motion } from 'framer-motion';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Sparkles } from 'lucide-react';
import type { LearningDNA } from '@/services/learningDNAEngine';

interface Props {
  dna: LearningDNA | null;
  avgPercentage: number;
  completedSessions: number;
}

function getInsightMessage(dna: LearningDNA | null, avgPct: number, sessions: number): { message: string; icon: typeof Brain; tone: 'success' | 'warning' | 'info' } {
  if (!dna || sessions === 0) {
    return { message: '🚀 أكمل أول اختبار لتحصل على تحليل ذكي لأسلوب تعلمك!', icon: Sparkles, tone: 'info' };
  }

  const { dna_type, trend_direction, confidence_score } = dna;

  // Declining trend — priority warning
  if (trend_direction === 'declining') {
    if (dna_type === 'fast_executor') {
      return { message: '⚠️ أداؤك يتراجع بسبب التسرع. جرّب تدريباً مركّزاً على الدقة.', icon: AlertTriangle, tone: 'warning' };
    }
    return { message: '⚠️ الأداء يحتاج دعم. جرّب تدريباً قصيراً مركّزاً لاستعادة الزخم.', icon: AlertTriangle, tone: 'warning' };
  }

  // Improving trend
  if (trend_direction === 'improving') {
    if (dna_type === 'fast_executor') {
      return { message: '🧠 أداؤك يتحسن في السرعة لكن تحتاج تثبيت الدقة. استمر!', icon: TrendingUp, tone: 'success' };
    }
    if (dna_type === 'cautious' || dna_type === 'accuracy_focused') {
      return { message: '📈 تحسن واضح! دقتك ممتازة وسرعتك تتطور.', icon: TrendingUp, tone: 'success' };
    }
    if (dna_type === 'adaptive') {
      return { message: '🧬 رائع! أنت تتكيّف بسرعة مع كل تدريب. أداء متميز.', icon: TrendingUp, tone: 'success' };
    }
    return { message: '📈 تحسن واضح بعد آخر جلسات التدريب. استمر بنفس الوتيرة!', icon: TrendingUp, tone: 'success' };
  }

  // Stable trend
  if (avgPct >= 70) {
    return { message: '✨ أداؤك مستقر وممتاز. حان وقت التحدي الأعلى!', icon: Sparkles, tone: 'info' };
  }
  if (avgPct >= 50) {
    return { message: '⚡ الأداء مستقر. جرّب تدريباً قصيراً مركّزاً على نقاط الضعف.', icon: Brain, tone: 'info' };
  }
  return { message: '💡 استمر بالتدريب المنتظم لتحسين مستواك. كل جلسة تقربك من هدفك.', icon: Brain, tone: 'info' };
}

const toneStyles = {
  success: 'from-success/8 to-success/3 border-success/20',
  warning: 'from-gold/10 to-gold/3 border-gold/20',
  info: 'from-primary/8 to-primary/3 border-primary/15',
};

const iconBg = {
  success: 'bg-success/15 text-success',
  warning: 'bg-gold/15 text-gold',
  info: 'bg-primary/15 text-primary',
};

export default function SmartInsightHeader({ dna, avgPercentage, completedSessions }: Props) {
  const { message, icon: Icon, tone } = getInsightMessage(dna, avgPercentage, completedSessions);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`relative rounded-2xl border bg-gradient-to-l ${toneStyles[tone]} p-4 sm:p-5 overflow-hidden`}
    >
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg[tone]} flex-shrink-0`}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-sm sm:text-base font-medium text-foreground leading-relaxed"
        >
          {message}
        </motion.p>
      </div>
      {/* Subtle decorative element */}
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
    </motion.div>
  );
}
