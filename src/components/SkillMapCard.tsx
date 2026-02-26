import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Gauge, Zap, Clock, Activity } from 'lucide-react';

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

interface Props {
  profile: MemoryProfile;
}

const speedLabels: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  fast: { label: 'سريع', icon: Zap, color: 'text-success' },
  normal: { label: 'متوسط', icon: Activity, color: 'text-primary' },
  slow: { label: 'بطيء', icon: Clock, color: 'text-gold' },
};

export default function SkillMapCard({ profile }: Props) {
  const strengths = Object.entries(profile.strength_map).sort((a, b) => b[1] - a[1]);
  const weaknesses = Object.entries(profile.weakness_map).sort((a, b) => a[1] - b[1]);
  const speed = speedLabels[profile.speed_profile] || speedLabels.normal;
  const SpeedIcon = speed.icon;

  const hasData = strengths.length > 0 || weaknesses.length > 0;

  if (!hasData) return null;

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
          <Gauge className="h-5 w-5 text-primary" />
          خريطة المهارات
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <SpeedIcon className={`h-3.5 w-3.5 ${speed.color}`} />
            <span className="text-muted-foreground">السرعة:</span>
            <span className={`font-bold ${speed.color}`}>{speed.label}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">الدقة:</span>
            <span className={`font-bold font-mono ${profile.accuracy_profile >= 70 ? 'text-success' : profile.accuracy_profile >= 50 ? 'text-gold' : 'text-destructive'}`}>
              {profile.accuracy_profile}%
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <TrendingUp className="h-4 w-4" />
              نقاط القوة
            </div>
            <div className="space-y-2">
              {strengths.map(([name, pct]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-foreground flex-1 truncate">{name}</span>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="h-full rounded-full bg-success"
                    />
                  </div>
                  <span className="text-xs font-bold font-mono text-success w-10 text-left">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weaknesses */}
        {weaknesses.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <TrendingDown className="h-4 w-4" />
              نقاط الضعف
            </div>
            <div className="space-y-2">
              {weaknesses.map(([name, pct]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-foreground flex-1 truncate">{name}</span>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="h-full rounded-full bg-destructive"
                    />
                  </div>
                  <span className="text-xs font-bold font-mono text-destructive w-10 text-left">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
