import { MarketingLayout } from '@/components/MarketingLayout';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqs = [
  {
    q: 'ما طبيعة الأسئلة في المنصة؟',
    a: 'الأسئلة مصممة لتحاكي اختبار القدرات الرسمي وتشمل الأقسام الكمية واللفظية والاستدلالية. يتم توليد أسئلة جديدة باستمرار باستخدام الذكاء الاصطناعي.',
  },
  {
    q: 'هل المنصة تحاكي الاختبار الرسمي فعلاً؟',
    a: 'نعم، بيئة الاختبار مصممة لتكون مطابقة للاختبار الرسمي من حيث عدد الأسئلة والتوقيت وطريقة العرض، مما يمنحك تجربة واقعية بالكامل.',
  },
  {
    q: 'هل توجد تقارير تحليل للأداء؟',
    a: 'نعم، بعد كل اختبار تحصل على تقرير تفصيلي يوضح نقاط قوتك وضعفك في كل قسم مع توصيات مخصصة للتحسين.',
  },
  {
    q: 'ما مدة الاشتراك المتاحة؟',
    a: 'نوفر خطة تجريبية مجانية، واشتراك شهري، واشتراك سنوي بخصم كبير. يمكنك الاطلاع على التفاصيل في صفحة الأسعار.',
  },
  {
    q: 'ما طرق الدفع المتاحة؟',
    a: 'يمكنك الدفع عبر PayPal أو البطاقات البنكية (Visa / Mastercard). جميع عمليات الدفع مؤمنة بالكامل.',
  },
  {
    q: 'هل يوجد تطبيق للجوال؟',
    a: 'المنصة مصممة بالكامل لتعمل بسلاسة على الجوال والأجهزة اللوحية من خلال المتصفح دون الحاجة لتحميل تطبيق منفصل.',
  },
];

export default function FAQPage() {
  return (
    <MarketingLayout>
      <section className="container py-16 sm:py-20 max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">
            الأسئلة <span className="text-primary">الشائعة</span>
          </h1>
          <p className="mt-4 text-muted-foreground">إجابات سريعة على أكثر الأسئلة تكراراً.</p>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`q-${i}`} className="rounded-xl border bg-card px-5">
              <AccordionTrigger className="text-right font-semibold text-foreground hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </MarketingLayout>
  );
}
