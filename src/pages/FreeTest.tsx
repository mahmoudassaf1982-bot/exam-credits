import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MarketingLayout } from '@/components/MarketingLayout';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

const questions = [
  {
    q: 'إذا كان ثمن 5 كتب هو 75 ريالاً، فما ثمن 8 كتب؟',
    options: ['100 ريال', '110 ريال', '120 ريال', '130 ريال'],
    answer: 2,
  },
  {
    q: 'أكمل السلسلة: 2، 6، 18، 54، ...؟',
    options: ['108', '162', '148', '216'],
    answer: 1,
  },
  {
    q: 'إذا كان عمر أحمد ضعف عمر خالد، ومجموع عمريهما 36 سنة، فكم عمر خالد؟',
    options: ['10 سنوات', '12 سنة', '14 سنة', '18 سنة'],
    answer: 1,
  },
  {
    q: 'ما مساحة مستطيل طوله 12 سم وعرضه 5 سم؟',
    options: ['34 سم²', '60 سم²', '17 سم²', '120 سم²'],
    answer: 1,
  },
  {
    q: 'إذا سار قطار بسرعة 90 كم/ساعة لمدة ساعتين، فكم قطع من المسافة؟',
    options: ['45 كم', '90 كم', '180 كم', '270 كم'],
    answer: 2,
  },
];

const TOTAL_TIME = 300; // 5 minutes

export default function FreeTest() {
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null));
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);

  useEffect(() => {
    if (!started || finished) return;
    if (timeLeft <= 0) { setFinished(true); return; }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [started, finished, timeLeft]);

  const handleSelect = (idx: number) => {
    setSelected(idx);
    const copy = [...answers];
    copy[current] = idx;
    setAnswers(copy);
  };

  const next = useCallback(() => {
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
      setSelected(null);
    } else {
      setFinished(true);
    }
  }, [current]);

  const score = answers.reduce<number>((acc, a, i) => (a === questions[i].answer ? acc + 1 : acc), 0);
  const pct = Math.round((score / questions.length) * 100);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!started) {
    return (
      <MarketingLayout>
        <section className="container py-20 text-center max-w-xl mx-auto">
          <h1 className="text-3xl font-black text-foreground mb-4">اختبار تجريبي مجاني</h1>
          <p className="text-muted-foreground mb-2">5 أسئلة — 5 دقائق</p>
          <p className="text-sm text-muted-foreground mb-8">اختبر مستواك الآن في محاكاة سريعة لاختبار القدرات.</p>
          <Button size="lg" className="font-bold text-base px-10 py-6" onClick={() => setStarted(true)}>
            ابدأ الاختبار
          </Button>
        </section>
      </MarketingLayout>
    );
  }

  if (finished) {
    return (
      <MarketingLayout>
        <section className="container py-20 text-center max-w-lg mx-auto">
          <div className={`inline-flex h-20 w-20 items-center justify-center rounded-full text-3xl font-black mb-6 ${pct >= 60 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {pct}%
          </div>
          <h2 className="text-2xl font-black text-foreground mb-2">نتيجتك: {score}/{questions.length}</h2>
          <p className="text-muted-foreground mb-8">
            للحصول على تقرير أداء كامل وتحليل متقدم، انتقل إلى المنصة.
          </p>
          <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="font-bold px-10 py-6">
              انتقل إلى المنصة
            </Button>
          </a>
        </section>
      </MarketingLayout>
    );
  }

  const q = questions[current];

  return (
    <MarketingLayout>
      <section className="container py-12 max-w-2xl mx-auto">
        {/* Progress & timer */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-muted-foreground">
            سؤال {current + 1} من {questions.length}
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full mb-8">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="rounded-2xl border bg-card p-6 sm:p-8 mb-6">
          <h3 className="text-lg font-bold text-foreground mb-6">{q.q}</h3>
          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`w-full text-right rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  selected === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40 text-foreground'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full font-bold py-5" disabled={selected === null} onClick={next}>
          {current === questions.length - 1 ? 'إنهاء الاختبار' : 'السؤال التالي'}
        </Button>
      </section>
    </MarketingLayout>
  );
}
