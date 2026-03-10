import { motion } from 'framer-motion';
import { Trophy, Target, Zap, TrendingUp, TrendingDown, BarChart3, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface CATSummary {
  abilityScore: number;
  accuracyRate: number;
  speedRating: string;
  accuracyRating: string;
  weakTopics: { topic: string; accuracy: number; attempted: number }[];
  strongTopics: { topic: string; accuracy: number; attempted: number }[];
  difficultyProgression: string[];
  totalQuestions: number;
  correctCount: number;
}

interface Props {
  summary: CATSummary;
  onStartSmartTraining?: () => void;
  onBack: () => void;
}

export default function CATSessionSummary({ summary, onStartSmartTraining, onBack }: Props) {
  const abilityColor =
    summary.abilityScore >= 70 ? 'text-success' :
    summary.abilityScore >= 45 ? 'text-gold' : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Ability Score Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border bg-card p-6 text-center shadow-card"
      >
        <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${
          summary.abilityScore >= 60 ? 'bg-success/10' : 'bg-destructive/10'
        }`}>
          {summary.abilityScore >= 60 ? (
            <Trophy className="h-8 w-8 text-success" />
          ) : (
            <Target className="h-8 w-8 text-destructive" />
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-1">تقدير القدرة التكيّفي</p>
        <p className={`text-4xl font-black font-mono ${abilityColor}`}>
          {summary.abilityScore}
          <span className="text-lg text-muted-foreground">/100</span>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {summary.correctCount}/{summary.totalQuestions} إجابة صحيحة
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border bg-card p-4 text-center"
        >
          <Zap className="h-5 w-5 mx-auto mb-1 text-gold" />
          <p className="text-lg font-bold">{summary.speedRating}</p>
          <p className="text-xs text-muted-foreground">السرعة</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border bg-card p-4 text-center"
        >
          <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{summary.accuracyRating}</p>
          <p className="text-xs text-muted-foreground">الدقة ({summary.accuracyRate}%)</p>
        </motion.div>
      </div>

      {/* Difficulty Progression */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border bg-card p-4"
      >
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          مسار الصعوبة
        </p>
        <div className="flex items-end gap-0.5 h-8">
          {summary.difficultyProgression.map((d, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${
                d === 'easy' ? 'bg-success h-3' :
                d === 'medium' ? 'bg-gold h-5' : 'bg-destructive h-8'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>البداية</span>
          <span>النهاية</span>
        </div>
      </motion.div>

      {/* Weak Skills */}
      {summary.weakTopics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border bg-card p-4"
        >
          <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            نقاط ضعف مكتشفة
          </p>
          <div className="space-y-2">
            {summary.weakTopics.map(t => (
              <div key={t.topic} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1">{t.topic}</span>
                <div className="flex items-center gap-2">
                  <Progress value={t.accuracy} className="w-16 h-1.5" />
                  <span className="font-mono text-destructive w-8 text-left">{t.accuracy}%</span>
                </div>
              </div>
            ))}
          </div>
          {onStartSmartTraining && (
            <Button
              size="sm"
              className="w-full mt-3 gradient-primary text-primary-foreground"
              onClick={onStartSmartTraining}
            >
              <Zap className="h-3.5 w-3.5 ml-1" />
              ابدأ تدريب ذكي على نقاط الضعف
            </Button>
          )}
        </motion.div>
      )}

      {/* Strong Skills */}
      {summary.strongTopics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border bg-card p-4"
        >
          <p className="text-xs font-semibold text-success mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            نقاط قوة
          </p>
          <div className="space-y-2">
            {summary.strongTopics.map(t => (
              <div key={t.topic} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1">{t.topic}</span>
                <span className="font-mono text-success">{t.accuracy}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <Button variant="outline" className="w-full" onClick={onBack}>
        العودة للاختبارات
      </Button>
    </div>
  );
}
