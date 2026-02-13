import { Button } from '@/components/ui/button';
import { MarketingLayout } from '@/components/MarketingLayout';
import { Check } from 'lucide-react';

const plans = [
  {
    name: 'خطة تجريبية',
    price: 'مجاناً',
    period: '',
    features: ['5 اختبارات محاكاة', 'تقرير أداء أساسي', 'بنك أسئلة محدود'],
    highlighted: false,
  },
  {
    name: 'خطة شهرية',
    price: '49',
    period: 'ريال/شهر',
    features: ['اختبارات غير محدودة', 'تقارير أداء تفصيلية', 'أسئلة AI متجددة', 'دعم فني'],
    highlighted: true,
  },
  {
    name: 'خطة كاملة',
    price: '199',
    period: 'ريال/سنة',
    features: ['كل مزايا الشهرية', 'وصول مدى الحياة للبنك', 'أولوية الدعم', 'خصم 60%'],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="container py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">
            خطط <span className="text-primary">الاشتراك</span>
          </h1>
          <p className="mt-4 text-muted-foreground">اختر الخطة المناسبة لك وابدأ رحلة التفوق.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 sm:p-8 flex flex-col ${
                plan.highlighted
                  ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20'
                  : 'bg-card'
              }`}
            >
              <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
              <div className="mt-4 mb-6">
                <span className="text-4xl font-black text-foreground">{plan.price}</span>
                {plan.period && <span className="text-sm text-muted-foreground mr-1"> {plan.period}</span>}
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
                <Button
                  className={`w-full font-bold ${plan.highlighted ? '' : ''}`}
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  اشترك الآن
                </Button>
              </a>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
