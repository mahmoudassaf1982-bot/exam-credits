import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowRight, Save, Plus, Coins, Clock, HelpCircle, Layers, BookOpen, Loader2, Trash2, Sparkles, ExternalLink, History, Shield } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import AiSyncReviewDialog, { type ProposedSection } from '@/components/admin/AiSyncReviewDialog';

interface ExamTemplate {
  id: string; country_id: string; slug: string; name_ar: string; description_ar: string;
  is_active: boolean; default_time_limit_sec: number; default_question_count: number;
  simulation_cost_points: number; practice_cost_points: number; analysis_cost_points: number;
}

interface ExamSection {
  id: string; exam_template_id: string; order: number; name_ar: string;
  time_limit_sec: number | null; question_count: number;
}

interface TrustedSource {
  id: string; source_name: string; source_url: string | null; description: string | null; last_synced_at: string | null;
}

interface ExamStandard {
  id: string; section_name: string; question_count: number; time_limit_minutes: number | null;
  difficulty_distribution: any; topics: any;
}

interface AuditEntry {
  id: string; action: string; details: any; created_at: string; performed_by: string | null;
}

export default function AdminExamDetail() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<ExamTemplate | null>(null);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [sources, setSources] = useState<TrustedSource[]>([]);
  const [standards, setStandards] = useState<ExamStandard[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteSecId, setDeleteSecId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiProposals, setAiProposals] = useState<ProposedSection[]>([]);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  const handleAiSync = async () => {
    if (!template) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-sync-exam', {
        body: { examTemplateId: template.id },
      });
      console.log('[handleAiSync] Raw response:', JSON.stringify(data));
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.proposals || data.proposals.length === 0) {
        toast.error('لم يتم العثور على أقسام مقترحة');
        return;
      }
      console.log('[handleAiSync] Proposals count:', data.proposals.length, data.proposals);
      setAiProposals(data.proposals);
      setShowReviewDialog(true);
      toast.success(`تم اكتشاف ${data.proposals.length} أقسام مقترحة — راجعها قبل الحفظ`);
    } catch (err: any) {
      console.error('AI Sync error:', err);
      toast.error(err.message || 'فشل في البحث عن المعايير');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveProposals = async (reviewedSections: ProposedSection[]) => {
    if (!template) return;
    try {
      const { data, error } = await supabase.functions.invoke('ai-sync-exam', {
        body: { examTemplateId: template.id, action: 'save', sections: reviewedSections },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('✅ تم حفظ الأقسام بنجاح!');
      fetchData();
    } catch (err: any) {
      console.error('Save proposals error:', err);
      toast.error(err.message || 'فشل في حفظ الأقسام');
      throw err;
    }
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const [tRes, sRes, srcRes, stdRes, logRes] = await Promise.all([
      supabase.from('exam_templates').select('*').eq('id', id).single(),
      supabase.from('exam_sections').select('*').eq('exam_template_id', id).order('order'),
      supabase.from('trusted_sources').select('*').eq('exam_template_id', id).order('created_at'),
      supabase.from('exam_standards').select('*').eq('exam_template_id', id).order('created_at'),
      supabase.from('sync_audit_log').select('*').eq('exam_template_id', id).order('created_at', { ascending: false }).limit(10),
    ]);
    if (tRes.data) setTemplate(tRes.data as unknown as ExamTemplate);
    setSections((sRes.data || []) as unknown as ExamSection[]);
    setSources((srcRes.data || []) as unknown as TrustedSource[]);
    setStandards((stdRes.data || []) as unknown as ExamStandard[]);
    setAuditLog((logRes.data || []) as unknown as AuditEntry[]);
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    <div className="space-y-6 sm:space-y-8 max-w-full overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/app/admin/exams" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 transition-colors">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-foreground truncate">{template.name_ar}</h1>
            {template.slug && <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate" dir="ltr">{template.slug.toUpperCase()}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-hidden">
          <Button onClick={handleAiSync} disabled={syncing} variant="outline" className="gap-2 text-xs flex-1 sm:flex-none min-w-0">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
            <span className="truncate">{syncing ? 'جاري البحث...' : 'تحديث المعايير'}</span>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground font-bold gap-2 shrink-0">
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
                        }} className="font-bold h-9 flex-1 min-w-0" />
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

          {/* Exam Standards Table */}
          {standards.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
              <h2 className="font-bold text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />معايير الاختبار الرسمية</h2>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm" style={{ minWidth: '320px' }}>
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-2 font-medium text-xs">القسم</th>
                      <th className="text-center py-2 px-2 font-medium text-xs">الأسئلة</th>
                      <th className="text-center py-2 px-2 font-medium text-xs">المدة</th>
                      <th className="text-center py-2 px-2 font-medium text-xs">الصعوبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standards.map((std) => {
                      const diff = std.difficulty_distribution || {};
                      return (
                        <tr key={std.id} className="border-b last:border-0">
                          <td className="py-2.5 px-2 font-medium text-xs">{std.section_name}</td>
                          <td className="py-2.5 px-2 text-center text-xs">{std.question_count}</td>
                          <td className="py-2.5 px-2 text-center text-xs">{std.time_limit_minutes ?? '—'}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-wrap items-center justify-center gap-1 text-[10px]">
                              {diff.easy && <Badge variant="secondary" className="text-[9px] px-1 py-0">سهل {diff.easy}%</Badge>}
                              {diff.medium && <Badge variant="secondary" className="text-[9px] px-1 py-0">متوسط {diff.medium}%</Badge>}
                              {diff.hard && <Badge variant="secondary" className="text-[9px] px-1 py-0">صعب {diff.hard}%</Badge>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
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

          {/* Trusted Sources */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
            <h2 className="font-bold text-sm flex items-center gap-2"><ExternalLink className="h-4 w-4 text-primary" />المصادر الموثوقة</h2>
            {sources.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد مصادر بعد. اضغط "تحديث المعايير" لاكتشافها تلقائياً.</p>
            ) : (
              <div className="space-y-2">
                {sources.map((src) => (
                  <div key={src.id} className="rounded-xl bg-muted/50 p-3 space-y-1">
                    <p className="text-sm font-medium">{src.source_name}</p>
                    {src.description && <p className="text-xs text-muted-foreground">{src.description}</p>}
                    {src.source_url && (
                      <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />زيارة المصدر
                      </a>
                    )}
                    {src.last_synced_at && (
                      <p className="text-[10px] text-muted-foreground">آخر تحديث: {formatDate(src.last_synced_at)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Audit Log */}
          {auditLog.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
              <h2 className="font-bold text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" />سجل التحديثات</h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-muted/50 p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.action === 'ai_sync' ? 'مزامنة ذكاء اصطناعي' : entry.action}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDate(entry.created_at)}</span>
                    </div>
                    {entry.details && (
                      <div className="text-[11px] text-muted-foreground">
                        {entry.details.sections_count && <span>أقسام: {entry.details.sections_count}</span>}
                        {entry.details.new_sections_added > 0 && <span className="mr-2">• جديدة: {entry.details.new_sections_added}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
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

      <AiSyncReviewDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        proposals={aiProposals}
        examName={template.name_ar}
        onSave={handleSaveProposals}
      />
    </div>
  );
}
