import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import {
  BookOpen, Brain, BarChart3, Zap, Target, ListChecks, HelpCircle, LineChart, Loader2, GraduationCap, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSmartCoach } from '@/components/SmartCoach';

export default function Welcome() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { setShowIntro } = useSmartCoach();

  // Trigger coach intro on welcome page
  useEffect(() => {
    setShowIntro(true);
    return () => setShowIntro(false);
  }, [setShowIntro]);

  if (user?.welcomeSeen) {
    navigate('/app', { replace: true });
    return null;
  }

  const handleStart = async () => {
    if (!session?.user?.id) return;
    setSaving(true);

    await supabase
      .from('profiles')
      .update({ welcome_seen: true })
      .eq('id', session.user.id);

    window.location.href = '/app/exams';
  };

  const features = [
    { icon: Target, text: 'التدريب على الاختبار الحقيقي' },
    { icon: BarChart3, text: 'معرفة مستواك الحقيقي قبل الاختبار' },
    { icon: Brain, text: 'تحليل أدائك بعد كل اختبار' },
    { icon: Zap, text: 'تحسين سرعتك في حل الأسئلة' },
  ];

  const steps = [
    { icon: ListChecks, text: 'اختر الاختبار', step: 1 },
    { icon: BookOpen, text: 'ابدأ الاختبار', step: 2 },
    { icon: HelpCircle, text: 'أجب على الأسئلة', step: 3 },
    { icon: LineChart, text: 'شاهد تحليل أدائك', step: 4 },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Logo */}
        <div className="mb-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl gradient-gold text-gold-foreground font-black text-2xl shadow-gold"
          >
            S
          </motion.div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-card space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <GraduationCap className="h-7 w-7" />
            </motion.div>
            <h1 className="text-2xl font-black text-foreground">
              مرحباً بك في SARIS EXAMS
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              منصة ذكية تساعدك على الاستعداد لاختبارات القدرات في جامعة الكويت من خلال محاكاة الاختبار الحقيقي باستخدام الذكاء الاصطناعي.
            </p>
          </div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-1"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-foreground">ماذا يمكنك أن تفعل في المنصة؟</p>
            </div>
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.07 }}
                className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <f.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-foreground font-medium">{f.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Steps */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="rounded-xl bg-muted/40 border p-4 space-y-3"
          >
            <p className="text-sm font-bold text-foreground">كيف تبدأ؟</p>
            <div className="grid grid-cols-2 gap-3">
              {steps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.65 + i * 0.08 }}
                  className="flex items-center gap-2.5 rounded-lg bg-card p-3 border shadow-sm"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full gradient-gold text-gold-foreground text-xs font-bold flex-shrink-0">
                    {s.step}
                  </div>
                  <span className="text-xs text-foreground font-medium leading-tight">{s.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <Button
            onClick={handleStart}
            disabled={saving}
            className="w-full gradient-gold text-gold-foreground font-bold py-6 text-lg shadow-gold hover:opacity-90 transition-opacity"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'ابدأ التدريب الآن'
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
