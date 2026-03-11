import { motion } from 'framer-motion';
import { Trophy, Target, Zap, TrendingUp, TrendingDown, BarChart3, AlertTriangle, Brain, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import type { STESessionSummary } from '@/services/smartTrainingEngine';

interface Props {
  summary: STESessionSummary;
  onStartSmartTraining?: () => void;
  onBack: () => void;
}

export default function SmartSessionSummary({ summary, onStartSmartTraining, onBack }: Props) {
  const abilityColor =
    summary.abilityScore >= 70 ? 'text-success' :
    summary.abilityScore >= 45 ? 'text-gold' : 'text-destructive';

  const deltaIcon = summary.abilityDelta > 0 ? ArrowUpRight :
    summary.abilityDelta < 0 ? ArrowDownRight : Minus;
  const DeltaIcon = deltaIcon;
  const deltaColor = summary.abilityDelta > 0 ? 'text-success' :
    summary.abilityDelta < 0 ? 'text-destructive' : 'text-muted-foreground';

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
        <p className="text-sm text-muted-foreground mb-1">تقدير القدرة التراكمي</p>
        <p className={`text-4xl font-black font-mono ${abilityColor}`}>
          {summary.abilityScore}
          <span className="text-lg text-muted-foreground">/100</span>
        </p>
        
        {/* Ability delta from previous */}
        <div className={`flex items-center justify-center gap-1 mt-2 text-sm font-semibold ${deltaColor}`}>
          <DeltaIcon className="h-4 w-4" />
          <span>
            {summary.abilityDelta > 0 ? '+' : ''}{summary.abilityDelta} عن الجلسة السابقة
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {summary.correctCount}/{summary.totalQuestions} إجابة صحيحة
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border bg-card p-3 text-center"
        >
          <Zap className="h-4 w-4 mx-auto mb-1 text-gold" />
          <p className="text-sm font-bold">{summary.speedRating}</p>
          <p className="text-[10px] text-muted-foreground">السرعة</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border bg-card p-3 text-center"
        >
          <Target className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-sm font-bold">{summary.accuracyRate}%</p>
          <p className="text-[10px] text-muted-foreground">الدقة</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border bg-card p-3 text-center"
        >
          <Brain className="h-4 w-4 mx-auto mb-1 text-info" />
          <p className="text-sm font-bold">{summary.confidencePhase === 'HIGH' ? 'مثبّت' : summary.confidencePhase === 'MEDIUM' ? 'متوسط' : 'أولي'}</p>
          <p className="text-[10px] text-muted-foreground">الثقة</p>
        </motion.div>
      </div>

      {/* Difficulty Progression */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-xl border bg-card p-4"
      >
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          مسار الصعوبة التكيّفي
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

      {/* Weak Sections */}
      {summary.weakSections.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border bg-card p-4"
        >
          <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            أقسام تحتاج تحسين
          </p>
          <div className="space-y-2">
            {summary.weakSections.map(s => (
              <div key={s.sectionId} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1">{s.sectionName}</span>
                <div className="flex items-center gap-2">
                  <Progress value={s.accuracy} className="w-16 h-1.5" />
                  <span className="font-mono text-destructive w-8 text-left">{s.accuracy}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Weak Topics */}
      {summary.weakTopics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-xl border bg-card p-4"
        >
          <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            مواضيع ضعيفة
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
              <Brain className="h-3.5 w-3.5 ml-1" />
              ابدأ جلسة تدريب ذكي جديدة
            </Button>
          )}
        </motion.div>
      )}

      {/* Strong Topics */}
      {summary.strongTopics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
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
