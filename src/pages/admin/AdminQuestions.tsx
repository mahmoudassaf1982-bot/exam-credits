import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Plus, Pencil, Trash2, Check, Search, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Country { id: string; name_ar: string; flag: string; }
interface ExamTemplate { id: string; country_id: string; name_ar: string; slug: string; }
interface ExamSection { id: string; exam_template_id: string; name_ar: string; }
interface Question {
  id: string; country_id: string; exam_template_id: string | null; section_id: string | null;
  topic: string; difficulty: string; text_ar: string; options: any;
  correct_option_id: string; explanation: string | null; is_approved: boolean; source: string;
}

const diffLabels: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
const diffColors: Record<string, string> = { easy: 'bg-success/10 text-success', medium: 'bg-primary/10 text-primary', hard: 'bg-destructive/10 text-destructive' };

export default function AdminQuestions() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCountry, setFilterCountry] = useState('all');
  const [filterExam, setFilterExam] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterApproved, setFilterApproved] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    country_id: '', exam_template_id: '', section_id: '', topic: '', difficulty: 'medium',
    text_ar: '', options: [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
    correct_option_id: 'a', explanation: '', is_approved: false,
  });

  const fetchData = async () => {
    setLoading(true);
    const [cRes, eRes, sRes, qRes] = await Promise.all([
      supabase.from('countries').select('id, name_ar, flag').order('created_at'),
      supabase.from('exam_templates').select('id, country_id, name_ar, slug').order('created_at'),
      supabase.from('exam_sections').select('id, exam_template_id, name_ar').order('order'),
      supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setCountries(cRes.data || []);
    setExams(eRes.data || []);
    setSections((sRes.data || []) as unknown as ExamSection[]);
    setQuestions((qRes.data || []) as unknown as Question[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filteredExams = useMemo(() => filterCountry === 'all' ? exams : exams.filter(e => e.country_id === filterCountry), [filterCountry, exams]);
  const filteredSections = useMemo(() => filterExam === 'all' ? sections : sections.filter(s => s.exam_template_id === filterExam), [filterExam, sections]);

  const filtered = useMemo(() => {
    return questions.filter(q => {
      if (filterCountry !== 'all' && q.country_id !== filterCountry) return false;
      if (filterExam !== 'all' && q.exam_template_id !== filterExam) return false;
      if (filterSection !== 'all' && q.section_id !== filterSection) return false;
      if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
      if (filterApproved === 'approved' && !q.is_approved) return false;
      if (filterApproved === 'pending' && q.is_approved) return false;
      if (searchQuery && !q.text_ar.includes(searchQuery) && !q.topic.includes(searchQuery)) return false;
      return true;
    });
  }, [questions, filterCountry, filterExam, filterSection, filterDifficulty, filterApproved, searchQuery]);

  const openCreate = () => {
    setEditingQ(null);
    setForm({
      country_id: countries[0]?.id || '', exam_template_id: '', section_id: '', topic: '', difficulty: 'medium',
      text_ar: '', options: [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
      correct_option_id: 'a', explanation: '', is_approved: false,
    });
    setShowFormDialog(true);
  };

  const openEdit = (q: Question) => {
    setEditingQ(q);
    const opts = Array.isArray(q.options) ? q.options : [];
    setForm({
      country_id: q.country_id, exam_template_id: q.exam_template_id || '', section_id: q.section_id || '',
      topic: q.topic, difficulty: q.difficulty, text_ar: q.text_ar,
      options: opts.length === 4 ? opts : [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
      correct_option_id: q.correct_option_id, explanation: q.explanation || '', is_approved: q.is_approved,
    });
    setShowFormDialog(true);
  };

  const handleSave = async () => {
    if (!form.text_ar || !form.topic) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (form.options.some(o => !o.textAr)) { toast.error('يرجى ملء جميع الخيارات'); return; }

    const payload = {
      country_id: form.country_id, exam_template_id: form.exam_template_id || null,
      section_id: form.section_id || null, topic: form.topic, difficulty: form.difficulty,
      text_ar: form.text_ar, options: form.options, correct_option_id: form.correct_option_id,
      explanation: form.explanation || null, is_approved: form.is_approved, source: 'manual',
    };

    if (editingQ) {
      const { error } = await supabase.from('questions').update(payload).eq('id', editingQ.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث السؤال'); setShowFormDialog(false); fetchData(); }
    } else {
      const { error } = await supabase.from('questions').insert(payload);
      if (error) toast.error('خطأ في الإضافة');
      else { toast.success('تم إضافة السؤال'); setShowFormDialog(false); fetchData(); }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('questions').delete().eq('id', deleteId);
    if (error) toast.error('خطأ في الحذف');
    else { toast.success('تم حذف السؤال'); fetchData(); }
    setDeleteId(null);
  };

  const toggleApproved = async (q: Question) => {
    await supabase.from('questions').update({ is_approved: !q.is_approved }).eq('id', q.id);
    setQuestions(prev => prev.map(qq => qq.id === q.id ? { ...qq, is_approved: !qq.is_approved } : qq));
  };

  const approvedCount = questions.filter(q => q.is_approved).length;
  const formExams = exams.filter(e => e.country_id === form.country_id);
  const formSections = sections.filter(s => s.exam_template_id === form.exam_template_id);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">بنك الأسئلة</h1>
          <p className="mt-1 text-muted-foreground">{questions.length} سؤال · {approvedCount} معتمد · {questions.length - approvedCount} قيد المراجعة</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">سؤال جديد</span>
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث..." className="pr-9" />
          </div>
          <Select value={filterCountry} onValueChange={(v) => { setFilterCountry(v); setFilterExam('all'); setFilterSection('all'); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="الدولة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الدول</SelectItem>
              {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterExam} onValueChange={(v) => { setFilterExam(v); setFilterSection('all'); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="الاختبار" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الاختبارات</SelectItem>
              {filteredExams.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSection} onValueChange={setFilterSection}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="القسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-[100px]"><SelectValue placeholder="الصعوبة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="easy">سهل</SelectItem>
              <SelectItem value="medium">متوسط</SelectItem>
              <SelectItem value="hard">صعب</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterApproved} onValueChange={setFilterApproved}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="approved">معتمد</SelectItem>
              <SelectItem value="pending">قيد المراجعة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Questions list */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-12 text-center">
            <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-bold">لا توجد أسئلة</p>
          </div>
        ) : filtered.map((q, i) => {
          const country = countries.find(c => c.id === q.country_id);
          const exam = exams.find(e => e.id === q.exam_template_id);
          const section = sections.find(s => s.id === q.section_id);
          const opts = Array.isArray(q.options) ? q.options : [];
          return (
            <div key={q.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-relaxed line-clamp-2">{q.text_ar}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {country && <span className="text-xs">{country.flag}</span>}
                      {exam && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{exam.name_ar}</Badge>}
                      {section && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{section.name_ar}</Badge>}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{q.topic}</Badge>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${diffColors[q.difficulty] || ''}`}>{diffLabels[q.difficulty] || q.difficulty}</span>
                      {q.source === 'ai' && <Badge className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-200">AI</Badge>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${q.is_approved ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {q.is_approved ? 'معتمد' : 'قيد المراجعة'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleApproved(q)} title={q.is_approved ? 'إلغاء الاعتماد' : 'اعتماد'}>
                      <Check className={`h-3.5 w-3.5 ${q.is_approved ? 'text-success' : 'text-muted-foreground'}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Question Form Dialog */}
      <Dialog open={showFormDialog} onOpenChange={(open) => { setShowFormDialog(open); if (!open) setEditingQ(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editingQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>الدولة</Label>
                <Select value={form.country_id} onValueChange={(v) => setForm({ ...form, country_id: v, exam_template_id: '', section_id: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الاختبار</Label>
                <Select value={form.exam_template_id || 'none'} onValueChange={(v) => setForm({ ...form, exam_template_id: v === 'none' ? '' : v, section_id: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— عام —</SelectItem>
                    {formExams.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>القسم</Label>
                <Select value={form.section_id || 'none'} onValueChange={(v) => setForm({ ...form, section_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— عام —</SelectItem>
                    {formSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الموضوع *</Label><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="أمراض القلب" /></div>
              <div className="space-y-2">
                <Label>الصعوبة</Label>
                <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">سهل</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="hard">صعب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>نص السؤال *</Label><Textarea value={form.text_ar} onChange={(e) => setForm({ ...form, text_ar: e.target.value })} className="min-h-[80px]" /></div>
            <div className="space-y-3">
              <Label>الخيارات (اضغط لتحديد الإجابة الصحيحة)</Label>
              {form.options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => setForm({ ...form, correct_option_id: opt.id })}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold flex-shrink-0 transition-all ${form.correct_option_id === opt.id ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                    {String.fromCharCode(65 + idx)}
                  </button>
                  <Input value={opt.textAr} onChange={(e) => {
                    const newOpts = [...form.options]; newOpts[idx] = { ...newOpts[idx], textAr: e.target.value };
                    setForm({ ...form, options: newOpts });
                  }} className="flex-1" placeholder={`الخيار ${String.fromCharCode(65 + idx)}`} />
                </div>
              ))}
            </div>
            <div className="space-y-2"><Label>الشرح (اختياري)</Label><Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} className="min-h-[60px]" /></div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <Label className="cursor-pointer">سؤال معتمد</Label>
              <Switch checked={form.is_approved} onCheckedChange={(v) => setForm({ ...form, is_approved: v })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowFormDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold" disabled={!form.text_ar || !form.topic}>
              {editingQ ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف السؤال</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا السؤال؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}