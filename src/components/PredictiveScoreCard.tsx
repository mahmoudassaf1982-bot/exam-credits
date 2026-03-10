import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, AlertCircle, CheckCircle2, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { NextBestAction } from '@/components/NextBestAction';

interface PredictionData {
  predicted_score: number;
  confidence_level: string;
  calculated_at: string;
  section_breakdown: {
    section_id: string;
    section_name: string;
    skill_score: number;
    weight: number;
    weighted_contribution: number;
  }[];
  training_session_count: number;
  exam_session_count: number;
}

interface Props {
  examTemplateId: string;
}

const confidenceConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  high: { label: 'عالية', color: 'text-success', icon: CheckCircle2 },
  medium: { label: 'متوسطة', color: 'text-gold', icon: BarChart3 },
  low: { label: 'منخفضة', color: 'text-muted-foreground', icon: AlertCircle },
};

export function PredictiveScoreCard({ examTemplateId }: Props) {
  const { user } = useAuth();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('score_predictions')
        .select('*')
        .eq('user_id', user.id)
        .eq('exam_template_id', examTemplateId)
        .single();

      if (data) {
        setPrediction({
          predicted_score: Number(data.predicted_score),
          confidence_level: data.confidence_level,
          calculated_at: data.calculated_at,
          section_breakdown: (data.section_breakdown as any[]) || [],
          training_session_count: data.training_session_count,
          exam_session_count: data.exam_session_count,
        });
      }
      setLoading(false);
    };
    load();
  }, [user, examTemplateId]);

  if (loading || !prediction) return null;

  const conf = confidenceConfig[prediction.confidence_level] || confidenceConfig.low;
  const ConfIcon = conf.icon;
  const scoreColor = prediction.predicted_score >= 60 ? 'text-success' : prediction.predicted_score >= 40 ? 'text-gold' : 'text-destructive';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">الدرجة المتوقعة</p>
            <p className="text-xs text-muted-foreground">
              لو دخلت الاختبار الآن
            </p>
          </div>
        </div>
        <div className="text-left">
          <span className={`text-2xl font-black font-mono ${scoreColor}`}>
            {prediction.predicted_score}%
          </span>
        </div>
      </div>

      <Progress value={prediction.predicted_score} className="h-2" />

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <ConfIcon className={`h-3.5 w-3.5 ${conf.color}`} />
          <span className={`font-medium ${conf.color}`}>
            دقة التنبؤ: {conf.label}
          </span>
        </div>
        <span className="text-muted-foreground">
          {prediction.training_session_count} تدريب · {prediction.exam_session_count} اختبار
        </span>
      </div>

      {prediction.section_breakdown.length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          {prediction.section_breakdown.slice(0, 4).map((s) => (
            <div key={s.section_id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate flex-1">{s.section_name}</span>
              <div className="flex items-center gap-2">
                <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.skill_score >= 60 ? 'bg-success' : s.skill_score >= 40 ? 'bg-gold' : 'bg-destructive'}`}
                    style={{ width: `${s.skill_score}%` }}
                  />
                </div>
                <span className="font-mono font-medium w-8 text-left">{s.skill_score}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Improvement Simulation */}
      <ImprovementSimulation prediction={prediction} />

      <NextBestAction
        predictedScore={prediction.predicted_score}
        confidenceLevel={prediction.confidence_level}
        sectionBreakdown={prediction.section_breakdown}
      />
    </motion.div>
  );
}

/** Simulates projected score improvement based on additional training */
function ImprovementSimulation({ prediction }: { prediction: PredictionData }) {
  const currentScore = prediction.predicted_score;
  const sessionCount = prediction.training_session_count + prediction.exam_session_count;

  // Diminishing returns: each batch of sessions adds less improvement
  const improvementPerBatch = Math.max(1, Math.round((100 - currentScore) * 0.12));
  const projectedWith5More = Math.min(100, currentScore + improvementPerBatch);

  // Weak skill improvement: if weakest sections improved to 60%+, how much would score change?
  const weakSections = prediction.section_breakdown.filter(s => s.skill_score < 60);
  let projectedWithSkillFix = currentScore;
  if (weakSections.length > 0) {
    const totalWeight = prediction.section_breakdown.reduce((s, b) => s + b.weight, 0) || 1;
    const boost = weakSections.reduce((sum, s) => {
      const gap = 65 - s.skill_score;
      return sum + (gap > 0 ? (gap * s.weight) / totalWeight : 0);
    }, 0);
    projectedWithSkillFix = Math.min(100, Math.round(currentScore + boost));
  }

  if (sessionCount < 1) return null;

  return (
    <div className="space-y-1.5 pt-2 border-t text-xs">
      <p className="font-semibold text-muted-foreground mb-1">📈 محاكاة التحسن:</p>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">لو أكملت 5 جلسات إضافية</span>
        <span className="font-mono font-bold text-success">{projectedWith5More}%</span>
      </div>
      {projectedWithSkillFix > currentScore && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">لو حسّنت نقاط الضعف</span>
          <span className="font-mono font-bold text-success">{projectedWithSkillFix}%</span>
        </div>
      )}
    </div>
  );
}
