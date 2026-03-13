import { motion } from 'framer-motion';
import coachPointing from '@/assets/saris-coach-fullbody.png';
import coachIdle from '@/assets/saris-coach-idle.png';
import coachSpeaking from '@/assets/saris-coach-speaking.png';
import coachCelebrating from '@/assets/saris-coach-celebrating.png';
import coachThinking from '@/assets/saris-coach-thinking.png';
import coachWaving from '@/assets/saris-coach-waving.png';

export type CoachAnimState = 'idle' | 'walking' | 'speaking' | 'pointing' | 'celebrating' | 'guiding' | 'thinking' | 'waving';

interface SarisCoachAvatarProps {
  state: CoachAnimState;
  size?: number;
  className?: string;
}

const stateToImage: Record<CoachAnimState, string> = {
  idle: coachIdle,
  walking: coachWaving,
  speaking: coachSpeaking,
  pointing: coachPointing,
  celebrating: coachCelebrating,
  guiding: coachSpeaking,
  thinking: coachThinking,
  waving: coachWaving,
};

export default function SarisCoachAvatar({ state, size = 120, className = '' }: SarisCoachAvatarProps) {
  const imgSrc = stateToImage[state];

  const bodyMotion = {
    idle: { y: [0, -4, 0], scale: [1, 1.01, 1] },
    walking: { y: [0, -5, 0, -5, 0], x: [0, 3, 0, -3, 0] },
    speaking: { y: [0, -2, 0], scale: [1, 1.02, 1] },
    pointing: { y: [0, -2, 0], rotate: [0, -1, 0, 1, 0] },
    celebrating: { y: [0, -12, 0, -8, 0], scale: [1, 1.08, 1, 1.05, 1], rotate: [0, 3, -3, 0] },
    guiding: { y: [0, -2, 0], x: [0, 2, 0, -2, 0] },
    thinking: { y: [0, -2, 0], rotate: [0, -2, 0] },
    waving: { y: [0, -3, 0], rotate: [0, 2, -2, 0] },
  };

  const transitionConfig: Record<CoachAnimState, object> = {
    idle: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
    walking: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' as const },
    speaking: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
    pointing: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
    celebrating: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' as const },
    guiding: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
    thinking: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const },
    waving: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' as const },
  };

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size * 1.3 }}>
      {/* Ground shadow */}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-foreground/10"
        style={{ width: size * 0.5, height: size * 0.06 }}
        animate={
          state === 'celebrating'
            ? { scaleX: [1, 0.6, 1], opacity: [0.1, 0.04, 0.1] }
            : state === 'walking'
              ? { scaleX: [1, 0.7, 1], opacity: [0.1, 0.06, 0.1] }
              : {}
        }
        transition={transitionConfig[state]}
      />

      <AnimatePresence mode="wait">
        <motion.img
          key={state}
          src={imgSrc}
          alt="SARIS Coach"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ filter: 'drop-shadow(0 6px 16px hsl(38 92% 50% / 0.15))' }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1, ...bodyMotion[state] }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={transitionConfig[state]}
        />
      </AnimatePresence>

      {/* Celebration particles */}
      {state === 'celebrating' && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {[
            { left: '10%', top: '10%', delay: 0 },
            { left: '80%', top: '5%', delay: 0.2 },
            { left: '5%', top: '40%', delay: 0.4 },
            { left: '85%', top: '35%', delay: 0.1 },
            { left: '20%', top: '0%', delay: 0.3 },
            { left: '70%', top: '15%', delay: 0.5 },
          ].map((p, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: p.left,
                top: p.top,
                backgroundColor: i % 2 === 0 ? 'hsl(var(--gold))' : 'hsl(var(--primary))',
              }}
              animate={{ y: [0, -20, -35], opacity: [1, 0.7, 0], scale: [1, 1.3, 0.5] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
          {[
            { left: '15%', top: '20%', delay: 0.15 },
            { left: '75%', top: '25%', delay: 0.35 },
          ].map((s, i) => (
            <motion.span
              key={`star-${i}`}
              className="absolute text-[hsl(var(--gold))] text-sm"
              style={{ left: s.left, top: s.top }}
              animate={{ y: [0, -25], opacity: [1, 0], rotate: [0, 180] }}
              transition={{ duration: 1, repeat: Infinity, delay: s.delay }}
            >
              ★
            </motion.span>
          ))}
        </div>
      )}

      {/* Pointing sparkle */}
      {(state === 'pointing' || state === 'guiding') && (
        <motion.div
          className="absolute top-1/4 -left-2 w-3 h-3 rounded-full bg-[hsl(var(--gold))]"
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Thinking dots */}
      {state === 'thinking' && (
        <div className="absolute -top-2 right-0 flex gap-1">
          {[0, 0.3, 0.6].map((delay, i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
