import { Button } from '@/components/ui/button';
import { MarketingLayout } from '@/components/MarketingLayout';
import { BarChart3, CheckCircle2, Clock, TrendingUp } from 'lucide-react';

export default function PlatformPreview() {
  return (
    <MarketingLayout>
      <section className="container py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">
            نظرة على <span className="text-primary">المنصة</span>
          </h1>
          <p className="mt-4 text-muted-foreground">اكتشف واجهة المنصة وأدوات التحليل المتقدمة.</p>
        </div>

        {/* Mock dashboard */}
        <div className="grid gap-6 lg:grid-cols-3 mb-10">
          {/* Score card */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-foreground">نتيجة آخر اختبار</h3>
            </div>
            <div className="text-4xl font-black text-primary mb-1">82%</div>
            <p className="text-sm text-muted-foreground">أعلى من 75% من المتدربين</p>
          </div>

          {/* Time card */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-foreground">متوسط زمن الإجابة</h3>
            </div>
            <div className="text-4xl font-black text-foreground mb-1">1:24</div>
            <p className="text-sm text-muted-foreground">دقيقة لكل سؤال</p>
          </div>

          {/* Progress */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-foreground">التقدم العام</h3>
            </div>
            <div className="text-4xl font-black text-foreground mb-1">+12%</div>
            <p className="text-sm text-muted-foreground">تحسّن خلال آخر أسبوعين</p>
          </div>
        </div>

        {/* Mock chart */}
        <div className="rounded-2xl border bg-card p-6 sm:p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-foreground">تحليل الأداء حسب القسم</h3>
          </div>
          <div className="space-y-4">
            {[
              { label: 'القسم الكمّي', pct: 85 },
              { label: 'القسم اللفظي', pct: 72 },
              { label: 'الاستدلال المنطقي', pct: 90 },
              { label: 'القراءة النقدية', pct: 65 },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-foreground">{s.label}</span>
                  <span className="text-muted-foreground">{s.pct}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mock exam UI */}
        <div className="rounded-2xl border bg-card p-6 sm:p-8 mb-14">
          <h3 className="font-bold text-foreground mb-4">واجهة الاختبار</h3>
          <div className="rounded-xl bg-muted p-4 sm:p-6">
            <p className="font-semibold text-foreground mb-4">إذا كان ٣ × ن = ٢٧، فما قيمة ن؟</p>
            <div className="grid grid-cols-2 gap-3">
              {['٦', '٩', '٣', '١٢'].map((o, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-4 py-3 text-center text-sm font-medium ${
                    i === 1 ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'
                  }`}
                >
                  {o}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="font-bold text-base px-10 py-6">
              ابدأ رحلتك الآن
            </Button>
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
