import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowLeft, Cog } from 'lucide-react';
import ActiveJobsBadge from '@/components/admin/ActiveJobsBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface Country { id: string; name_ar: string; flag: string; }
interface ExamTemplate { id: string; country_id: string; name_ar: string; }
interface ExamSection { id: string; exam_template_id: string; name_ar: string; order: number; }

export default function AdminAIGenerator() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);
  const [sections, setSections] = useState<ExamSection[]>([]);

  const [country, setCountry] = useState('');
  const [examTemplateId, setExamTemplateId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [numberOfQuestions, setNumberOfQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [contentLang, setContentLang] = useState<'auto' | 'en' | 'ar'>('auto');
  const [lastResult, setLastResult] = useState<{ draft_id?: string; job_id: string; question_count?: number; content_language?: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [cRes, eRes, sRes] = await Promise.all([
        supabase.from('countries').select('id, name_ar, flag').eq('is_active', true).order('created_at'),
        supabase.from('exam_templates').select('id, country_id, name_ar').eq('is_active', true).order('created_at'),
        supabase.from('exam_sections').select('id, exam_template_id, name_ar, order').order('order'),
      ]);
      const countriesList = cRes.data || [];
      setCountries(countriesList);
      setExams(eRes.data || []);
      setSections((sRes.data || []) as ExamSection[]);
      if (countriesList.length > 0 && !country) setCountry(countriesList[0].id);
    };
    fetchData();
  }, []);

  const filteredExams = exams.filter(e => e.country_id === country);
  const filteredSections = sections.filter(s => s.exam_template_id === examTemplateId);

  useEffect(() => {
    if (!filteredExams.find(e => e.id === examTemplateId)) {
      setExamTemplateId('');
    }
    setSectionId('');
  }, [country]);

  useEffect(() => {
    setSectionId('');
  }, [examTemplateId]);

  const handleGenerate = async () => {
    if (!country) { toast({ title: 'يرجى اختيار الدولة', variant: 'destructive' }); return; }
    setLoading(true);
    setLastResult(null);

    try {
      const params: any = {
        country_id: country,
        exam_template_id: examTemplateId || null,
        section_id: sectionId || null,
        difficulty,
        count: numberOfQuestions,
      };
      if (contentLang !== 'auto') params.content_language = contentLang;

      const { data, error } = await supabase.functions.invoke('ai-enqueue', {
        body: {
          type: 'generate_draft',
          params,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setLastResult({
        job_id: data.job_id,
      });

      toast({ title: `تم إضافة مهمة التوليد للطابور ✨ — يمكنك إغلاق الصفحة بأمان` });
    } catch (e: any) {
      toast({ title: 'خطأ في التوليد', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          لوحة توليد الأسئلة الذكية
        </h1>
        <p className="mt-1 text-muted-foreground">
          توليد مسودات أسئلة بالذكاء الاصطناعي ← ثم مراجعتها واعتمادها من{' '}
          <button onClick={() => navigate('/app/admin/review-queue')} className="text-primary underline hover:no-underline">
            طابور المراجعة
          </button>
        </p>
        <div className="mt-3">
          <ActiveJobsBadge />
        </div>
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
                    <SelectItem value="none">عام</SelectItem>
                    {filteredExams.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {examTemplateId && examTemplateId !== 'none' && filteredSections.length > 0 && (
                <div className="space-y-2">
                  <Label>القسم</Label>
                  <Select value={sectionId || 'all'} onValueChange={(v) => setSectionId(v === 'all' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="جميع الأقسام" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأقسام</SelectItem>
                      {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>لغة المحتوى</Label>
                <Select value={contentLang} onValueChange={(v) => setContentLang(v as 'auto' | 'en' | 'ar')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">🔄 تلقائي (حسب المادة)</SelectItem>
                    <SelectItem value="en">🇬🇧 English</SelectItem>
                    <SelectItem value="ar">🇸🇦 عربي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={loading || !country} className="w-full gradient-primary text-primary-foreground" size="lg">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />جارٍ التوليد...</> : <><Sparkles className="h-4 w-4 ml-2" />توليد المسودة</>}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Success Result */}
      {lastResult && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-lg">تم إضافة المهمة للطابور بنجاح!</h3>
                  <p className="text-sm text-muted-foreground">
                    يمكنك إغلاق الصفحة بأمان — المهمة تعمل في الخلفية
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={() => navigate('/app/admin/jobs')} className="gradient-primary text-primary-foreground">
                  <Cog className="h-4 w-4 ml-2" />
                  متابعة المهام
                </Button>
                <Button onClick={() => navigate('/app/admin/review-queue')} variant="outline">
                  <ArrowLeft className="h-4 w-4 ml-2" />
                  طابور المراجعة
                </Button>
                <Button variant="outline" onClick={() => setLastResult(null)}>
                  توليد مسودة أخرى
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
