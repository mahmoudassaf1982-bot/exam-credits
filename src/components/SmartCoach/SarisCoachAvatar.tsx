import { motion } from 'framer-motion';

export type CoachAnimState = 'idle' | 'walking' | 'speaking' | 'pointing' | 'celebrating' | 'guiding';

interface SarisCoachAvatarProps {
  state: CoachAnimState;
  size?: number;
  className?: string;
}

/**
 * Animated 2.5D SARIS Coach avatar built from layered SVG parts.
 * Uses the platform's design tokens (navy primary, gold accents).
 * Each body part animates independently via framer-motion.
 */
export default function SarisCoachAvatar({ state, size = 120, className = '' }: SarisCoachAvatarProps) {
  const scale = size / 120;

  // ── Animation variants per body part ──

  const bodyVariants = {
    idle: { y: [0, -2, 0], rotate: [0, 0.5, 0, -0.5, 0] },
    walking: { y: [0, -4, 0, -4, 0], rotate: [-1, 1, -1] },
    speaking: { y: [0, -1, 0], scale: [1, 1.01, 1] },
    pointing: { y: [0, -1, 0], rotate: [0, -2, 0] },
    celebrating: { y: [0, -8, 0, -6, 0], scale: [1, 1.05, 1, 1.03, 1] },
    guiding: { y: [0, -2, 0], x: [0, 3, 0, -3, 0] },
  };

  const headVariants = {
    idle: { rotate: [0, 1, 0, -1, 0], y: [0, -1, 0] },
    walking: { rotate: [-2, 2, -2], y: [0, -2, 0, -2, 0] },
    speaking: { rotate: [0, 1.5, 0, -1, 0], y: [0, -1, 0, -0.5, 0] },
    pointing: { rotate: [0, -5, -3, -5, 0], y: [0, 1, 0] },
    celebrating: { rotate: [0, 3, -3, 2, 0], y: [0, -3, 0] },
    guiding: { rotate: [0, -3, 0, 2, 0] },
  };

  const leftArmVariants = {
    idle: { rotate: [0, 2, 0, -1, 0] },
    walking: { rotate: [15, -15, 15] },
    speaking: { rotate: [0, -8, 0, -5, 0] },
    pointing: { rotate: [-45, -50, -45] },
    celebrating: { rotate: [-60, -70, -60, -65, -60] },
    guiding: { rotate: [-20, -30, -20] },
  };

  const rightArmVariants = {
    idle: { rotate: [0, -2, 0, 1, 0] },
    walking: { rotate: [-15, 15, -15] },
    speaking: { rotate: [0, 5, 0, 8, 0] },
    pointing: { rotate: [5, 8, 5] },
    celebrating: { rotate: [60, 70, 60, 65, 60] },
    guiding: { rotate: [10, 15, 10] },
  };

  const leftLegVariants = {
    idle: { rotate: [0, 0, 0] },
    walking: { rotate: [12, -12, 12] },
    speaking: { rotate: [0, 0, 0] },
    pointing: { rotate: [0, 1, 0] },
    celebrating: { rotate: [-5, 5, -5] },
    guiding: { rotate: [0, 2, 0] },
  };

  const rightLegVariants = {
    idle: { rotate: [0, 0, 0] },
    walking: { rotate: [-12, 12, -12] },
    speaking: { rotate: [0, 0, 0] },
    pointing: { rotate: [0, -1, 0] },
    celebrating: { rotate: [5, -5, 5] },
    guiding: { rotate: [0, -2, 0] },
  };

  // Eye blink & mouth animations for speaking
  const eyeVariants = {
    idle: { scaleY: [1, 1, 0.1, 1, 1, 1, 1, 1] },
    walking: { scaleY: [1, 1, 0.1, 1, 1] },
    speaking: { scaleY: [1, 0.1, 1, 1, 0.1, 1] },
    pointing: { scaleY: [1, 1, 0.1, 1, 1, 1] },
    celebrating: { scaleY: [0.3, 0.3, 0.3] }, // happy squint
    guiding: { scaleY: [1, 1, 0.1, 1, 1] },
  };

  const mouthVariants = {
    idle: { scaleY: [1, 1, 1], scaleX: [1, 1, 1] },
    walking: { scaleY: [1, 1, 1] },
    speaking: { scaleY: [0.5, 1.3, 0.7, 1.2, 0.5], scaleX: [1, 0.9, 1, 0.95, 1] },
    pointing: { scaleY: [1, 1.1, 1] },
    celebrating: { scaleY: [1.3, 1.5, 1.3], scaleX: [1.2, 1.3, 1.2] }, // big smile
    guiding: { scaleY: [1, 1.1, 1, 1.2, 1] },
  };

  const transitionConfig = {
    idle: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
    walking: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' as const },
    speaking: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const },
    pointing: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
    celebrating: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' as const },
    guiding: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
  };

  const eyeTransition = {
    idle: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
    walking: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
    speaking: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
    pointing: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
    celebrating: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
    guiding: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
  };

  const t = transitionConfig[state];

  // Color palette from design tokens
  const colors = {
    skin: '#F5D6B8',
    skinShadow: '#E8C4A0',
    hair: '#2D1B0E',
    gown: 'hsl(215, 70%, 24%)', // --primary
    gownLight: 'hsl(215, 70%, 32%)',
    goldTrim: 'hsl(38, 92%, 50%)', // --gold
    goldDark: 'hsl(38, 92%, 40%)',
    glasses: 'hsl(215, 55%, 18%)',
    shoe: 'hsl(215, 55%, 15%)',
    pants: 'hsl(215, 40%, 30%)',
    white: '#FFFFFF',
    eyeWhite: '#FFFFFF',
    iris: 'hsl(215, 70%, 24%)',
    pupil: '#1a1a2e',
    mouth: '#C0392B',
    mouthOpen: '#8B2020',
  };

  return (
    <motion.svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 120 168"
      className={className}
      style={{ filter: 'drop-shadow(0 6px 16px hsl(38 92% 50% / 0.15))' }}
    >
      {/* ── Shadow on ground ── */}
      <motion.ellipse
        cx="60" cy="164" rx="28" ry="4"
        fill="hsl(215, 20%, 12%)"
        opacity="0.12"
        animate={state === 'walking'
          ? { rx: [28, 22, 28], opacity: [0.12, 0.08, 0.12] }
          : state === 'celebrating'
            ? { rx: [28, 20, 28], opacity: [0.12, 0.06, 0.12] }
            : {}
        }
        transition={t}
      />

      {/* ── BODY GROUP (everything moves together) ── */}
      <motion.g
        animate={bodyVariants[state]}
        transition={t}
        style={{ transformOrigin: '60px 90px' }}
      >
        {/* ── LEFT LEG ── */}
        <motion.g
          animate={leftLegVariants[state]}
          transition={t}
          style={{ transformOrigin: '50px 120px' }}
        >
          {/* Pant leg */}
          <path d="M46 118 L44 142 L54 142 L52 118 Z" fill={colors.pants} />
          {/* Shoe */}
          <ellipse cx="49" cy="144" rx="8" ry="4" fill={colors.shoe} />
          <ellipse cx="47" cy="143" rx="4" ry="2.5" fill={colors.gownLight} opacity="0.3" />
        </motion.g>

        {/* ── RIGHT LEG ── */}
        <motion.g
          animate={rightLegVariants[state]}
          transition={t}
          style={{ transformOrigin: '70px 120px' }}
        >
          {/* Pant leg */}
          <path d="M68 118 L66 142 L76 142 L74 118 Z" fill={colors.pants} />
          {/* Shoe */}
          <ellipse cx="71" cy="144" rx="8" ry="4" fill={colors.shoe} />
          <ellipse cx="73" cy="143" rx="4" ry="2.5" fill={colors.gownLight} opacity="0.3" />
        </motion.g>

        {/* ── GOWN / TORSO ── */}
        <path
          d="M38 60 Q36 90 40 120 L80 120 Q84 90 82 60 Z"
          fill={colors.gown}
        />
        {/* Gown shading */}
        <path
          d="M42 65 Q40 88 43 115 L55 115 Q50 88 50 65 Z"
          fill={colors.gownLight}
          opacity="0.4"
        />
        {/* Gold trim - collar */}
        <path d="M42 60 Q60 68 78 60" stroke={colors.goldTrim} strokeWidth="2.5" fill="none" />
        {/* Gold trim - bottom */}
        <path d="M40 118 L80 118" stroke={colors.goldTrim} strokeWidth="2" fill="none" />
        {/* Gold buttons */}
        <circle cx="60" cy="75" r="2" fill={colors.goldTrim} />
        <circle cx="60" cy="87" r="2" fill={colors.goldTrim} />
        <circle cx="60" cy="99" r="2" fill={colors.goldTrim} />
        {/* Gold emblem */}
        <motion.g
          animate={state === 'celebrating' ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{ transformOrigin: '60px 108px' }}
        >
          <circle cx="60" cy="108" r="4" fill={colors.goldDark} opacity="0.5" />
          <text x="60" y="110" textAnchor="middle" fontSize="5" fill={colors.goldTrim} fontWeight="bold">S</text>
        </motion.g>

        {/* ── LEFT ARM ── */}
        <motion.g
          animate={leftArmVariants[state]}
          transition={t}
          style={{ transformOrigin: '38px 64px' }}
        >
          {/* Sleeve */}
          <path d="M38 62 L28 80 L32 82 L40 66 Z" fill={colors.gown} />
          <path d="M38 62 L30 78" stroke={colors.goldTrim} strokeWidth="1" fill="none" opacity="0.5" />
          {/* Hand */}
          <circle cx="30" cy="82" r="5" fill={colors.skin} />
          <circle cx="30" cy="82" r="5" fill={colors.skinShadow} opacity="0.3" />
          {/* Pointing finger (visible in pointing/guiding states) */}
          {(state === 'pointing' || state === 'guiding') && (
            <motion.line
              x1="28" y1="78" x2="24" y2="72"
              stroke={colors.skin}
              strokeWidth="3"
              strokeLinecap="round"
              animate={{ y2: [72, 70, 72] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          {/* Celebrating: open hand */}
          {state === 'celebrating' && (
            <>
              <line x1="28" y1="78" x2="24" y2="74" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
              <line x1="30" y1="77" x2="28" y2="73" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
              <line x1="32" y1="78" x2="32" y2="74" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </motion.g>

        {/* ── RIGHT ARM ── */}
        <motion.g
          animate={rightArmVariants[state]}
          transition={t}
          style={{ transformOrigin: '82px 64px' }}
        >
          {/* Sleeve */}
          <path d="M82 62 L92 80 L88 82 L80 66 Z" fill={colors.gown} />
          <path d="M82 62 L90 78" stroke={colors.goldTrim} strokeWidth="1" fill="none" opacity="0.5" />
          {/* Hand */}
          <circle cx="90" cy="82" r="5" fill={colors.skin} />
          <circle cx="90" cy="82" r="5" fill={colors.skinShadow} opacity="0.3" />
          {/* Celebrating: open hand */}
          {state === 'celebrating' && (
            <>
              <line x1="88" y1="78" x2="86" y2="74" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
              <line x1="90" y1="77" x2="90" y2="73" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
              <line x1="92" y1="78" x2="94" y2="74" stroke={colors.skin} strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </motion.g>

        {/* ── HEAD GROUP ── */}
        <motion.g
          animate={headVariants[state]}
          transition={t}
          style={{ transformOrigin: '60px 42px' }}
        >
          {/* Neck */}
          <rect x="55" y="50" width="10" height="12" rx="3" fill={colors.skin} />
          <rect x="55" y="50" width="10" height="12" rx="3" fill={colors.skinShadow} opacity="0.2" />

          {/* Head shape */}
          <ellipse cx="60" cy="36" rx="22" ry="24" fill={colors.skin} />
          {/* Face shadow */}
          <ellipse cx="60" cy="40" rx="18" ry="16" fill={colors.skinShadow} opacity="0.15" />

          {/* Hair */}
          <path d="M38 28 Q38 10 60 8 Q82 10 82 28 Q78 18 60 16 Q42 18 38 28 Z" fill={colors.hair} />
          {/* Hair highlights */}
          <path d="M48 14 Q55 11 62 14" stroke={colors.gownLight} strokeWidth="0.8" fill="none" opacity="0.3" />

          {/* Graduation cap */}
          <motion.g
            animate={state === 'celebrating' ? { rotate: [0, -5, 5, 0], y: [0, -2, 0] } : {}}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ transformOrigin: '60px 12px' }}
          >
            <polygon points="38,16 60,6 82,16 60,22" fill={colors.gown} />
            <polygon points="38,16 60,6 82,16 60,22" fill={colors.gownLight} opacity="0.3" />
            <rect x="57" y="6" width="6" height="3" rx="1.5" fill={colors.goldTrim} />
            {/* Tassel */}
            <motion.g
              animate={{ rotate: [0, 8, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '82px 16px' }}
            >
              <line x1="82" y1="16" x2="88" y2="24" stroke={colors.goldTrim} strokeWidth="1.5" />
              <circle cx="88" cy="25" r="2" fill={colors.goldTrim} />
            </motion.g>
          </motion.g>

          {/* ── GLASSES ── */}
          <g>
            {/* Bridge */}
            <line x1="54" y1="36" x2="66" y2="36" stroke={colors.glasses} strokeWidth="1.5" />
            {/* Left frame */}
            <rect x="42" y="32" width="13" height="10" rx="4" fill="none" stroke={colors.glasses} strokeWidth="1.8" />
            {/* Right frame */}
            <rect x="65" y="32" width="13" height="10" rx="4" fill="none" stroke={colors.glasses} strokeWidth="1.8" />
            {/* Lens shine */}
            <ellipse cx="48" cy="35" rx="2" ry="1.5" fill={colors.white} opacity="0.25" />
            <ellipse cx="71" cy="35" rx="2" ry="1.5" fill={colors.white} opacity="0.25" />
            {/* Temple arms */}
            <line x1="42" y1="35" x2="36" y2="33" stroke={colors.glasses} strokeWidth="1.2" />
            <line x1="78" y1="35" x2="84" y2="33" stroke={colors.glasses} strokeWidth="1.2" />
          </g>

          {/* ── EYES ── */}
          <g>
            {/* Left eye */}
            <ellipse cx="49" cy="37" rx="4" ry="4" fill={colors.eyeWhite} />
            <motion.g
              animate={eyeVariants[state]}
              transition={eyeTransition[state]}
              style={{ transformOrigin: '49px 37px' }}
            >
              <circle cx="49" cy="37" r="2.5" fill={colors.iris} />
              <circle cx="49" cy="37" r="1.2" fill={colors.pupil} />
              <circle cx="50" cy="36" r="0.8" fill={colors.white} />
            </motion.g>

            {/* Right eye */}
            <ellipse cx="71" cy="37" rx="4" ry="4" fill={colors.eyeWhite} />
            <motion.g
              animate={eyeVariants[state]}
              transition={eyeTransition[state]}
              style={{ transformOrigin: '71px 37px' }}
            >
              <circle cx="71" cy="37" r="2.5" fill={colors.iris} />
              <circle cx="71" cy="37" r="1.2" fill={colors.pupil} />
              <circle cx="72" cy="36" r="0.8" fill={colors.white} />
            </motion.g>
          </g>

          {/* Eyebrows */}
          <motion.line
            x1="44" y1="30" x2="54" y2="29"
            stroke={colors.hair}
            strokeWidth="1.8"
            strokeLinecap="round"
            animate={state === 'celebrating' ? { y1: [30, 27, 30], y2: [29, 26, 29] } : {}}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <motion.line
            x1="66" y1="29" x2="76" y2="30"
            stroke={colors.hair}
            strokeWidth="1.8"
            strokeLinecap="round"
            animate={state === 'celebrating' ? { y1: [29, 26, 29], y2: [30, 27, 30] } : {}}
            transition={{ duration: 0.8, repeat: Infinity }}
          />

          {/* ── MOUTH ── */}
          <motion.g
            animate={mouthVariants[state]}
            transition={state === 'speaking'
              ? { duration: 0.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            }
            style={{ transformOrigin: '60px 47px' }}
          >
            {state === 'speaking' ? (
              <ellipse cx="60" cy="47" rx="4" ry="2.5" fill={colors.mouthOpen} />
            ) : state === 'celebrating' ? (
              <>
                <path d="M52 45 Q60 53 68 45" fill={colors.mouth} />
                <path d="M54 45 Q60 50 66 45" fill={colors.white} opacity="0.7" />
              </>
            ) : (
              <path d="M54 46 Q60 50 66 46" stroke={colors.mouth} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            )}
          </motion.g>

          {/* Cheek blush */}
          <circle cx="42" cy="43" r="4" fill="#FFB5B5" opacity="0.2" />
          <circle cx="78" cy="43" r="4" fill="#FFB5B5" opacity="0.2" />

          {/* Ears */}
          <ellipse cx="37" cy="38" rx="3" ry="5" fill={colors.skin} />
          <ellipse cx="37" cy="38" rx="2" ry="3.5" fill={colors.skinShadow} opacity="0.3" />
          <ellipse cx="83" cy="38" rx="3" ry="5" fill={colors.skin} />
          <ellipse cx="83" cy="38" rx="2" ry="3.5" fill={colors.skinShadow} opacity="0.3" />
        </motion.g>
      </motion.g>

      {/* ── Celebration particles ── */}
      {state === 'celebrating' && (
        <g>
          {[
            { cx: 20, cy: 20, delay: 0 },
            { cx: 100, cy: 15, delay: 0.2 },
            { cx: 15, cy: 60, delay: 0.4 },
            { cx: 105, cy: 55, delay: 0.1 },
            { cx: 30, cy: 10, delay: 0.3 },
            { cx: 90, cy: 25, delay: 0.5 },
          ].map((p, i) => (
            <motion.circle
              key={i}
              cx={p.cx} cy={p.cy} r="2"
              fill={i % 2 === 0 ? colors.goldTrim : colors.gown}
              animate={{
                y: [0, -15, -25],
                opacity: [1, 0.8, 0],
                scale: [1, 1.2, 0.5],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: p.delay,
                ease: 'easeOut',
              }}
            />
          ))}
          {/* Star particles */}
          {[
            { x: 25, y: 30, delay: 0.15 },
            { x: 95, y: 35, delay: 0.35 },
          ].map((s, i) => (
            <motion.text
              key={`star-${i}`}
              x={s.x} y={s.y}
              fontSize="8"
              fill={colors.goldTrim}
              textAnchor="middle"
              animate={{
                y: [s.y, s.y - 20],
                opacity: [1, 0],
                rotate: [0, 180],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: s.delay,
              }}
            >
              ★
            </motion.text>
          ))}
        </g>
      )}

      {/* ── Pointing indicator sparkle ── */}
      {(state === 'pointing' || state === 'guiding') && (
        <motion.circle
          cx="22" cy="70"
          r="3"
          fill={colors.goldTrim}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.svg>
  );
}
