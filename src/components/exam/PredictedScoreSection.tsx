import { motion } from 'framer-motion';
import { Target, TrendingUp, TrendingDown, Shield, AlertTriangle, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface PredictionData {
  predicted_min: number;
  predicted_max: number;
  readiness_level: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  weak_sections: string[];
  strong_sections: string[];
  factors: {
    accuracy_score: number;
    difficulty_handling: number;
    time_efficiency: number;
    consistency_trend: number;
  };
}

interface Props {
  prediction: PredictionData;
}

const readinessConfig = {
  HIGH: { label: 'جاهز للاختبار', color: 'bg-success/10 text-success border-success/30', icon: Shield },
  MEDIUM: { label: 'قريب من الجاهزية', color: 'bg-gold/10 text-gold border-gold/30', icon: TrendingUp },
  LOW: { label: 'يحتاج مزيد من التدريب', color: 'bg-destructive/10 text-destructive border-destructive/30', icon: AlertTriangle },
};

const factorLabels: Record<string, string> = {
  accuracy_score: 'الدقة',
  difficulty_handling: 'التعامل مع الصعوبة',
  time_efficiency: 'كفاءة الوقت',
  consistency_trend: 'الاستمرارية والتحسن',
};

const factorWeights: Record<string, string> = {
  accuracy_score: '40%',
  difficulty_handling: '25%',
  time_efficiency: '20%',
  consistency_trend: '15%',
};

export default function PredictedScoreSection({ prediction }: Props) {
  const readiness = readinessConfig[prediction.readiness_level];
  const ReadinessIcon = readiness.icon;
  const midScore = Math.round((prediction.predicted_min + prediction.predicted_max) / 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl border bg-card p-6 shadow-card space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            🎯 الدرجة المتوقعة في الاختبار الرسمي
            <Sparkles className="h-4 w-4 text-gold" />
          </h2>
          <p className="text-xs text-muted-foreground">تحليل ذكي بناءً على أدائك</p>
        </div>
      </div>

      {/* Score Range */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-4xl font-black font-mono text-primary">
            {prediction.predicted_min}–{prediction.predicted_max}
          </p>
          <p className="text-sm text-muted-foreground mt-1">النطاق المتوقع</p>
        </div>
      </div>

      {/* Progress bar showing mid-score */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span className="font-bold text-foreground">{midScore}%</span>
          <span>100%</span>
        </div>
        <div className="relative">
          <Progress value={midScore} className="h-3" />
          {/* Min-Max range indicator */}
          <div
            className="absolute top-0 h-3 bg-primary/20 rounded-full"
            style={{
              left: `${prediction.predicted_min}%`,
              width: `${prediction.predicted_max - prediction.predicted_min}%`,
            }}
          />
        </div>
      </div>

      {/* Readiness badge */}
      <div className="flex items-center justify-center">
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${readiness.color}`}>
          <ReadinessIcon className="h-4 w-4" />
          {readiness.label}
        </div>
      </div>

      {/* Confidence */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          دقة التنبؤ: <span className="font-bold text-foreground">{Math.round(prediction.confidence * 100)}%</span>
        </p>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-2 pt-2 border-t">
        <p className="text-xs font-semibold text-muted-foreground mb-2">عوامل التقييم</p>
        {Object.entries(prediction.factors).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground flex-1 text-xs">
              {factorLabels[key] || key}
              <span className="text-muted-foreground/60 mr-1">({factorWeights[key]})</span>
            </span>
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  value >= 70 ? 'bg-success' : value >= 50 ? 'bg-gold' : 'bg-destructive'
                }`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="font-mono text-xs font-medium w-8 text-left">{value}%</span>
          </div>
        ))}
      </div>

      {/* Weak & Strong sections */}
      {(prediction.weak_sections.length > 0 || prediction.strong_sections.length > 0) && (
        <div className="space-y-3 pt-2 border-t">
          {prediction.strong_sections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-success mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                نقاط القوة
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prediction.strong_sections.map(s => (
                  <Badge key={s} variant="secondary" className="bg-success/10 text-success border-success/20 text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {prediction.weak_sections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" />
                تحتاج تحسين
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prediction.weak_sections.map(s => (
                  <Badge key={s} variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
