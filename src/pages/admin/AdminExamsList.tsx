import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookOpen, Plus, ChevronLeft, Layers, Clock, HelpCircle, Loader2, Pencil, Trash2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Country { id: string; name_ar: string; flag: string; }
interface ExamTemplate {
  id: string; country_id: string; slug: string; name_ar: string; description_ar: string;
  is_active: boolean; default_question_count: number; default_time_limit_sec: number;
  simulation_cost_points: number; practice_cost_points: number; analysis_cost_points: number;
  sections_count?: number;
}

export default function AdminExamsList() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCountry, setFilterCountry] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ExamTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name_ar: '', slug: '', country_id: '', description_ar: '', default_question_count: 100, default_time_limit_sec: 7200 });

  const fetchData = async () => {
    setLoading(true);
    const [countriesRes, templatesRes] = await Promise.all([
      supabase.from('countries').select('id, name_ar, flag').order('created_at'),
      supabase.from('exam_templates').select('*').order('created_at'),
    ]);
    setCountries(countriesRes.data || []);

    // Get section counts
    const tpls = templatesRes.data || [];
    if (tpls.length > 0) {
      const { data: sections } = await supabase.from('exam_sections').select('exam_template_id');
      const counts: Record<string, number> = {};
      (sections || []).forEach((s: any) => { counts[s.exam_template_id] = (counts[s.exam_template_id] || 0) + 1; });
      tpls.forEach((t: any) => { t.sections_count = counts[t.id] || 0; });
    }
    setTemplates(tpls as ExamTemplate[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name_ar: '', slug: '', country_id: countries[0]?.id || '', description_ar: '', default_question_count: 100, default_time_limit_sec: 7200 });
    setShowDialog(true);
  };

  const openEdit = (e: ExamTemplate) => {
    setEditing(e);
    setForm({ name_ar: e.name_ar, slug: e.slug, country_id: e.country_id, description_ar: e.description_ar, default_question_count: e.default_question_count, default_time_limit_sec: e.default_time_limit_sec });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.country_id) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (editing) {
      const { error } = await supabase.from('exam_templates').update({
        name_ar: form.name_ar, slug: form.slug, description_ar: form.description_ar,
        default_question_count: form.default_question_count, default_time_limit_sec: form.default_time_limit_sec,
      }).eq('id', editing.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث الاختبار'); setShowDialog(false); fetchData(); }
    } else {
      const { error } = await supabase.from('exam_templates').insert({
        country_id: form.country_id, name_ar: form.name_ar, slug: form.slug,
        description_ar: form.description_ar, default_question_count: form.default_question_count,
        default_time_limit_sec: form.default_time_limit_sec,
      });
      if (error) toast.error('خطأ في الإضافة');
      else { toast.success('تم إضافة الاختبار'); setShowDialog(false); fetchData(); }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('exam_template_id', deleteId);
    if (count && count > 0) {
      toast.error(`لا يمكن حذف هذا الاختبار لأنه يحتوي على ${count} سؤال. احذف الأسئلة أولاً.`);
      setDeleteId(null); return;
    }
    const { error } = await supabase.from('exam_templates').delete().eq('id', deleteId);
    if (error) toast.error('خطأ في الحذف');
    else { toast.success('تم حذف الاختبار'); fetchData(); }
    setDeleteId(null);
  };

  const handleAiSync = async (exam: ExamTemplate) => {
    setSyncingId(exam.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-sync-exam', {
        body: { examTemplateId: exam.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const method = data.tavilyUsed ? '🌐 بحث ويب' : '🤖 معرفة داخلية';
      toast.success(`تم اكتشاف ${data.proposals?.length || 0} أقسام (${method}) — افتح التفاصيل للمراجعة`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'فشل تحديث المعايير');
    } finally {
      setSyncingId(null);
    }
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h} ساعة ${m} دقيقة`;
    if (h > 0) return `${h} ساعة`;
    return `${m} دقيقة`;
  };

  const filtered = filterCountry === 'all' ? templates : templates.filter(t => t.country_id === filterCountry);
  const grouped = countries.map(c => ({ country: c, exams: filtered.filter(t => t.country_id === c.id) })).filter(g => g.exams.length > 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">هيكل الاختبارات</h1>
          <p className="mt-1 text-muted-foreground">إدارة الاختبارات والأقسام حسب الدولة</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="كل الدول" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الدول</SelectItem>
              {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">اختبار جديد</span>
          </Button>
        </div>
      </motion.div>

      {grouped.map(({ country, exams }) => (
        <motion.div key={country.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{country.flag}</span>
            <h2 className="text-lg font-bold">{country.name_ar}</h2>
            <span className="text-sm text-muted-foreground">({exams.length} اختبار)</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {exams.map(exam => (
              <div key={exam.id} className="group rounded-2xl border bg-card shadow-card hover:shadow-card-hover transition-all overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <Link to={`/app/admin/exams/${exam.id}`} className="flex items-center gap-3 flex-1">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{exam.name_ar}</h3>
                        {exam.slug && <p className="text-xs text-muted-foreground font-mono" dir="ltr">{exam.slug.toUpperCase()}</p>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleAiSync(exam)} disabled={syncingId === exam.id} title="تحديث المعايير بالذكاء الاصطناعي">
                        {syncingId === exam.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(exam)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(exam.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {exam.description_ar && <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{exam.description_ar}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1"><Layers className="h-3 w-3" />{exam.sections_count || 0} قسم</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1"><HelpCircle className="h-3 w-3" />{exam.default_question_count} سؤال</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1"><Clock className="h-3 w-3" />{formatTime(exam.default_time_limit_sec)}</span>
                  </div>
                  <div className="mt-3">
                    <Badge variant={exam.is_active ? 'default' : 'secondary'}>{exam.is_active ? 'مفعّل' : 'معطّل'}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-lg font-bold">لا توجد اختبارات</p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editing ? 'تعديل الاختبار' : 'إنشاء اختبار جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select value={form.country_id} onValueChange={(v) => setForm({ ...form, country_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>اسم الاختبار *</Label><Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="امتحان القدرات" /></div>
            <div className="space-y-2"><Label>المعرّف (Slug)</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="qudurat" dir="ltr" className="text-left font-mono" /></div>
            <div className="space-y-2"><Label>الوصف</Label><Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} placeholder="وصف الاختبار" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>عدد الأسئلة</Label><Input type="number" value={form.default_question_count} onChange={(e) => setForm({ ...form, default_question_count: parseInt(e.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label>المدة (ثانية)</Label><Input type="number" value={form.default_time_limit_sec} onChange={(e) => setForm({ ...form, default_time_limit_sec: parseInt(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">{editing ? 'تحديث' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الاختبار</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا الاختبار؟</AlertDialogDescription>
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