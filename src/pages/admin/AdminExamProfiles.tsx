import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Shield, ShieldCheck, ShieldAlert, FileSearch, Brain, CheckCircle2,
  Loader2, Edit, Eye, AlertTriangle, RefreshCw, RotateCcw, XCircle
} from 'lucide-react';

interface ExamProfile {
  id: string;
  exam_template_id: string;
  profile_json: any;
  status: 'draft' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExamTemplate {
  id: string;
  name_ar: string;
  country_id: string;
  default_question_count: number;
  default_time_limit_sec: number;
}

interface ProfileJob {
  id: string;
  operation: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  params_json: any;
  created_at: string;
  updated_at: string;
}

const REQUIRED_FIELDS_CHECKS = [
  { path: 'official_spec.total_questions', label: 'عدد الأسئلة الإجمالي', check: (v: any) => v > 0 },
  { path: 'official_spec.duration_minutes', label: 'مدة الاختبار بالدقائق', check: (v: any) => v > 0 },
  { path: 'official_spec.sections', label: 'أقسام الاختبار', check: (v: any) => Array.isArray(v) && v.length > 0 },
  { path: 'official_spec.languages', label: 'اللغات المدعومة', check: (v: any) => Array.isArray(v) && v.length > 0 },
  { path: 'psychometric_dna.thinking_style', label: 'أسلوب التفكير', check: (v: any) => ['direct', 'reasoning', 'mixed'].includes(v) },
  { path: 'psychometric_dna.time_pressure_level', label: 'مستوى ضغط الوقت', check: (v: any) => ['low', 'medium', 'high'].includes(v) },
  { path: 'psychometric_dna.trap_density', label: 'كثافة المصائد', check: (v: any) => ['low', 'medium', 'high'].includes(v) },
  { path: 'psychometric_dna.reasoning_depth_level', label: 'عمق التفكير', check: (v: any) => v >= 1 && v <= 5 },
  { path: 'psychometric_dna.difficulty_mix_default', label: 'توزيع الصعوبة (مجموع 100)', check: (v: any) => v && (v.easy + v.medium + v.hard) === 100 },
  { path: 'generation_rules.options_count', label: 'عدد الخيارات = 4', check: (v: any) => v === 4 },
  { path: 'generation_rules.single_correct_answer', label: 'إجابة صحيحة واحدة', check: (v: any) => v === true },
];

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function validateProfile(profile: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const check of REQUIRED_FIELDS_CHECKS) {
    const val = getNestedValue(profile, check.path);
    if (val === undefined || val === null || !check.check(val)) {
      errors.push(check.label);
    }
  }
  const sections = profile?.official_spec?.sections;
  const totalQ = profile?.official_spec?.total_questions;
  if (Array.isArray(sections) && totalQ > 0) {
    const sum = sections.reduce((s: number, sec: any) => s + (sec.question_count || 0), 0);
    if (sum !== totalQ) {
      errors.push(`مجموع أسئلة الأقسام (${sum}) لا يطابق الإجمالي (${totalQ})`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function getJobStatusBadge(job: ProfileJob) {
  const statusMap: Record<string, { label: string; className: string }> = {
    queued: { label: 'في الانتظار', className: 'bg-muted text-muted-foreground' },
    running: { label: 'قيد التنفيذ', className: 'bg-blue-500/10 text-blue-600' },
    succeeded: { label: 'نجح', className: 'bg-green-500/10 text-green-600' },
    failed: { label: 'فشل', className: 'bg-destructive/10 text-destructive' },
    needs_review: { label: 'يحتاج مراجعة', className: 'bg-yellow-500/10 text-yellow-700' },
  };
  const s = statusMap[job.status] || { label: job.status, className: 'bg-muted text-muted-foreground' };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

export default function AdminExamProfiles() {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ExamProfile>>(new Map());
  const [profileJobs, setProfileJobs] = useState<Map<string, ProfileJob[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<ExamTemplate | null>(null);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [jsonText, setJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingSpec, setFetchingSpec] = useState<string | null>(null);
  const [inferringDNA, setInferringDNA] = useState<string | null>(null);
  const [sampleQuestionsText, setSampleQuestionsText] = useState('');
  const [showDnaDialog, setShowDnaDialog] = useState(false);
  const [dnaTargetTemplate, setDnaTargetTemplate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: tData }, { data: pData }, { data: jData }] = await Promise.all([
      supabase.from('exam_templates').select('id, name_ar, country_id, default_question_count, default_time_limit_sec').eq('is_active', true).order('created_at'),
      supabase.from('exam_profiles' as any).select('*'),
      supabase.from('ai_jobs').select('id, operation, status, attempt_count, last_error, params_json, created_at, updated_at')
        .eq('type', 'profile_builder')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setTemplates((tData as any[]) || []);
    const pMap = new Map<string, ExamProfile>();
    ((pData as any[]) || []).forEach((p: ExamProfile) => pMap.set(p.exam_template_id, p));
    setProfiles(pMap);

    // Group jobs by exam_template_id
    const jMap = new Map<string, ProfileJob[]>();
    ((jData as any[]) || []).forEach((j: any) => {
      const tmplId = j.params_json?.exam_template_id;
      if (tmplId) {
        const arr = jMap.get(tmplId) || [];
        arr.push(j as ProfileJob);
        jMap.set(tmplId, arr);
      }
    });
    setProfileJobs(jMap);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openEditor = (tmpl: ExamTemplate) => {
    setSelectedTemplate(tmpl);
    const existing = profiles.get(tmpl.id);
    const profile = existing?.profile_json || getDefaultProfile(tmpl);
    setEditingProfile(profile);
    setJsonText(JSON.stringify(profile, null, 2));
  };

  const getDefaultProfile = (tmpl: ExamTemplate) => ({
    exam_identity: { exam_template_id: tmpl.id, exam_name: tmpl.name_ar, country_id: tmpl.country_id, schema_version: 'dna_v1' },
    official_spec: { total_questions: tmpl.default_question_count, duration_minutes: Math.round(tmpl.default_time_limit_sec / 60), languages: ['ar'], sections: [] },
    psychometric_dna: {
      thinking_style: 'mixed', time_pressure_level: 'medium', reasoning_depth_level: 3, avg_steps_per_question: 2,
      trap_density: 'medium', distractor_style: { type: 'plausible', notes: '' }, wording_complexity: 'medium', calculation_load: 'low',
      difficulty_mix_default: { easy: 30, medium: 50, hard: 20 },
      expected_time_per_question_seconds: { easy: 45, medium: 90, hard: 120 },
      cognitive_mix: [{ type: 'recall', pct: 20 }, { type: 'application', pct: 50 }, { type: 'analysis', pct: 30 }],
      quality_gate_thresholds: { min_confidence: 0.85, min_clarity: 0.8, min_language_quality: 0.8 },
    },
    generation_rules: { options_count: 4, single_correct_answer: true, stem_max_lines: 2, stem_max_chars: 200, no_answer_in_stem: true, language_match_required: true },
    adaptive_rules: { strategy_required: false, mode: 'difficulty_only' },
  });

  const saveDraft = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(jsonText);
      setEditingProfile(parsed);
      const existing = profiles.get(selectedTemplate.id);
      if (existing) {
        await (supabase.from('exam_profiles' as any) as any).update({ profile_json: parsed, status: 'draft' }).eq('id', existing.id);
      } else {
        await (supabase.from('exam_profiles' as any) as any).insert({ exam_template_id: selectedTemplate.id, profile_json: parsed, status: 'draft' });
      }
      toast.success('تم حفظ المسودة');
      await loadData();
    } catch (e: any) {
      toast.error('خطأ في JSON: ' + e.message);
    }
    setSaving(false);
  };

  const approveProfile = async () => {
    if (!selectedTemplate) return;
    try {
      const parsed = JSON.parse(jsonText);
      const { valid, errors } = validateProfile(parsed);
      if (!valid) {
        toast.error('لا يمكن الاعتماد — حقول مفقودة: ' + errors.join('، '));
        return;
      }
      setSaving(true);
      const existing = profiles.get(selectedTemplate.id);
      const { data: { user } } = await supabase.auth.getUser();
      if (existing) {
        await (supabase.from('exam_profiles' as any) as any).update({ profile_json: parsed, status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await (supabase.from('exam_profiles' as any) as any).insert({ exam_template_id: selectedTemplate.id, profile_json: parsed, status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() });
      }
      toast.success('✅ تم اعتماد الملف الشخصي');
      await loadData();
    } catch (e: any) {
      toast.error('خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const fetchSpec = async (tmplId: string) => {
    setFetchingSpec(tmplId);
    try {
      const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
        body: { action: 'fetch_spec', exam_template_id: tmplId }
      });
      if (error) throw error;
      toast.success('تم جلب المواصفات بنجاح');
      await loadData();
      if (selectedTemplate?.id === tmplId && data?.profile) {
        setEditingProfile(data.profile);
        setJsonText(JSON.stringify(data.profile, null, 2));
      }
    } catch (e: any) {
      toast.error('فشل جلب المواصفات: ' + e.message);
    }
    setFetchingSpec(null);
  };

  const openDnaDialog = (tmplId: string) => {
    setDnaTargetTemplate(tmplId);
    setSampleQuestionsText('');
    setShowDnaDialog(true);
  };

  const inferDNA = async (retryJobId?: string) => {
    const targetId = dnaTargetTemplate;
    if (!targetId) return;
    setInferringDNA(targetId);
    try {
      const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
        body: {
          action: 'infer_dna',
          exam_template_id: targetId,
          sample_questions_text: sampleQuestionsText || undefined,
          ...(retryJobId ? { job_id: retryJobId } : {}),
        }
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('تم استنتاج DNA بنجاح');
      } else {
        toast.error(data?.message || 'فشل استنتاج DNA');
      }
      setShowDnaDialog(false);
      await loadData();
      if (selectedTemplate?.id === targetId && data?.profile) {
        setEditingProfile(data.profile);
        setJsonText(JSON.stringify(data.profile, null, 2));
      }
    } catch (e: any) {
      toast.error('فشل استنتاج DNA: ' + e.message);
    }
    setInferringDNA(null);
  };

  const retryJob = async (job: ProfileJob) => {
    const tmplId = job.params_json?.exam_template_id;
    if (!tmplId || !job.operation) return;

    setDnaTargetTemplate(tmplId);

    try {
      if (job.operation === 'infer_dna') {
        setSampleQuestionsText(job.params_json?.sample_questions_text || '');
        setInferringDNA(tmplId);

        const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
          body: {
            action: 'infer_dna',
            exam_template_id: tmplId,
            sample_questions_text: job.params_json?.sample_questions_text || undefined,
            job_id: job.id,
          }
        });

        if (error) {
          toast.error(error.message || 'فشلت إعادة المحاولة');
          return;
        }

        if (!data?.ok) {
          toast.error(data?.message || 'فشلت إعادة المحاولة');
          return;
        }

        toast.success('نجحت إعادة المحاولة');
        return;
      }

      if (job.operation === 'fetch_spec') {
        const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
          body: {
            action: 'fetch_spec',
            exam_template_id: tmplId,
            job_id: job.id,
          }
        });

        if (error) {
          toast.error(error.message || 'فشلت إعادة جلب المواصفات');
          return;
        }

        if (!data?.ok) {
          toast.error(data?.message || 'فشلت إعادة جلب المواصفات');
          return;
        }

        toast.success('نجحت إعادة جلب المواصفات');
      }
    } catch (e: any) {
      console.error('retryJob unexpected error:', e);
      toast.error(e?.message || 'حدث خطأ غير متوقع أثناء إعادة المحاولة');
    } finally {
      setInferringDNA(null);
      await loadData();
    }
  };

  const getStatusBadge = (tmplId: string) => {
    const p = profiles.get(tmplId);
    if (!p) return <Badge variant="outline" className="bg-destructive/10 text-destructive"><ShieldAlert className="h-3 w-3 ml-1" />غير موجود</Badge>;
    if (p.status === 'approved') return <Badge variant="outline" className="bg-green-500/10 text-green-600"><ShieldCheck className="h-3 w-3 ml-1" />معتمد</Badge>;
    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600"><Shield className="h-3 w-3 ml-1" />مسودة</Badge>;
  };

  const validationResult = editingProfile ? validateProfile(editingProfile) : null;

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ملفات الاختبارات (Exam Profiles)</h1>
          <p className="text-muted-foreground text-sm mt-1">بناء واعتماد الملف الشخصي لكل اختبار — يُمنع التوليد بدون ملف معتمد</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="h-4 w-4 ml-1" />تحديث</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map(tmpl => {
          const profile = profiles.get(tmpl.id);
          const jobs = profileJobs.get(tmpl.id) || [];
          const latestJob = jobs[0]; // most recent

          return (
            <Card key={tmpl.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{tmpl.name_ar}</CardTitle>
                  {getStatusBadge(tmpl.id)}
                </div>
                <p className="text-xs text-muted-foreground">{tmpl.country_id} · {tmpl.default_question_count} سؤال</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditor(tmpl)}>
                    {profile ? <Eye className="h-3 w-3 ml-1" /> : <Edit className="h-3 w-3 ml-1" />}
                    {profile ? 'فتح' : 'إنشاء'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fetchSpec(tmpl.id)} disabled={fetchingSpec === tmpl.id}>
                    {fetchingSpec === tmpl.id ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <FileSearch className="h-3 w-3 ml-1" />}
                    جلب المواصفات
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openDnaDialog(tmpl.id)} disabled={inferringDNA === tmpl.id}>
                    {inferringDNA === tmpl.id ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Brain className="h-3 w-3 ml-1" />}
                    استنتاج DNA
                  </Button>
                </div>

                {/* Latest job status */}
                {latestJob && (
                  <div className="border rounded-md p-2 space-y-1 text-xs bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">آخر مهمة ({latestJob.operation || 'غير محدد'}):</span>
                      {getJobStatusBadge(latestJob)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>محاولات: {latestJob.attempt_count}/3</span>
                      <span>·</span>
                      <span>{new Date(latestJob.updated_at).toLocaleString('ar')}</span>
                    </div>
                    {latestJob.last_error && (
                      <div className="flex items-start gap-1 text-destructive">
                        <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{latestJob.last_error}</span>
                      </div>
                    )}
                    {(latestJob.status === 'needs_review' || latestJob.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-1"
                        disabled={inferringDNA === tmpl.id}
                        onClick={() => retryJob(latestJob)}
                      >
                        <RotateCcw className="h-3 w-3 ml-1" />
                        إعادة المحاولة
                      </Button>
                    )}
                  </div>
                )}

                {profile?.approved_at && (
                  <p className="text-[10px] text-muted-foreground">اعتُمد: {new Date(profile.approved_at).toLocaleDateString('ar')}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Editor Dialog */}
      {selectedTemplate && (
        <Dialog open={!!selectedTemplate} onOpenChange={(open) => { if (!open) setSelectedTemplate(null); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
            <DialogHeader>
              <DialogTitle>ملف اختبار: {selectedTemplate.name_ar}</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="editor" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="editor">محرر JSON</TabsTrigger>
                <TabsTrigger value="validation">التحقق ({validationResult?.errors.length || 0} خطأ)</TabsTrigger>
              </TabsList>
              <TabsContent value="editor" className="flex-1 overflow-auto">
                <Textarea
                  className="font-mono text-xs min-h-[400px] direction-ltr text-left"
                  dir="ltr"
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    try { setEditingProfile(JSON.parse(e.target.value)); } catch {}
                  }}
                />
              </TabsContent>
              <TabsContent value="validation" className="flex-1 overflow-auto">
                <div className="space-y-2 p-4">
                  {REQUIRED_FIELDS_CHECKS.map((check, i) => {
                    const val = getNestedValue(editingProfile, check.path);
                    const ok = val !== undefined && val !== null && check.check(val);
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                        <span className={ok ? 'text-foreground' : 'text-destructive'}>{check.label}</span>
                        <span className="text-xs text-muted-foreground mr-auto font-mono" dir="ltr">{check.path}</span>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                حفظ كمسودة
              </Button>
              <Button onClick={approveProfile} disabled={saving || !validationResult?.valid} className="bg-green-600 hover:bg-green-700 text-white">
                {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                <ShieldCheck className="h-4 w-4 ml-1" />
                اعتماد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DNA Inference Dialog */}
      <Dialog open={showDnaDialog} onOpenChange={setShowDnaDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>استنتاج DNA من أسئلة نموذجية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الصق 20-40 سؤال نموذجي هنا (اختياري)</Label>
              <Textarea
                className="mt-2 min-h-[200px]"
                placeholder="الصق نص الأسئلة النموذجية الرسمية هنا... أو اتركه فارغاً لاستنتاج DNA من بيانات الاختبار الحالية"
                value={sampleQuestionsText}
                onChange={(e) => setSampleQuestionsText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDnaDialog(false)}>إلغاء</Button>
            <Button onClick={() => inferDNA()} disabled={!!inferringDNA}>
              {inferringDNA ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Brain className="h-4 w-4 ml-1" />}
              استنتاج DNA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
