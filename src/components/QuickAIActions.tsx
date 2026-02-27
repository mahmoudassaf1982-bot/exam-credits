import { motion } from 'framer-motion';
import { Zap, Target, Rocket, BarChart3 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export default function QuickAIActions() {
  const actions = [
    {
      icon: Zap,
      label: 'تدريب سريع',
      subtitle: '5 دقائق',
      gradient: 'from-gold/15 to-gold/5',
      iconBg: 'bg-gold/15 text-gold',
      link: '/app/exams',
    },
    {
      icon: Target,
      label: 'تحسين الدقة',
      subtitle: 'تركيز مكثف',
      gradient: 'from-success/15 to-success/5',
      iconBg: 'bg-success/15 text-success',
      link: '/app/exams',
    },
    {
      icon: Rocket,
      label: 'تحسين السرعة',
      subtitle: 'تمرين موقوت',
      gradient: 'from-info/15 to-info/5',
      iconBg: 'bg-info/15 text-info',
      link: '/app/exams',
    },
    {
      icon: BarChart3,
      label: 'ملف الأداء',
      subtitle: 'تحليل شامل',
      gradient: 'from-primary/10 to-primary/5',
      iconBg: 'bg-primary/15 text-primary',
      link: '/app/performance',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25 + i * 0.06, type: 'spring', stiffness: 200 }}
          >
            <Link
              to={action.link}
              className={`group flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b ${action.gradient} p-4 transition-all hover:shadow-card-hover hover:scale-[1.02] active:scale-[0.98]`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.iconBg} transition-transform group-hover:scale-110`}>
                <action.icon className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-foreground">{action.label}</p>
                <p className="text-[10px] text-muted-foreground">{action.subtitle}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
