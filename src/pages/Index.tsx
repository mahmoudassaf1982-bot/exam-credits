import { Link } from 'react-router-dom';
import { BookOpen, Brain, BarChart3, Clock, Database, UserPlus, PlayCircle, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingLayout } from '@/components/MarketingLayout';

const features = [
  { icon: BookOpen, title: 'محاكاة واقعية للاختبار', desc: 'بيئة اختبار تحاكي الاختبار الرسمي بدقة عالية من حيث التوقيت والأسئلة والهيكل.' },
  { icon: Brain, title: 'أسئلة مولدة بالذكاء الاصطناعي', desc: 'أسئلة متجددة ومتنوعة يتم توليدها بتقنيات الذكاء الاصطناعي المتقدمة.' },
  { icon: BarChart3, title: 'تقارير أداء تفصيلية', desc: 'تحليل شامل لنقاط القوة والضعف مع توصيات مخصصة للتحسين.' },
  { icon: Clock, title: 'تدريب بالوقت الحقيقي', desc: 'تمارين بتوقيت فعلي لتحسين سرعتك ودقتك في حل الأسئلة.' },
  { icon: Database, title: 'بنك أسئلة متجدد', desc: 'آلاف الأسئلة المتنوعة التي تُحدّث باستمرار لضمان تغطية شاملة.' },
];

const steps = [
  { icon: UserPlus, title: 'سجّل دخولك', desc: 'أنشئ حسابك في ثوانٍ وابدأ فوراً.' },
  { icon: PlayCircle, title: 'ابدأ الاختبار', desc: 'اختر نوع الاختبار وابدأ المحاكاة.' },
  { icon: Award, title: 'احصل على تحليل شامل', desc: 'راجع تقرير أدائك التفصيلي وتعرّف على نقاط التحسين.' },
];

export default function Index() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="container py-20 sm:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-tight">
            منصة ذكية تحاكي اختبار القدرات الرسمي{' '}
            <span className="text-primary">بدقة عالية</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            أسئلة مولدة بالذكاء الاصطناعي، محاكاة حقيقية، تقارير أداء تفصيلية
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="font-bold text-base px-8 py-6">
                ابدأ الآن
              </Button>
            </a>
            <Link to="/free-test">
              <Button size="lg" variant="outline" className="font-bold text-base px-8 py-6">
                جرّب اختبار مجاني
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="container">
          <h2 className="text-2xl sm:text-3xl font-black text-center text-foreground mb-12">
            لماذا <span className="text-primary">SARIS EXAMS</span>؟
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-foreground text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-black text-center text-foreground mb-12">
          كيف تبدأ؟
        </h2>
        <div className="grid gap-8 sm:grid-cols-3 max-w-3xl mx-auto">
          {steps.map((s, i) => (
            <div key={s.title} className="text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mx-auto mb-4 text-xl font-black">
                {i + 1}
              </div>
              <h3 className="font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container text-center">
          <h2 className="text-2xl sm:text-3xl font-black">مستعد لتحقيق أعلى درجة؟</h2>
          <p className="mt-3 opacity-80">ابدأ الآن واستعد لاختبارك بأفضل الأدوات.</p>
          <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="secondary" className="mt-6 font-bold text-base px-10 py-6">
              دخول المنصة الآن
            </Button>
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
