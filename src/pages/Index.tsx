import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Brain, BarChart3, Sparkles, Users, Coins, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground font-black text-lg shadow-gold">
              S
            </div>
            <span className="text-lg font-black text-foreground">Saris Exams</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="outline" size="sm">
                تسجيل الدخول
              </Button>
            </Link>
            <Link to="/auth?mode=register">
              <Button size="sm" className="gradient-primary text-primary-foreground font-bold">
                حساب جديد
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-foreground mb-6">
            <Sparkles className="h-4 w-4 text-gold" />
            سجّل الآن واحصل على 20 نقطة هدية مجانًا
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-foreground leading-tight">
            منصة الاختبارات{' '}
            <span className="text-gradient-gold">المهنية</span>
            {' '}الذكية
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            محاكاة رسمية، تدريب ذكي بالذكاء الاصطناعي، وتحليل متقدم للنتائج.
            كل ما تحتاجه للنجاح في اختبارك المهني.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth?mode=register">
              <Button
                size="lg"
                className="gradient-gold text-gold-foreground font-bold text-lg px-8 py-6 shadow-gold hover:opacity-90 transition-opacity gap-2"
              >
                ابدأ مجانًا
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/app">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6"
              >
                تصفّح المنصة
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="container pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[
            {
              icon: BookOpen,
              title: 'محاكاة رسمية',
              desc: 'اختبارات محاكاة مطابقة للاختبار الحقيقي بتوقيت وبيئة واقعية',
              gradient: 'gradient-primary',
              textColor: 'text-primary-foreground',
            },
            {
              icon: Brain,
              title: 'تدريب ذكي (AI)',
              desc: 'تدريب مخصص بالذكاء الاصطناعي يركز على نقاط ضعفك',
              gradient: 'bg-info',
              textColor: 'text-info-foreground',
            },
            {
              icon: BarChart3,
              title: 'تحليل النتائج',
              desc: 'تحليل شامل لأدائك مع توصيات ذكية للتحسين',
              gradient: 'bg-success',
              textColor: 'text-success-foreground',
            },
            {
              icon: Users,
              title: 'دعوة صديق',
              desc: 'ادعُ أصدقاءك واحصل على نقاط مجانية لكليكما',
              gradient: 'gradient-gold',
              textColor: 'text-gold-foreground',
            },
            {
              icon: Coins,
              title: 'نظام نقاط مرن',
              desc: 'اشترِ حزم النقاط حسب حاجتك بأسعار تناسب دولتك',
              gradient: 'gradient-primary',
              textColor: 'text-primary-foreground',
            },
            {
              icon: Shield,
              title: 'Diamond Yearly',
              desc: 'وصول غير محدود لكل شيء مقابل اشتراك سنوي واحد',
              gradient: 'gradient-diamond',
              textColor: 'text-diamond-foreground',
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
              className="rounded-2xl border bg-card p-6 shadow-card hover:shadow-card-hover transition-all group"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${feature.gradient} ${feature.textColor} mb-4 group-hover:scale-110 transition-transform`}
              >
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/50">
        <div className="container py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground">
            مستعد للنجاح في اختبارك؟
          </h2>
          <p className="mt-3 text-muted-foreground">
            سجّل الآن واحصل على 20 نقطة هدية للبدء مجانًا
          </p>
          <Link to="/auth?mode=register">
            <Button
              size="lg"
              className="mt-6 gradient-gold text-gold-foreground font-bold text-lg px-10 py-6 shadow-gold hover:opacity-90"
            >
              أنشئ حسابك الآن
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Saris Exams. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
