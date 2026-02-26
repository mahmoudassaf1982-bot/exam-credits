import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Target, Zap, Clock, TrendingUp, ArrowLeft, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import type { RecommendationRow } from '@/hooks/useTrainingRecommendationsRealtime';
import type { TrainingRecommendation } from '@/services/trainingRecommendationEngine';
import { startTrainingFromRecommendation } from '@/services/startTrainingFromRecommendation';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  recommendations: RecommendationRow[];
  loading?: boolean;
}

const typeConfig: Record<string, { icon: typeof Brain; color: string; bgColor: string }> = {
  focused_skill: { icon: Target, color: 'text-destructive', bgColor: 'bg-destructive/10' },
  accuracy_drill: { icon: Brain, color: 'text-gold', bgColor: 'bg-gold/10' },
  speed_drill: { icon: Zap, color: 'text-info', bgColor: 'bg-info/10' },
  progressive_path: { icon: TrendingUp, color: 'text-primary', bgColor: 'bg-primary/10' },
  balanced: { icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
};

export default function RecommendedTrainingCard({ recommendations, loading: externalLoading }: Props) {
  const navigate = useNavigate();
  const { refreshWallet } = useAuth();
  const [startingId, setStartingId] = useState<string | null>(null);

  if (externalLoading) {
    return (
      <div className="rounded-2xl border bg-card shadow-card p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (recommendations.length === 0) return null;

  const handleStartTraining = async (row: RecommendationRow) => {
    setStartingId(row.id);
    try {
      const result = await startTrainingFromRecommendation(row);
      if (result.success && result.sessionId) {
        await refreshWallet();
        toast.success('تم بدء تدريب مخصص بناءً على نقاط ضعفك');
        navigate(`/app/exam-session/${result.sessionId}`);
      } else {
        toast.error(result.error || 'فشل في بدء التدريب');
      }
    } catch {
      toast.error('حدث خطأ أثناء بدء التدريب');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.17 }}
      className="rounded-2xl border bg-card shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          التدريب الموصى به
        </h2>
        <span className="text-xs text-muted-foreground">
          بناءً على تحليل أدائك
        </span>
      </div>

      {/* Recommendations */}
      <div className="divide-y">
        {recommendations.map((row, idx) => {
          const rec = row.recommendation_json as TrainingRecommendation;
          const cfg = typeConfig[rec.recommendation_type] || typeConfig.balanced;
          const Icon = cfg.icon;
          const progressPct = rec.target_accuracy > 0
            ? Math.round((rec.current_accuracy / rec.target_accuracy) * 100)
            : 0;
          const isStarting = startingId === row.id;
          const alreadyStarted = !!row.started_at && !!row.training_session_id;

          return (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.05 }}
              className="p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${cfg.bgColor}`}>
                  <Icon className={`h-5 w-5 ${cfg.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{rec.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                  </div>

                  {/* Progress toward goal */}
                  {rec.recommendation_type !== 'balanced' && rec.target_accuracy > 0 && (
                    <div className="flex items-center gap-3">
                      <Progress value={progressPct} className="h-1.5 flex-1" />
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {rec.current_accuracy}% → {rec.target_accuracy}%
                      </span>
                    </div>
                  )}

                  {/* Meta + CTA */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{rec.estimated_duration}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className={`font-medium ${cfg.color}`}>
                        {rec.difficulty_level === 'easy' ? 'سهل' :
                         rec.difficulty_level === 'medium' ? 'متوسط' :
                         rec.difficulty_level === 'hard' ? 'صعب' : 'متنوع'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={alreadyStarted ? 'outline' : 'default'}
                      onClick={() => {
                        if (alreadyStarted && row.training_session_id) {
                          navigate(`/app/exam-session/${row.training_session_id}`);
                        } else {
                          handleStartTraining(row);
                        }
                      }}
                      disabled={isStarting}
                      className="text-xs gap-1 h-7"
                    >
                      {isStarting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          جارٍ التجهيز...
                        </>
                      ) : alreadyStarted ? (
                        <>
                          استكمال التدريب
                          <ArrowLeft className="h-3 w-3" />
                        </>
                      ) : (
                        <>
                          ابدأ التدريب
                          <ArrowLeft className="h-3 w-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
