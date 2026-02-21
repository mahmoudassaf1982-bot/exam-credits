import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowRight, Save, Plus, Coins, Clock, HelpCircle, Layers, BookOpen, Loader2, Trash2, GripVertical, Sparkles } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface ExamTemplate {
  id: string; country_id: string; slug: string; name_ar: string; description_ar: string;
  is_active: boolean; default_time_limit_sec: number; default_question_count: number;
  simulation_cost_points: number; practice_cost_points: number; analysis_cost_points: number;
}

interface ExamSection {
  id: string; exam_template_id: string; order: number; name_ar: string;
  time_limit_sec: number | null; question_count: number;
}

export default function AdminExamDetail() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<ExamTemplate | null>(null);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteSecId, setDeleteSecId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleAiSync = async () => {
    if (!template) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-sync-exam', {
        body: { exam_template_id: template.id, exam_name: template.name_ar, country_id: template.country_id },
      });
      if (error) throw error;
      const count = data?.sections_added ?? data?.sections_count ?? 0;
      toast.success(`✅ تم تحديث معايير الاختبار بنجاح! تم اكتشاف ${count} أقسام.`);
      fetchData();
    } catch (err) {
      console.error('AI Sync error:', err);
      toast.error('فشل في تحديث المعايير');
    } finally {
      setSyncing(false);
    }
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      supabase.from('exam_templates').select('*').eq('id', id).single(),
      supabase.from('exam_sections').select('*').eq('exam_template_id', id).order('order'),
    ]);
    if (tRes.data) setTemplate(tRes.data as unknown as ExamTemplate);
    setSections((sRes.data || []) as unknown as ExamSection[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const updateField = (field: string, value: any) => {
    setTemplate(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    const { error } = await supabase.from('exam_templates').update({
      name_ar: template.name_ar, slug: template.slug, description_ar: template.description_ar,
      is_active: template.is_active, default_question_count: template.default_question_count,
      default_time_limit_sec: template.default_time_limit_sec,
      simulation_cost_points: template.simulation_cost_points,
      practice_cost_points: template.practice_cost_points,
      analysis_cost_points: template.analysis_cost_points,
    }).eq('id', template.id);
    if (error) toast.error('خطأ في الحفظ');
    else toast.success('تم حفظ التغييرات');
    setSaving(false);
  };

  const addSection = async () => {
    if (!template) return;
    const { error } = await supabase.from('exam_sections').insert({
      exam_template_id: template.id, order: sections.length + 1, name_ar: 'قسم جديد', question_count: 20,
    });
    if (error) toast.error('خطأ في إضافة القسم');
    else { toast.success('تم إضافة القسم'); fetchData(); }
  };

  const updateSection = async (sec: ExamSection) => {
    const { error } = await supabase.from('exam_sections').update({
      name_ar: sec.name_ar, question_count: sec.question_count, time_limit_sec: sec.time_limit_sec, order: sec.order,
    }).eq('id', sec.id);
    if (error) toast.error('خطأ في تحديث القسم');
  };

  const deleteSection = async () => {
    if (!deleteSecId) return;
    const { error } = await supabase.from('exam_sections').delete().eq('id', deleteSecId);
    if (error) toast.error('خطأ في حذف القسم');
    else { toast.success('تم حذف القسم'); fetchData(); }
    setDeleteSecId(null);
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h} ساعة ${m} دقيقة`;
    if (h > 0) return `${h} ساعة`;
    return `${m} دقيقة`;
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!template) return (
    <div className="rounded-2xl border bg-card p-12 text-center">
      <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-lg font-bold">لم يتم العثور على الاختبار</p>
      <Link to="/app/admin/exams" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowRight className="h-4 w-4" />العودة للقائمة
      </Link>
    </div>
  );

  const totalQuestions = sections.reduce((s, sec) => s + sec.question_count, 0);
  const totalTime = sections.reduce((s, sec) => s + (sec.time_limit_sec || 0), 0);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/admin/exams" className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 transition-colors">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">{template.name_ar}</h1>
            {template.slug && <p className="text-sm text-muted-foreground font-mono" dir="ltr">{template.slug.toUpperCase()}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleAiSync} disabled={syncing} variant="outline" className="gap-2 text-sm">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {syncing ? 'جاري البحث عن أحدث المعايير...' : '🔄 تحديث المعايير'}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground font-bold gap-2">
            <Save className="h-4 w-4" /><span className="hidden sm:inline">حفظ</span>
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />معلومات الاختبار</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>اسم الاختبار</Label><Input value={template.name_ar} onChange={(e) => updateField('name_ar', e.target.value)} /></div>
              <div className="space-y-2"><Label>المعرّف (Slug)</Label><Input value={template.slug} onChange={(e) => updateField('slug', e.target.value)} dir="ltr" className="text-left font-mono" /></div>
            </div>
            <div className="space-y-2"><Label>الوصف</Label><Textarea value={template.description_ar} onChange={(e) => updateField('description_ar', e.target.value)} className="min-h-[80px]" /></div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
              <Label className="cursor-pointer">الاختبار مفعّل</Label>
              <Switch checked={template.is_active} onCheckedChange={(v) => updateField('is_active', v)} />
            </div>
          </motion.div>

          {/* Default settings */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />الإعدادات الافتراضية</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>عدد الأسئلة</Label>
                <Input type="number" value={template.default_question_count} onChange={(e) => updateField('default_question_count', Number(e.target.value))} min={1} dir="ltr" className="text-center" />
              </div>
              <div className="space-y-2">
                <Label>الزمن (بالثواني)</Label>
                <Input type="number" value={template.default_time_limit_sec} onChange={(e) => updateField('default_time_limit_sec', Number(e.target.value))} min={60} dir="ltr" className="text-center" />
                <p className="text-xs text-muted-foreground">= {formatTime(template.default_time_limit_sec)}</p>
              </div>
            </div>
          </motion.div>

          {/* Sections */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />الأقسام ({sections.length})</h2>
              <Button variant="outline" size="sm" onClick={addSection} className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />إضافة قسم</Button>
            </div>
            {sections.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center">
                <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">لا توجد أقسام</p>
                <p className="text-sm text-muted-foreground mt-1">أضف أقسام لتحديد هيكل الاختبار</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div key={sec.id} className="rounded-2xl border bg-card p-4 shadow-card space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                        <Input value={sec.name_ar} onChange={(e) => {
                          const updated = { ...sec, name_ar: e.target.value };
                          setSections(prev => prev.map(s => s.id === sec.id ? updated : s));
                          updateSection(updated);
                        }} className="font-bold h-9 w-48" />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteSecId(sec.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">عدد الأسئلة</Label>
                        <Input type="number" value={sec.question_count} onChange={(e) => {
                          const updated = { ...sec, question_count: Number(e.target.value) };
                          setSections(prev => prev.map(s => s.id === sec.id ? updated : s));
                          updateSection(updated);
                        }} className="h-8 text-center" dir="ltr" min={1} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">المدة (ثانية)</Label>
                        <Input type="number" value={sec.time_limit_sec || ''} onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          const updated = { ...sec, time_limit_sec: val };
                          setSections(prev => prev.map(s => s.id === sec.id ? updated : s));
                          updateSection(updated);
                        }} className="h-8 text-center" dir="ltr" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-bold flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />تكاليف النقاط</h2>
            <div className="space-y-3">
              <div className="space-y-2"><Label className="text-xs">جلسة المحاكاة</Label><Input type="number" value={template.simulation_cost_points} onChange={(e) => updateField('simulation_cost_points', Number(e.target.value))} min={0} dir="ltr" className="text-center" /></div>
              <div className="space-y-2"><Label className="text-xs">جلسة التدريب</Label><Input type="number" value={template.practice_cost_points} onChange={(e) => updateField('practice_cost_points', Number(e.target.value))} min={0} dir="ltr" className="text-center" /></div>
              <div className="space-y-2"><Label className="text-xs">التحليل</Label><Input type="number" value={template.analysis_cost_points} onChange={(e) => updateField('analysis_cost_points', Number(e.target.value))} min={0} dir="ltr" className="text-center" /></div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
            <h2 className="font-bold text-sm">ملخص الأقسام</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />عدد الأقسام</span><span className="font-bold">{sections.length}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" />إجمالي الأسئلة</span><span className="font-bold">{totalQuestions}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />إجمالي الزمن</span><span className="font-bold">{totalTime > 0 ? formatTime(totalTime) : '—'}</span></div>
            </div>
          </motion.div>
        </div>
      </div>

      <AlertDialog open={!!deleteSecId} onOpenChange={() => setDeleteSecId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف القسم</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا القسم؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSection} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}