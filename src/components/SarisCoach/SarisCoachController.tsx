import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SarisCoachCharacter from './SarisCoachCharacter';

type Gesture = 'idle' | 'pointing-right' | 'pointing-left' | 'waving' | 'celebrating';

interface CoachAction {
  gesture: Gesture;
  message: string;
  targetSelector?: string;
  duration?: number;
}

interface SarisCoachControllerProps {
  avgPercentage: number;
  completedSessions: number;
  hasWeakSkills: boolean;
  hasRecommendations: boolean;
  dnaType?: string;
}

export default function SarisCoachController({
  avgPercentage,
  completedSessions,
  hasWeakSkills,
  hasRecommendations,
  dnaType,
}: SarisCoachControllerProps) {
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<CoachAction>({
    gesture: 'waving',
    message: 'مرحبًا! أنا مدربك الذكي 👋',
  });
  const [entered, setEntered] = useState(false);
  const [isWalking, setIsWalking] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [messageVisible, setMessageVisible] = useState(false);

  // Determine what the coach should say/do based on context
  const determineAction = useCallback((): CoachAction => {
    // New user - wave and greet
    if (completedSessions === 0) {
      return {
        gesture: 'waving',
        message: 'مرحبًا! ابدأ أول اختبار لك وسأساعدك في رحلتك',
      };
    }

    // Great performance - celebrate
    if (avgPercentage >= 85) {
      return {
        gesture: 'celebrating',
        message: 'أداء ممتاز! 🎉 استمر على هذا المستوى',
      };
    }

    // Has recommendations - point to them
    if (hasRecommendations) {
      return {
        gesture: 'pointing-left',
        message: 'لديك تدريبات مقترحة، ابدأ بها لتحسين مستواك ⬇️',
        targetSelector: '[data-training-recommendations]',
      };
    }

    // Has weak skills - point
    if (hasWeakSkills) {
      return {
        gesture: 'pointing-left',
        message: 'لاحظت نقاط ضعف في بعض المهارات، لنعمل عليها معًا',
      };
    }

    // Average performance - encourage
    if (avgPercentage < 60 && completedSessions > 2) {
      return {
        gesture: 'pointing-right',
        message: 'لا تستسلم! التدريب المستمر هو مفتاح النجاح 💪',
      };
    }

    // Default - friendly idle
    return {
      gesture: 'idle',
      message: 'أنا هنا إذا احتجت مساعدة! جرب التدريب الذكي',
    };
  }, [avgPercentage, completedSessions, hasWeakSkills, hasRecommendations]);

  // Enter animation sequence
  useEffect(() => {
    if (dismissed) return;
    const sessionKey = 'saris-coach-shown';
    const shown = sessionStorage.getItem(sessionKey);
    
    // Delay entrance
    const enterTimer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(sessionKey, '1');
    }, shown ? 1500 : 2500);

    return () => clearTimeout(enterTimer);
  }, [dismissed]);

  useEffect(() => {
    if (!visible) return;
    // After walk-in, determine action
    const timer = setTimeout(() => {
      setEntered(true);
      setAction(determineAction());
      // Show message bubble after settling
      setTimeout(() => setMessageVisible(true), 600);
    }, 800);

    return () => clearTimeout(timer);
  }, [visible, determineAction]);

  // Auto-hide message after duration
  useEffect(() => {
    if (!messageVisible) return;
    const timer = setTimeout(() => {
      setMessageVisible(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [messageVisible]);

  if (dismissed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-1"
          style={{ pointerEvents: 'auto' }}
          initial={{ x: -120, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -120, opacity: 0 }}
          transition={{ 
            type: 'spring', 
            stiffness: 80, 
            damping: 18,
            duration: 0.8
          }}
        >
          {/* Speech bubble */}
          <AnimatePresence>
            {messageVisible && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="relative mb-1 max-w-[200px] rounded-2xl rounded-bl-md border bg-card px-3 py-2 shadow-lg"
              >
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  {action.message}
                </p>
                {/* Bubble tail */}
                <div className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r bg-card" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Character */}
          <motion.div
            className="cursor-pointer"
            onClick={() => {
              if (messageVisible) {
                setMessageVisible(false);
              } else {
                setMessageVisible(true);
              }
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <SarisCoachCharacter
              gesture={entered ? action.gesture : 'idle'}
            />
          </motion.div>

          {/* Dismiss button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            ✕
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
