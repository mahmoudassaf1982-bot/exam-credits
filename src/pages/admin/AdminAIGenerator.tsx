import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface GeneratedQuestion {
  id: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  correct_option_id: string;
  explanation: string | null;
}

interface Country { id: string; name_ar: string; flag: string; }
interface ExamTemplate { id: string; country_id: string; name_ar: string; }

const optionLabels = ['أ', 'ب', 'ج', 'د'];

function DebugDetails({ rawExcerpt }: { rawExcerpt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        تفاصيل الاستجابة
      </button>
      {open && (
        <pre dir="ltr" className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
          {rawExcerpt}
        </pre>
      )}
    </div>
  );
}

export default function AdminAIGenerator() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeneratedQuestion[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);

  const [country, setCountry] = useState('');
  const [examTemplateId, setExamTemplateId] = useState('');
  const [numberOfQuestions, setNumberOfQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [progress, setProgress] = useState('');
  const [debugInfo, setDebugInfo] = useState<{ stage: string; error: string; rawExcerpt: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [cRes, eRes] = await Promise.all([
        supabase.from('countries').select('id, name_ar, flag').eq('is_active', true).order('created_at'),
        supabase.from('exam_templates').select('id, country_id, name_ar').eq('is_active', true).order('created_at'),
      ]);
      const countriesList = cRes.data || [];
      setCountries(countriesList);
      setExams(eRes.data || []);
      if (countriesList.length > 0 && !country) setCountry(countriesList[0].id);
    };
    fetchData();
  }, []);

  const filteredExams = exams.filter(e => e.country_id === country);

  useEffect(() => {
    // Reset exam when country changes
    if (!filteredExams.find(e => e.id === examTemplateId)) {
      setExamTemplateId(filteredExams[0]?.id || '');
    }
  }, [country, filteredExams]);

  const callGenerate = async (count: number): Promise<any[]> => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generateQuestionsWithResearch`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ country, examTemplateId: examTemplateId || null, numberOfQuestions: count, difficulty, debug: true }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Non-JSON response:', responseText.substring(0, 300));
      throw new Error('الخادم أرجع استجابة غير صالحة — قد يكون السبب انتهاء المهلة الزمنية. جرّب عدد أسئلة أقل.');
    }
    if (!response.ok || data?.ok === false) {
      const stage = data?.stage || 'unknown';
      const errMsg = data?.error || `HTTP ${response.status}`;
      const details = data?.details || {};
      console.log('AI_DEBUG_RESPONSE', response);
      console.error('[AI-Gen DEBUG]', { stage, error: errMsg, details });
      setDebugInfo({ stage, error: errMsg, rawExcerpt: details.raw_excerpt || details.raw_output_excerpt || details.raw_preview || JSON.stringify(details).substring(0, 500) });
      throw new Error(`[${stage}] - ${errMsg}`);
    }
    return (data?.questions || []).map((q: any) => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    }));
  };

  const handleGenerate = async () => {
    if (!country) { toast({ title: 'يرجى اختيار الدولة', variant: 'destructive' }); return; }
    setLoading(true);
    setResults([]);
    setProgress('');
    setDebugInfo(null);

    try {
      const BATCH_SIZE = 15;
      const allQuestions: any[] = [];

      if (numberOfQuestions <= BATCH_SIZE) {
        setProgress(`جارٍ توليد ${numberOfQuestions} سؤال...`);
        const questions = await callGenerate(numberOfQuestions);
        allQuestions.push(...questions);
      } else {
        // Split into batches to avoid gateway timeout
        const batches: number[] = [];
        let remaining = numberOfQuestions;
        while (remaining > 0) {
          const batch = Math.min(remaining, BATCH_SIZE);
          batches.push(batch);
          remaining -= batch;
        }

        for (let i = 0; i < batches.length; i++) {
          setProgress(`جارٍ توليد الدفعة ${i + 1} من ${batches.length} (${allQuestions.length}/${numberOfQuestions} سؤال)...`);
          const questions = await callGenerate(batches[i]);
          allQuestions.push(...questions);
        }
      }

      setResults(allQuestions);
      setProgress('');
      toast({ title: 'تم توليد الأسئلة بنجاح! ✨', description: `تم توليد ${allQuestions.length} سؤال وحفظها في بنك الأسئلة` });
    } catch (e: any) {
      setProgress('');
      toast({ title: 'خطأ', description: e?.message ?? 'UNKNOWN_DEBUG_ERROR', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />لوحة توليد الأسئلة الذكية
        </h1>
        <p className="mt-1 text-muted-foreground">استخدم الذكاء الاصطناعي لتوليد أسئلة امتحانات احترافية</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardHeader><CardTitle className="text-lg">إعدادات التوليد</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الدولة</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue placeholder="اختر الدولة" /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الاختبار</Label>
                <Select value={examTemplateId} onValueChange={setExamTemplateId}>
                  <SelectTrigger><SelectValue placeholder="اختر الاختبار" /></SelectTrigger>
                  <SelectContent>
                    {filteredExams.length === 0 ? (
                      <SelectItem value="none" disabled>لا توجد اختبارات لهذه الدولة</SelectItem>
                    ) : filteredExams.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>عدد الأسئلة</Label>
                <Input type="number" min={1} max={50} value={numberOfQuestions}
                  onChange={(e) => setNumberOfQuestions(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} />
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
            <Button onClick={handleGenerate} disabled={loading || !country} className="w-full gradient-primary text-primary-foreground" size="lg">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />{progress || 'جارٍ التوليد...'}</> : <><Sparkles className="h-4 w-4 ml-2" />توليد الأسئلة</>}
            </Button>
            {numberOfQuestions > 15 && !loading && (
              <p className="text-xs text-muted-foreground text-center">سيتم تقسيم التوليد إلى دفعات لضمان الاستقرار</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {debugInfo && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-destructive">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                فشل التوليد — المرحلة: <code className="bg-muted px-2 py-0.5 rounded text-sm">{debugInfo.stage}</code>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">{debugInfo.error}</p>
              {debugInfo.rawExcerpt && <DebugDetails rawExcerpt={debugInfo.rawExcerpt} />}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-success" />
            <h2 className="text-lg font-bold">تم توليد {results.length} سؤال</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-12">#</TableHead>
                      <TableHead className="text-right">السؤال</TableHead>
                      <TableHead className="text-right">أ</TableHead>
                      <TableHead className="text-right">ب</TableHead>
                      <TableHead className="text-right">ج</TableHead>
                      <TableHead className="text-right">د</TableHead>
                      <TableHead className="text-right">الإجابة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((q, i) => {
                      const correctIdx = q.options.findIndex(o => o.id === q.correct_option_id);
                      return (
                        <TableRow key={q.id}>
                          <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                          <TableCell className="font-medium min-w-[200px]">{q.text_ar}</TableCell>
                          {q.options.map(opt => (
                            <TableCell key={opt.id} className={opt.id === q.correct_option_id ? 'text-success font-semibold' : ''}>{opt.textAr}</TableCell>
                          ))}
                          {Array.from({ length: Math.max(0, 4 - q.options.length) }).map((_, fi) => <TableCell key={`e-${fi}`}>-</TableCell>)}
                          <TableCell className="font-bold text-success">{correctIdx >= 0 ? optionLabels[correctIdx] : '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}