import { useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface SmartHintButtonProps {
  sessionId: string;
  questionId: string;
  difficulty: string;
  isAdaptiveSession?: boolean;
  existingHint?: string | null;
  hintsRemaining: number;
  maxHints: number;
  onHintReceived: (questionId: string, hintText: string, hintsRemaining: number) => void;
}

export default function SmartHintButton({
  sessionId,
  questionId,
  difficulty,
  existingHint,
  hintsRemaining,
  maxHints,
  onHintReceived,
}: SmartHintButtonProps) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(existingHint || null);

  // Only show for hard questions
  if (difficulty !== 'hard') return null;

  const hintsExhausted = hintsRemaining <= 0 && !hint;

  const handleRequestHint = async () => {
    if (hint || loading || hintsExhausted) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('smart-hint-claude', {
        body: { session_id: sessionId, question_id: questionId },
      });

      // Log errors internally only — never show technical errors to student
      if (error) {
        console.error('[SmartHint] Internal error (hidden from user):', error);
        // Show a friendly non-technical fallback
        toast('لحظة واحدة…', { duration: 1500 });
        setLoading(false);
        return;
      }

      if (data?.error) {
        // Only show user-friendly messages for business logic errors (e.g. hints exhausted)
        const businessErrors = ['لقد استخدمت جميع التلميحات', 'التلميح متاح فقط للأسئلة الصعبة', 'الجلسة ليست نشطة'];
        const isBusiness = businessErrors.some(e => data.error.includes(e));
        if (isBusiness) {
          toast(data.error, { duration: 3000 });
        } else {
          // Technical error — log internally, show friendly message
          console.error('[SmartHint] Internal error (hidden from user):', data.error);
          toast('لحظة واحدة…', { duration: 2000 });
        }
        setLoading(false);
        return;
      }

      const hintText = data?.hint || 'لا يوجد تلميح متاح';
      const remaining = data?.hints_remaining ?? (hintsRemaining - 1);
      setHint(hintText);
      onHintReceived(questionId, hintText, remaining);
    } catch (err) {
      // Log internally only — never show technical errors to student
      console.error('[SmartHint] Internal error (hidden from user):', err);
      toast('لحظة واحدة…', { duration: 2000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Hint counter */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Lightbulb className="h-3 w-3 text-amber-500" />
          💡 التلميحات: {maxHints - hintsRemaining} / {maxHints}
        </span>
        {hintsExhausted && (
          <span className="text-destructive font-medium">
            لقد استخدمت جميع التلميحات المتاحة في هذه الجلسة
          </span>
        )}
      </div>

      {!hint && !hintsExhausted && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRequestHint}
          disabled={loading}
          className="gap-2 border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="h-4 w-4" />
          )}
          {loading ? 'لحظة واحدة…' : '💡 تلميح'}
        </Button>
      )}

      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
              <p>{hint}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
