import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dna, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import {
  type LearningDNA,
  type DNASnapshot,
  dnaLabels,
  trendLabels,
  generateDNAInsight,
} from '@/services/learningDNAEngine';

interface Props {
  studentId: string | undefined;
}

export default function LearningDNACard({ studentId }: Props) {
  const [dna, setDna] = useState<LearningDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const mountedRef = useRef(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!studentId) return;

    const fetchDNA = async () => {
      const { data } = await supabase
        .from('student_learning_dna' as any)
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();
      if (mountedRef.current) {
        setDna(data as any);
        setLoading(false);
      }
    };

    fetchDNA();

    // Realtime subscription
    const channel = supabase
      .channel(`dna-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_learning_dna',
          filter: `student_id=eq.${studentId}`,
        },
        () => fetchDNA()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  if (loading || !dna) return null;

  const label = dnaLabels[dna.dna_type as keyof typeof dnaLabels] || dnaLabels.balanced;
  const trend = trendLabels[dna.trend_direction as keyof typeof trendLabels] || trendLabels.stable;
  const insight = generateDNAInsight(dna);
  const history = (dna.history_json || []) as DNASnapshot[];

  // Deduplicate stages for timeline
  const stages: { stage: number; dna_type: string; timestamp: string }[] = [];
  const seenStages = new Set<number>();
  for (const snap of history) {
    if (!seenStages.has(snap.stage)) {
      seenStages.add(snap.stage);
      stages.push({ stage: snap.stage, dna_type: snap.dna_type, timestamp: snap.timestamp });
    }
  }

  const TrendIcon = dna.trend_direction === 'improving' ? TrendingUp :
                     dna.trend_direction === 'declining' ? TrendingDown : Minus;

  const trendColor = dna.trend_direction === 'improving' ? 'text-success' :
                      dna.trend_direction === 'declining' ? 'text-destructive' : 'text-muted-foreground';

  const scrollToTraining = () => {
    const el = document.querySelector('[data-training-recommendations]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (location.pathname.includes('/performance')) {
      // On performance page, switch to recommendations tab
      const tabTrigger = document.querySelector('[data-value="recommendations"]') as HTMLElement;
      if (tabTrigger) {
        tabTrigger.click();
      } else {
        navigate('/app/dashboard');
        setTimeout(() => {
          document.querySelector('[data-training-recommendations]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 500);
      }
    } else {
      navigate('/app/dashboard');
      setTimeout(() => {
        document.querySelector('[data-training-recommendations]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
      className="rounded-2xl border bg-card shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Dna className="h-5 w-5 text-primary" />
          بصمة التعلم
        </h2>
        <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full">
          المستوى {dna.evolution_stage}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* DNA Type + Trend */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl flex-shrink-0">
            {label.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground text-base">{label.label}</h3>
              <span className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                <TrendIcon className="h-3.5 w-3.5" />
                {trend.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{label.description}</p>
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">🎯 ثقة النظام بتحليل نمطك</span>
            <motion.span
              key={dna.confidence_score}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-bold font-mono text-foreground"
            >
              {dna.confidence_score}%
            </motion.span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${dna.confidence_score}%` }}
              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        {/* Smart Insight */}
        <div className="flex items-start gap-2.5 rounded-xl bg-muted/50 p-3">
          <Sparkles className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground leading-relaxed">{insight}</p>
        </div>

        {/* CTA */}
        <button
          onClick={scrollToTraining}
          className="w-full text-center text-xs font-medium text-primary hover:underline py-1"
        >
          كيف أتحسن؟ ↓
        </button>

        {/* Evolution Timeline Toggle */}
        {stages.length > 1 && (
          <>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
            >
              رحلة التطور
              {showTimeline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showTimeline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1 pt-1 overflow-x-auto pb-1">
                  {stages.map((s, i) => {
                    const sLabel = dnaLabels[s.dna_type as keyof typeof dnaLabels] || dnaLabels.balanced;
                    return (
                      <div key={s.stage} className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-sm">{sLabel.emoji}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{sLabel.label}</span>
                          <span className="text-[9px] text-muted-foreground/60">مرحلة {s.stage}</span>
                        </div>
                        {i < stages.length - 1 && (
                          <span className="text-muted-foreground/40 text-xs px-0.5">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
