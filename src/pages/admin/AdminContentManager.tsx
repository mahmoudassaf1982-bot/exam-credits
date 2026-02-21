import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, BookOpen, HelpCircle, Plus, Pencil, Trash2, ChevronLeft, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Types
interface Country {
  id: string;
  name: string;
  name_ar: string;
  flag: string;
  currency: string;
  is_active: boolean;
}

interface ExamTemplate {
  id: string;
  country_id: string;
  slug: string;
  name_ar: string;
  description_ar: string;
  is_active: boolean;
  default_question_count: number;
  default_time_limit_sec: number;
  simulation_cost_points: number;
  practice_cost_points: number;
  analysis_cost_points: number;
}

interface Question {
  id: string;
  country_id: string;
  exam_template_id: string | null;
  topic: string;
  difficulty: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  correct_option_id: string;
  explanation: string | null;
  is_approved: boolean;
  source: string;
}

type View = 'countries' | 'exams' | 'questions';

export default function AdminContentManager() {
  const [view, setView] = useState<View>('countries');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedExam, setSelectedExam] = useState<ExamTemplate | null>(null);

  // Data
  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [showCountryDialog, setShowCountryDialog] = useState(false);
  const [showExamDialog, setShowExamDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: View; id: string } | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Forms
  const [countryForm, setCountryForm] = useState({ id: '', name: '', name_ar: '', flag: '', currency: 'USD' });
  const [examForm, setExamForm] = useState({ name_ar: '', slug: '', description_ar: '', default_question_count: 100, default_time_limit_sec: 7200 });
  const [questionForm, setQuestionForm] = useState({
    text_ar: '', topic: '', difficulty: 'medium' as string,
    options: [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
    correct_option_id: 'a', explanation: '',
  });

  // Fetch countries
  const fetchCountries = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('countries').select('*').order('created_at');
    if (error) { toast.error('خطأ في تحميل الدول'); console.error(error); }
    else setCountries(data || []);
    setLoading(false);
  };

  // Fetch exams for country
  const fetchExams = async (countryId: string) => {
    setLoading(true);
    const { data, error } = await supabase.from('exam_templates').select('*').eq('country_id', countryId).order('created_at');
    if (error) { toast.error('خطأ في تحميل الاختبارات'); console.error(error); }
    else setExams(data || []);
    setLoading(false);
  };

  // Fetch questions for exam
  const fetchQuestions = async (examTemplateId: string) => {
    setLoading(true);
    const { data, error } = await supabase.from('questions').select('*').eq('exam_template_id', examTemplateId).order('created_at', { ascending: false });
    if (error) { toast.error('خطأ في تحميل الأسئلة'); console.error(error); }
    else setQuestions((data || []) as unknown as Question[]);
    setLoading(false);
  };

  useEffect(() => { fetchCountries(); }, []);

  // Navigation
  const navigateToExams = (country: Country) => {
    setSelectedCountry(country);
    setView('exams');
    fetchExams(country.id);
  };

  const navigateToQuestions = (exam: ExamTemplate) => {
    setSelectedExam(exam);
    setView('questions');
    fetchQuestions(exam.id);
  };

  const goBack = () => {
    if (view === 'questions') { setView('exams'); setSelectedExam(null); }
    else if (view === 'exams') { setView('countries'); setSelectedCountry(null); }
  };

  // ── Country CRUD ──
  const openCountryCreate = () => {
    setEditingItem(null);
    setCountryForm({ id: '', name: '', name_ar: '', flag: '', currency: 'USD' });
    setShowCountryDialog(true);
  };
  const openCountryEdit = (c: Country) => {
    setEditingItem(c);
    setCountryForm({ id: c.id, name: c.name, name_ar: c.name_ar, flag: c.flag, currency: c.currency });
    setShowCountryDialog(true);
  };
  const saveCountry = async () => {
    if (!countryForm.name_ar || !countryForm.id) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (editingItem) {
      const { error } = await supabase.from('countries').update({
        name: countryForm.name, name_ar: countryForm.name_ar, flag: countryForm.flag, currency: countryForm.currency,
      }).eq('id', editingItem.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث الدولة'); setShowCountryDialog(false); fetchCountries(); }
    } else {
      const { error } = await supabase.from('countries').insert({
        id: countryForm.id.toLowerCase(), name: countryForm.name, name_ar: countryForm.name_ar,
        flag: countryForm.flag, currency: countryForm.currency,
      });
      if (error) { toast.error(error.message.includes('duplicate') ? 'هذا الرمز مستخدم بالفعل' : 'خطأ في الإضافة'); }
      else { toast.success('تم إضافة الدولة'); setShowCountryDialog(false); fetchCountries(); }
    }
  };
  const toggleCountryActive = async (c: Country) => {
    await supabase.from('countries').update({ is_active: !c.is_active }).eq('id', c.id);
    fetchCountries();
  };

  // ── Exam CRUD ──
  const openExamCreate = () => {
    setEditingItem(null);
    setExamForm({ name_ar: '', slug: '', description_ar: '', default_question_count: 100, default_time_limit_sec: 7200 });
    setShowExamDialog(true);
  };
  const openExamEdit = (e: ExamTemplate) => {
    setEditingItem(e);
    setExamForm({ name_ar: e.name_ar, slug: e.slug, description_ar: e.description_ar, default_question_count: e.default_question_count, default_time_limit_sec: e.default_time_limit_sec });
    setShowExamDialog(true);
  };
  const saveExam = async () => {
    if (!examForm.name_ar) { toast.error('يرجى إدخال اسم الاختبار'); return; }
    if (editingItem) {
      const { error } = await supabase.from('exam_templates').update({
        name_ar: examForm.name_ar, slug: examForm.slug, description_ar: examForm.description_ar,
        default_question_count: examForm.default_question_count, default_time_limit_sec: examForm.default_time_limit_sec,
      }).eq('id', editingItem.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث الاختبار'); setShowExamDialog(false); fetchExams(selectedCountry!.id); }
    } else {
      const { error } = await supabase.from('exam_templates').insert({
        country_id: selectedCountry!.id, name_ar: examForm.name_ar, slug: examForm.slug,
        description_ar: examForm.description_ar, default_question_count: examForm.default_question_count,
        default_time_limit_sec: examForm.default_time_limit_sec,
      });
      if (error) toast.error('خطأ في الإضافة');
      else { toast.success('تم إضافة الاختبار'); setShowExamDialog(false); fetchExams(selectedCountry!.id); }
    }
  };

  // ── Question CRUD ──
  const openQuestionCreate = () => {
    setEditingItem(null);
    setQuestionForm({
      text_ar: '', topic: '', difficulty: 'medium',
      options: [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
      correct_option_id: 'a', explanation: '',
    });
    setShowQuestionDialog(true);
  };
  const openQuestionEdit = (q: Question) => {
    setEditingItem(q);
    const opts = Array.isArray(q.options) ? q.options : [];
    setQuestionForm({
      text_ar: q.text_ar, topic: q.topic, difficulty: q.difficulty,
      options: opts.length === 4 ? opts : [{ id: 'a', textAr: '' }, { id: 'b', textAr: '' }, { id: 'c', textAr: '' }, { id: 'd', textAr: '' }],
      correct_option_id: q.correct_option_id, explanation: q.explanation || '',
    });
    setShowQuestionDialog(true);
  };
  const saveQuestion = async () => {
    if (!questionForm.text_ar || !questionForm.topic) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (questionForm.options.some(o => !o.textAr)) { toast.error('يرجى ملء جميع الخيارات'); return; }
    const payload = {
      text_ar: questionForm.text_ar, topic: questionForm.topic, difficulty: questionForm.difficulty,
      options: questionForm.options, correct_option_id: questionForm.correct_option_id,
      explanation: questionForm.explanation || null, country_id: selectedCountry!.id,
      exam_template_id: selectedExam!.id, source: 'manual',
    };
    if (editingItem) {
      const { error } = await supabase.from('questions').update(payload).eq('id', editingItem.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث السؤال'); setShowQuestionDialog(false); fetchQuestions(selectedExam!.id); }
    } else {
      const { error } = await supabase.from('questions').insert(payload);
      if (error) toast.error('خطأ في الإضافة');
      else { toast.success('تم إضافة السؤال'); setShowQuestionDialog(false); fetchQuestions(selectedExam!.id); }
    }
  };

  // ── Delete with safety checks ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;

    if (type === 'countries') {
      const { count } = await supabase.from('exam_templates').select('id', { count: 'exact', head: true }).eq('country_id', id);
      if (count && count > 0) {
        toast.error(`لا يمكن حذف هذه الدولة لأنها تحتوي على ${count} اختبار(ات). احذف الاختبارات أولاً.`);
        setDeleteTarget(null); return;
      }
      const { error } = await supabase.from('countries').delete().eq('id', id);
      if (error) toast.error('خطأ في الحذف');
      else { toast.success('تم حذف الدولة'); fetchCountries(); }
    } else if (type === 'exams') {
      const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('exam_template_id', id);
      if (count && count > 0) {
        toast.error(`لا يمكن حذف هذا الاختبار لأنه يحتوي على ${count} سؤال(أسئلة). احذف الأسئلة أولاً.`);
        setDeleteTarget(null); return;
      }
      const { error } = await supabase.from('exam_templates').delete().eq('id', id);
      if (error) toast.error('خطأ في الحذف');
      else { toast.success('تم حذف الاختبار'); fetchExams(selectedCountry!.id); }
    } else if (type === 'questions') {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) toast.error('خطأ في الحذف');
      else { toast.success('تم حذف السؤال'); fetchQuestions(selectedExam!.id); }
    }
    setDeleteTarget(null);
  };

  // Breadcrumb
  const breadcrumb = () => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
      <button onClick={() => { setView('countries'); setSelectedCountry(null); setSelectedExam(null); }}
        className="hover:text-foreground transition-colors font-medium">
        الدول
      </button>
      {selectedCountry && (
        <>
          <ChevronLeft className="h-3.5 w-3.5" />
          <button onClick={() => { setView('exams'); setSelectedExam(null); }}
            className="hover:text-foreground transition-colors font-medium">
            {selectedCountry.flag} {selectedCountry.name_ar}
          </button>
        </>
      )}
      {selectedExam && (
        <>
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="text-foreground font-semibold">{selectedExam.name_ar}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {view !== 'countries' && (
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9">
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">إدارة المحتوى التعليمي</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {view === 'countries' && `${countries.length} دولة`}
              {view === 'exams' && `${exams.length} اختبار في ${selectedCountry?.name_ar}`}
              {view === 'questions' && `${questions.length} سؤال في ${selectedExam?.name_ar}`}
            </p>
          </div>
        </div>
        <Button
          onClick={view === 'countries' ? openCountryCreate : view === 'exams' ? openExamCreate : openQuestionCreate}
          className="gradient-primary text-primary-foreground font-bold gap-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">
            {view === 'countries' ? 'دولة جديدة' : view === 'exams' ? 'اختبار جديد' : 'سؤال جديد'}
          </span>
        </Button>
      </motion.div>

      {breadcrumb()}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ── Countries View ── */}
          {view === 'countries' && (
            <motion.div key="countries" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {countries.map((c) => (
                <div key={c.id} className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer group"
                  onClick={() => navigateToExams(c)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{c.flag}</span>
                      <div>
                        <h3 className="font-bold text-foreground">{c.name_ar}</h3>
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">{c.id.toUpperCase()} · {c.currency}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCountryEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ type: 'countries', id: c.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 flex-1">
                      <span className="text-sm text-muted-foreground">مفعّلة</span>
                      <Switch checked={c.is_active} onCheckedChange={() => toggleCountryActive(c)} className="mr-auto" />
                    </div>
                  </div>
                </div>
              ))}
              {countries.length === 0 && (
                <div className="col-span-full text-center py-16 text-muted-foreground">
                  <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لا توجد دول مسجلة بعد</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Exams View ── */}
          {view === 'exams' && (
            <motion.div key="exams" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exams.map((e) => (
                <div key={e.id} className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer group"
                  onClick={() => navigateToQuestions(e)}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground">{e.name_ar}</h3>
                      {e.slug && <p className="text-xs text-muted-foreground font-mono" dir="ltr">{e.slug.toUpperCase()}</p>}
                      {e.description_ar && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description_ar}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(ev) => ev.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openExamEdit(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ type: 'exams', id: e.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{e.default_question_count} سؤال</Badge>
                    <Badge variant="secondary">{Math.floor(e.default_time_limit_sec / 60)} دقيقة</Badge>
                    {!e.is_active && <Badge variant="destructive">معطّل</Badge>}
                  </div>
                </div>
              ))}
              {exams.length === 0 && (
                <div className="col-span-full text-center py-16 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لا توجد اختبارات لهذه الدولة بعد</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Questions View ── */}
          {view === 'questions' && (
            <motion.div key="questions" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-3">
              {questions.map((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                return (
                  <div key={q.id} className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                          <Badge variant={q.difficulty === 'easy' ? 'secondary' : q.difficulty === 'hard' ? 'destructive' : 'default'} className="text-[10px]">
                            {q.difficulty === 'easy' ? 'سهل' : q.difficulty === 'hard' ? 'صعب' : 'متوسط'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{q.topic}</Badge>
                          {q.source === 'ai' && <Badge className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-200">AI</Badge>}
                          {q.is_approved ? (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200">معتمد</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">قيد المراجعة</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground leading-relaxed">{q.text_ar}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openQuestionEdit(q)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ type: 'questions', id: q.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {opts.map((o: any) => (
                        <div key={o.id} className={`rounded-lg px-3 py-2 text-xs border ${o.id === q.correct_option_id ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border-border bg-muted/30'}`}>
                          {o.textAr}
                        </div>
                      ))}
                    </div>
                    {q.explanation && <p className="text-xs text-muted-foreground mt-2 bg-muted/30 rounded-lg p-2">{q.explanation}</p>}
                  </div>
                );
              })}
              {questions.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لا توجد أسئلة لهذا الاختبار بعد</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Country Dialog ── */}
      <Dialog open={showCountryDialog} onOpenChange={setShowCountryDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editingItem ? 'تعديل الدولة' : 'إضافة دولة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الرمز (ID)</Label>
                <Input value={countryForm.id} onChange={(e) => setCountryForm({ ...countryForm, id: e.target.value.toLowerCase() })}
                  placeholder="sa" dir="ltr" className="text-center font-mono" disabled={!!editingItem} />
              </div>
              <div className="space-y-2">
                <Label>العلم (Emoji)</Label>
                <Input value={countryForm.flag} onChange={(e) => setCountryForm({ ...countryForm, flag: e.target.value })}
                  placeholder="🇸🇦" className="text-center text-2xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الاسم بالعربي *</Label>
              <Input value={countryForm.name_ar} onChange={(e) => setCountryForm({ ...countryForm, name_ar: e.target.value })} placeholder="السعودية" />
            </div>
            <div className="space-y-2">
              <Label>الاسم بالإنجليزي</Label>
              <Input value={countryForm.name} onChange={(e) => setCountryForm({ ...countryForm, name: e.target.value })} placeholder="Saudi Arabia" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>العملة</Label>
              <Input value={countryForm.currency} onChange={(e) => setCountryForm({ ...countryForm, currency: e.target.value.toUpperCase() })}
                placeholder="SAR" dir="ltr" className="text-center font-mono" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowCountryDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={saveCountry} className="flex-1 gradient-primary text-primary-foreground font-bold">{editingItem ? 'تحديث' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Exam Dialog ── */}
      <Dialog open={showExamDialog} onOpenChange={setShowExamDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editingItem ? 'تعديل الاختبار' : 'إضافة اختبار جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الاختبار *</Label>
              <Input value={examForm.name_ar} onChange={(e) => setExamForm({ ...examForm, name_ar: e.target.value })} placeholder="الرخصة الطبية السعودية" />
            </div>
            <div className="space-y-2">
              <Label>الرمز (Slug)</Label>
              <Input value={examForm.slug} onChange={(e) => setExamForm({ ...examForm, slug: e.target.value.toLowerCase() })} placeholder="smle" dir="ltr" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea value={examForm.description_ar} onChange={(e) => setExamForm({ ...examForm, description_ar: e.target.value })} placeholder="وصف الاختبار..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عدد الأسئلة</Label>
                <Input type="number" value={examForm.default_question_count} onChange={(e) => setExamForm({ ...examForm, default_question_count: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>المدة (ثانية)</Label>
                <Input type="number" value={examForm.default_time_limit_sec} onChange={(e) => setExamForm({ ...examForm, default_time_limit_sec: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowExamDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={saveExam} className="flex-1 gradient-primary text-primary-foreground font-bold">{editingItem ? 'تحديث' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Question Dialog ── */}
      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editingItem ? 'تعديل السؤال' : 'إضافة سؤال جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نص السؤال *</Label>
              <Textarea value={questionForm.text_ar} onChange={(e) => setQuestionForm({ ...questionForm, text_ar: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الموضوع *</Label>
                <Input value={questionForm.topic} onChange={(e) => setQuestionForm({ ...questionForm, topic: e.target.value })} placeholder="أمراض القلب" />
              </div>
              <div className="space-y-2">
                <Label>الصعوبة</Label>
                <Select value={questionForm.difficulty} onValueChange={(v) => setQuestionForm({ ...questionForm, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">سهل</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="hard">صعب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <Label>الخيارات *</Label>
              {questionForm.options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={questionForm.correct_option_id === opt.id}
                    onChange={() => setQuestionForm({ ...questionForm, correct_option_id: opt.id })}
                    className="accent-primary" />
                  <span className="text-xs font-mono text-muted-foreground w-5">{String.fromCharCode(65 + i)}</span>
                  <Input value={opt.textAr} onChange={(e) => {
                    const newOpts = [...questionForm.options];
                    newOpts[i] = { ...newOpts[i], textAr: e.target.value };
                    setQuestionForm({ ...questionForm, options: newOpts });
                  }} className="flex-1" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>الشرح (اختياري)</Label>
              <Textarea value={questionForm.explanation} onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowQuestionDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={saveQuestion} className="flex-1 gradient-primary text-primary-foreground font-bold">{editingItem ? 'تحديث' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {deleteTarget?.type === 'countries' ? 'حذف الدولة' : deleteTarget?.type === 'exams' ? 'حذف الاختبار' : 'حذف السؤال'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
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
