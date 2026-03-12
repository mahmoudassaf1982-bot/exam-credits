import { motion } from 'framer-motion';

interface SarisCoachCharacterProps {
  gesture: 'idle' | 'pointing-right' | 'pointing-left' | 'waving' | 'celebrating';
  className?: string;
}

export default function SarisCoachCharacter({ gesture, className = '' }: SarisCoachCharacterProps) {
  // Arm angles based on gesture
  const rightArmVariants = {
    idle: { rotate: 0, x: 0, y: 0 },
    'pointing-right': { rotate: -45, x: 4, y: -6 },
    'pointing-left': { rotate: 0, x: 0, y: 0 },
    waving: { rotate: -30, x: 2, y: -8 },
    celebrating: { rotate: -60, x: 4, y: -10 },
  };

  const leftArmVariants = {
    idle: { rotate: 0, x: 0, y: 0 },
    'pointing-right': { rotate: 0, x: 0, y: 0 },
    'pointing-left': { rotate: 45, x: -4, y: -6 },
    waving: { rotate: 0, x: 0, y: 0 },
    celebrating: { rotate: 60, x: -4, y: -10 },
  };

  return (
    <div className={`relative select-none ${className}`} style={{ width: 100, height: 180 }}>
      <svg viewBox="0 0 100 180" width="100" height="180" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shadow under feet */}
        <ellipse cx="50" cy="176" rx="22" ry="4" fill="hsl(215 20% 70% / 0.3)" />

        {/* === LEGS === */}
        <motion.g
          animate={{ y: [0, -0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Left leg */}
          <rect x="36" y="130" width="10" height="32" rx="5" fill="hsl(215, 30%, 35%)" />
          {/* Right leg */}
          <rect x="54" y="130" width="10" height="32" rx="5" fill="hsl(215, 30%, 35%)" />
          {/* Left shoe */}
          <path d="M34 158 Q34 166 42 166 L48 166 Q50 166 50 162 L50 158 Z" fill="hsl(215, 55%, 22%)" />
          {/* Right shoe */}
          <path d="M52 158 Q52 166 60 166 L66 166 Q68 166 68 162 L68 158 Z" fill="hsl(215, 55%, 22%)" />
        </motion.g>

        {/* === BODY (torso) === */}
        <motion.g
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
        >
          {/* Torso - professional jacket */}
          <path
            d="M32 72 Q30 75 30 80 L30 130 Q30 134 34 134 L66 134 Q70 134 70 130 L70 80 Q70 75 68 72 Z"
            fill="hsl(215, 55%, 28%)"
          />
          {/* Jacket lapel / collar detail */}
          <path d="M44 72 L50 82 L56 72" stroke="hsl(215, 40%, 40%)" strokeWidth="1.5" fill="none" />
          {/* Shirt underneath */}
          <rect x="44" y="72" width="12" height="20" rx="2" fill="hsl(210, 40%, 96%)" />
          {/* Tie */}
          <path d="M49 74 L50 95 L51 74 Z" fill="hsl(200, 70%, 45%)" />
          {/* Jacket buttons */}
          <circle cx="50" cy="100" r="1.5" fill="hsl(215, 40%, 40%)" />
          <circle cx="50" cy="110" r="1.5" fill="hsl(215, 40%, 40%)" />
          
          {/* Belt */}
          <rect x="32" y="126" width="36" height="4" rx="2" fill="hsl(30, 40%, 30%)" />
          <rect x="47" y="125" width="6" height="6" rx="1" fill="hsl(38, 60%, 50%)" />
        </motion.g>

        {/* === LEFT ARM === */}
        <motion.g
          style={{ originX: '42px', originY: '76px' }}
          animate={leftArmVariants[gesture]}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Upper arm */}
          <rect x="22" y="76" width="10" height="24" rx="5" fill="hsl(215, 55%, 28%)" />
          {/* Forearm / hand */}
          <rect x="22" y="96" width="10" height="16" rx="5" fill="hsl(25, 50%, 70%)" />
          {/* Tablet in hand */}
          {(gesture === 'idle' || gesture === 'pointing-right') && (
            <g>
              <rect x="18" y="100" width="16" height="12" rx="2" fill="hsl(215, 20%, 25%)" />
              <rect x="19.5" y="101.5" width="13" height="9" rx="1" fill="hsl(200, 80%, 60%)" opacity="0.6" />
            </g>
          )}
        </motion.g>

        {/* === RIGHT ARM === */}
        <motion.g
          style={{ originX: '58px', originY: '76px' }}
          animate={{
            ...rightArmVariants[gesture],
            ...(gesture === 'waving' ? {} : {}),
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <rect x="68" y="76" width="10" height="24" rx="5" fill="hsl(215, 55%, 28%)" />
          <rect x="68" y="96" width="10" height="16" rx="5" fill="hsl(25, 50%, 70%)" />
          {/* Pointing finger when pointing */}
          {(gesture === 'pointing-right') && (
            <motion.circle
              cx="78" cy="96"
              r="2"
              fill="hsl(25, 50%, 70%)"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.g>

        {/* Waving animation for right arm */}
        {gesture === 'waving' && (
          <motion.g
            style={{ originX: '58px', originY: '76px' }}
            animate={{ rotate: [-30, -50, -30] }}
            transition={{ duration: 0.6, repeat: 3, ease: 'easeInOut' }}
          >
            <rect x="68" y="76" width="10" height="24" rx="5" fill="hsl(215, 55%, 28%)" />
            <rect x="68" y="66" width="10" height="16" rx="5" fill="hsl(25, 50%, 70%)" />
            {/* Open palm */}
            <circle cx="73" cy="64" r="5" fill="hsl(25, 50%, 70%)" />
          </motion.g>
        )}

        {/* === HEAD === */}
        <motion.g
          animate={{ y: [0, -1.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        >
          {/* Neck */}
          <rect x="45" y="60" width="10" height="14" rx="4" fill="hsl(25, 50%, 72%)" />
          {/* Head shape */}
          <ellipse cx="50" cy="42" rx="20" ry="22" fill="hsl(25, 50%, 72%)" />
          {/* Hair */}
          <path
            d="M30 38 Q30 18 50 16 Q70 18 70 38 Q70 30 60 28 Q50 26 40 28 Q30 30 30 38 Z"
            fill="hsl(215, 40%, 18%)"
          />
          {/* Hair side detail */}
          <path d="M30 38 Q28 42 30 48" stroke="hsl(215, 40%, 18%)" strokeWidth="3" fill="none" />
          <path d="M70 38 Q72 42 70 48" stroke="hsl(215, 40%, 18%)" strokeWidth="3" fill="none" />

          {/* Eyes */}
          <motion.g
            animate={{ scaleY: [1, 1, 0.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
          >
            <ellipse cx="41" cy="40" rx="3" ry="3.5" fill="hsl(215, 60%, 20%)" />
            <ellipse cx="59" cy="40" rx="3" ry="3.5" fill="hsl(215, 60%, 20%)" />
            {/* Eye shine */}
            <circle cx="42" cy="39" r="1" fill="white" />
            <circle cx="60" cy="39" r="1" fill="white" />
          </motion.g>

          {/* Eyebrows */}
          <path d="M36 34 Q41 32 46 34" stroke="hsl(215, 40%, 18%)" strokeWidth="1.5" fill="none" />
          <path d="M54 34 Q59 32 64 34" stroke="hsl(215, 40%, 18%)" strokeWidth="1.5" fill="none" />

          {/* Nose */}
          <path d="M49 44 Q50 47 51 44" stroke="hsl(25, 40%, 60%)" strokeWidth="1" fill="none" />

          {/* Mouth - changes with gesture */}
          {gesture === 'celebrating' ? (
            <path d="M42 50 Q50 56 58 50" stroke="hsl(0, 60%, 50%)" strokeWidth="1.5" fill="hsl(0, 50%, 45%)" />
          ) : gesture === 'waving' ? (
            <path d="M43 50 Q50 54 57 50" stroke="hsl(0, 60%, 55%)" strokeWidth="1.5" fill="none" />
          ) : (
            <path d="M44 50 Q50 53 56 50" stroke="hsl(0, 50%, 55%)" strokeWidth="1.2" fill="none" />
          )}

          {/* Glasses */}
          <circle cx="41" cy="40" r="7" stroke="hsl(215, 30%, 40%)" strokeWidth="1.2" fill="none" />
          <circle cx="59" cy="40" r="7" stroke="hsl(215, 30%, 40%)" strokeWidth="1.2" fill="none" />
          <path d="M48 40 L52 40" stroke="hsl(215, 30%, 40%)" strokeWidth="1" />
          <path d="M34 39 L30 37" stroke="hsl(215, 30%, 40%)" strokeWidth="1" />
          <path d="M66 39 L70 37" stroke="hsl(215, 30%, 40%)" strokeWidth="1" />

          {/* SARIS badge on jacket */}
        </motion.g>

        {/* Badge on chest */}
        <motion.g
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
        >
          <rect x="54" y="78" width="14" height="8" rx="2" fill="hsl(200, 70%, 45%)" />
          <text x="61" y="84" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="system-ui">S</text>
        </motion.g>
      </svg>
    </div>
  );
}
