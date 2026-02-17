import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

interface GeneratedQuestion {
  id: string;
  text_ar: string;
  topic: string;
  difficulty: string;
  options: { id: string; textAr: string }[];
  correct_option_id: string;
  explanation: string | null;
}

export default function AdminAIGenerator() {
  const { toast } = useToast();
  const [autoLoading, setAutoLoading] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [results, setResults] = useState<GeneratedQuestion[]>([]);

  // Custom form state
  const [subject, setSubject] = useState('mathematics');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(5);

  const handleGenerate = async (mode: 'automatic' | 'custom') => {
    const setLoading = mode === 'automatic' ? setAutoLoading : setCustomLoading;
    setLoading(true);
    setResults([]);

    try {
      const body = mode === 'automatic'
        ? { mode: 'automatic' as const, countryId: 'kw' }
        : { mode: 'custom' as const, subject, topic: topic || undefined, difficulty, count, countryId: 'kw' };

      const { data, error } = await supabase.functions.invoke('generate-questions', { body });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const questions = (data?.questions || []).map((q: any) => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      }));

      setResults(questions);
      toast({
        title: 'تم التوليد بنجاح ✨',
        description: `تم توليد ${questions.length} سؤال وحفظها في بنك الأسئلة`,
      });
    } catch (e: any) {
      toast({ title: 'خطأ', description: e.message || 'فشل في توليد الأسئلة', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const difficultyLabel: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  const difficultyColor: Record<string, string> = {
    easy: 'text-success bg-success/10',
    medium: 'text-gold bg-gold/10',
    hard: 'text-destructive bg-destructive/10',
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          توليد الأسئلة بالذكاء الاصطناعي
        </h1>
        <p className="mt-1 text-muted-foreground">توليد أسئلة اختبارات أكاديمية عالية الجودة تلقائياً</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Automatic Generation */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">توليد تلقائي</CardTitle>
              <CardDescription>توليد امتحان كامل وفق معايير اختبار القدرات - جامعة الكويت</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                سيتم توليد 15 سؤال تلقائياً: 5 رياضيات، 5 إنجليزي، 5 عربي بمستويات صعوبة متنوعة.
              </p>
              <Button
                onClick={() => handleGenerate('automatic')}
                disabled={autoLoading || customLoading}
                className="w-full gradient-primary text-primary-foreground"
                size="lg"
              >
                {autoLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-2" />جارٍ التوليد...</>
                ) : (
                  <><Sparkles className="h-4 w-4 ml-2" />توليد امتحان كامل تلقائياً</>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Custom Generation */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">توليد مخصص</CardTitle>
              <CardDescription>حدد المادة والموضوع ومستوى الصعوبة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>المادة</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mathematics">الرياضيات</SelectItem>
                      <SelectItem value="english">اللغة الإنجليزية</SelectItem>
                      <SelectItem value="arabic">اللغة العربية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>مستوى الصعوبة</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">سهل</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="hard">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>الموضوع (اختياري)</Label>
                <Input
                  placeholder="مثال: المعادلات التربيعية"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>عدد الأسئلة</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
              <Button
                onClick={() => handleGenerate('custom')}
                disabled={autoLoading || customLoading}
                className="w-full"
                size="lg"
              >
                {customLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-2" />جارٍ التوليد...</>
                ) : (
                  'توليد أسئلة مخصصة'
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              تم توليد {results.length} سؤال
            </h2>
            <Link to="/app/admin/questions">
              <Button variant="outline" size="sm">
                <BookOpen className="h-4 w-4 ml-2" />
                عرض بنك الأسئلة
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {results.map((q, i) => (
              <Card key={q.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${difficultyColor[q.difficulty] || ''}`}>
                          {difficultyLabel[q.difficulty] || q.difficulty}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{q.topic}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground mb-2">{q.text_ar}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(q.options || []).map((opt) => (
                          <div
                            key={opt.id}
                            className={`text-xs px-3 py-1.5 rounded-lg border ${
                              opt.id === q.correct_option_id
                                ? 'border-success/50 bg-success/10 text-success font-semibold'
                                : 'border-border bg-muted/30 text-muted-foreground'
                            }`}
                          >
                            {opt.textAr}
                          </div>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted/30 rounded-lg p-2">
                          💡 {q.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
