import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { CheckCircle, BookOpen, Brain, BarChart3, Target, TrendingUp, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Welcome() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // If user already saw welcome, skip
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

    // Force full reload to refresh context
    window.location.href = '/app';
  };

  const steps = [
    { icon: BookOpen, text: 'اختر اختبار دولتك' },
    { icon: Brain, text: 'ابدأ اختبار تجريبي' },
    { icon: BarChart3, text: 'راجع تحليل أدائك' },
    { icon: Target, text: 'تدرب على نقاط ضعفك' },
    { icon: TrendingUp, text: 'حسّن مستواك قبل الاختبار الحقيقي' },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-gold text-gold-foreground font-black text-2xl shadow-gold">
            S
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-card space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <CheckCircle className="h-8 w-8" />
            </motion.div>
            <h1 className="text-2xl font-black text-foreground">
              أهلاً بك في SARIS EXAMS
            </h1>
            <p className="text-muted-foreground text-sm">
              تم إنشاء حسابك بنجاح 🎉
            </p>
          </div>

          {/* Bonus highlight */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 rounded-xl bg-gold/10 border border-gold/20 p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-gold text-gold-foreground">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">🎁 حصلت على 20 نقطة هدية كبداية</p>
              <p className="text-xs text-muted-foreground">استخدمها لتجربة الاختبارات والتدريب مجانًا</p>
            </div>
          </motion.div>

          {/* Steps */}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground mb-3">ماذا يمكنك أن تفعل الآن:</p>
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <step.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-foreground font-medium">
                  {i + 1}. {step.text}
                </span>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={handleStart}
            disabled={saving}
            className="w-full gradient-gold text-gold-foreground font-bold py-6 text-lg shadow-gold hover:opacity-90 transition-opacity"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'ابدأ الآن'
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
