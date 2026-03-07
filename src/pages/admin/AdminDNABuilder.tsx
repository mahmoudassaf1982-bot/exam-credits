import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Dna, Upload, FileText, Brain, ShieldCheck, Shield,
  Loader2, CheckCircle2, AlertTriangle, Trash2,
  ChevronRight, Plus, Sparkles, FileSearch, History, GitCompare, Eye, X
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

interface ExamTemplate {
  id: string;
  name_ar: string;
  country_id: string;
  default_question_count: number;
  default_time_limit_sec: number;
}

interface ExamProfile {
  id: string;
  exam_template_id: string;
  profile_json: any;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceFile {
  id: string;
  exam_template_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size_bytes: number;
  extracted_text: string | null;
  notes: string | null;
  created_at: string;
}

interface ProfileVersion {
  id: string;
  exam_template_id: string;
  profile_json: any;
  version_number: number;
  status: string;
  source_pdfs: any;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

// ─── Validation ──────────────────────────────────────────────────

const REQUIRED_FIELDS_CHECKS = [
  { path: 'official_spec.total_questions', label: 'عدد الأسئلة الإجمالي', check: (v: any) => v > 0 },
  { path: 'official_spec.duration_minutes', label: 'مدة الاختبار بالدقائق', check: (v: any) => v > 0 },
  { path: 'official_spec.sections', label: 'أقسام الاختبار', check: (v: any) => Array.isArray(v) && v.length > 0 },
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

function setNestedValue(obj: any, path: string, value: any): any {
  const result = JSON.parse(JSON.stringify(obj));
  const keys = path.split('.');
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
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

// ─── Diff Utilities ──────────────────────────────────────────────

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  if (!obj || typeof obj !== 'object') return result;
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(result, flattenObject(obj[key], fullKey));
    } else {
      result[fullKey] = obj[key];
    }
  }
  return result;
}

function computeDiff(oldJson: any, newJson: any): Array<{ key: string; old: any; new: any; type: 'added' | 'removed' | 'changed' }> {
  const oldFlat = flattenObject(oldJson);
  const newFlat = flattenObject(newJson);
  const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);
  const diffs: Array<{ key: string; old: any; new: any; type: 'added' | 'removed' | 'changed' }> = [];

  for (const key of allKeys) {
    const oldVal = oldFlat[key];
    const newVal = newFlat[key];
    if (oldVal === undefined) {
      diffs.push({ key, old: undefined, new: newVal, type: 'added' });
    } else if (newVal === undefined) {
      diffs.push({ key, old: oldVal, new: undefined, type: 'removed' });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ key, old: oldVal, new: newVal, type: 'changed' });
    }
  }
  return diffs;
}

// ─── Sub-Components ──────────────────────────────────────────────

function StepIndicator({ step, currentStep, label }: { step: number; currentStep: number; label: string }) {
  const isActive = step === currentStep;
  const isDone = step < currentStep;
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
        isDone ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        {isDone ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      {step < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

function VersionCompareDialog({
  open,
  onClose,
  versionA,
  versionB,
}: {
  open: boolean;
  onClose: () => void;
  versionA: ProfileVersion | null;
  versionB: ProfileVersion | null;
}) {
  if (!versionA || !versionB) return null;
  const diffs = computeDiff(versionA.profile_json, versionB.profile_json);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            مقارنة الإصدارات: v{versionA.version_number} ← v{versionB.version_number}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          {diffs.length === 0 ? (
            <p className="text-center text-muted-foreground p-8">لا توجد اختلافات بين الإصدارين</p>
          ) : (
            <div className="space-y-1 p-1">
              <div className="grid grid-cols-[1fr,1fr,1fr] gap-2 text-xs font-semibold text-muted-foreground border-b pb-2 mb-2">
                <span>الحقل</span>
                <span>v{versionA.version_number} (القديم)</span>
                <span>v{versionB.version_number} (الجديد)</span>
              </div>
              {diffs.map((d, i) => (
                <div key={i} className={`grid grid-cols-[1fr,1fr,1fr] gap-2 text-xs p-2 rounded ${
                  d.type === 'added' ? 'bg-green-500/10' : d.type === 'removed' ? 'bg-red-500/10' : 'bg-yellow-500/10'
                }`}>
                  <span className="font-mono text-muted-foreground break-all" dir="ltr">{d.key}</span>
                  <span className={`break-all ${d.type === 'removed' ? 'text-destructive line-through' : ''}`} dir="ltr">
                    {d.old !== undefined ? JSON.stringify(d.old) : '—'}
                  </span>
                  <span className={`break-all ${d.type === 'added' ? 'text-green-600 font-semibold' : ''}`} dir="ltr">
                    {d.new !== undefined ? JSON.stringify(d.new) : '—'}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                إجمالي التغييرات: {diffs.length} ({diffs.filter(d => d.type === 'changed').length} تعديل، {diffs.filter(d => d.type === 'added').length} إضافة، {diffs.filter(d => d.type === 'removed').length} حذف)
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function VersionViewDialog({
  open,
  onClose,
  version,
}: {
  open: boolean;
  onClose: () => void;
  version: ProfileVersion | null;
}) {
  if (!version) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            إصدار v{version.version_number}
            <Badge variant="outline" className={version.status === 'approved' ? 'bg-green-500/10 text-green-600' : ''}>
              {version.status === 'approved' ? 'معتمد' : 'مسودة'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-3 p-1">
            <div className="text-xs text-muted-foreground">
              <p>تاريخ الإنشاء: {new Date(version.created_at).toLocaleString('ar')}</p>
              {version.change_summary && <p className="mt-1">الملخص: {version.change_summary}</p>}
            </div>
            <Separator />
            <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap" dir="ltr">
              {JSON.stringify(version.profile_json, null, 2)}
            </pre>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistoryPanel({
  versions,
  loading,
  onRestore,
}: {
  versions: ProfileVersion[];
  loading: boolean;
  onRestore: (v: ProfileVersion) => void;
}) {
  const [viewVersion, setViewVersion] = useState<ProfileVersion | null>(null);
  const [compareA, setCompareA] = useState<ProfileVersion | null>(null);
  const [compareB, setCompareB] = useState<ProfileVersion | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const handleCompare = (v: ProfileVersion) => {
    if (!compareA) {
      setCompareA(v);
      toast.info('اختر الإصدار الثاني للمقارنة');
    } else if (compareA.id === v.id) {
      setCompareA(null);
      toast.info('تم إلغاء التحديد');
    } else {
      // Ensure A is older than B
      const [older, newer] = compareA.version_number < v.version_number
        ? [compareA, v] : [v, compareA];
      setCompareA(older);
      setCompareB(newer);
      setShowCompare(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">لا توجد إصدارات سابقة</p>
        <p className="text-xs mt-1">سيتم حفظ إصدار جديد عند كل حفظ أو اعتماد</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {compareA && !showCompare && (
        <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg text-sm">
          <GitCompare className="h-4 w-4 text-primary" />
          <span>تم تحديد v{compareA.version_number} — اختر إصداراً آخر للمقارنة</span>
          <Button size="sm" variant="ghost" className="mr-auto h-6" onClick={() => setCompareA(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {versions.map((v) => (
        <div key={v.id} className={`border rounded-lg p-3 transition-colors ${
          compareA?.id === v.id ? 'border-primary bg-primary/5' : 'bg-card'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                v.status === 'approved' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
              }`}>
                {v.version_number}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">v{v.version_number}</span>
                  <Badge variant="outline" className={`text-[10px] h-5 ${
                    v.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''
                  }`}>
                    {v.status === 'approved' ? 'معتمد' : 'مسودة'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleString('ar')}
                  {v.change_summary && ` · ${v.change_summary}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewVersion(v)} title="عرض">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleCompare(v)} title="مقارنة">
                <GitCompare className={`h-3.5 w-3.5 ${compareA?.id === v.id ? 'text-primary' : ''}`} />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => onRestore(v)}>
                استعادة
              </Button>
            </div>
          </div>
        </div>
      ))}

      <VersionViewDialog open={!!viewVersion} onClose={() => setViewVersion(null)} version={viewVersion} />
      <VersionCompareDialog
        open={showCompare}
        onClose={() => { setShowCompare(false); setCompareA(null); setCompareB(null); }}
        versionA={compareA}
        versionB={compareB}
      />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function AdminDNABuilder() {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [profile, setProfile] = useState<ExamProfile | null>(null);
  const [dnaData, setDnaData] = useState<any>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  // Action states
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingSpec, setFetchingSpec] = useState(false);

  // Manual text input
  const [manualText, setManualText] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // JSON editor
  const [jsonText, setJsonText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // ─── Load Data ───────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('exam_templates')
      .select('id, name_ar, country_id, default_question_count, default_time_limit_sec')
      .eq('is_active', true)
      .order('created_at');
    setTemplates((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const loadProfileAndSources = useCallback(async (templateId: string) => {
    const [{ data: pData }, { data: sData }] = await Promise.all([
      supabase.from('exam_profiles' as any).select('*').eq('exam_template_id', templateId).single(),
      supabase.from('exam_profile_sources' as any).select('*').eq('exam_template_id', templateId).order('created_at', { ascending: false }),
    ]);
    const p = pData as unknown as ExamProfile | null;
    setProfile(p);
    setDnaData(p?.profile_json || null);
    setSourceFiles((sData as unknown as SourceFile[]) || []);
    if (p?.profile_json) {
      setJsonText(JSON.stringify(p.profile_json, null, 2));
    }
  }, []);

  const loadVersions = useCallback(async (templateId: string) => {
    setVersionsLoading(true);
    const { data } = await (supabase.from('exam_profile_versions' as any) as any)
      .select('*')
      .eq('exam_template_id', templateId)
      .order('version_number', { ascending: false });
    setVersions((data as unknown as ProfileVersion[]) || []);
    setVersionsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      loadProfileAndSources(selectedTemplateId);
      loadVersions(selectedTemplateId);
    } else {
      setProfile(null);
      setDnaData(null);
      setSourceFiles([]);
      setVersions([]);
    }
  }, [selectedTemplateId, loadProfileAndSources, loadVersions]);

  // ─── Save Version Snapshot ──────────────────────────────────
  const saveVersion = async (profileJson: any, status: string, changeSummary: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !selectedTemplateId) return;

    const nextVersion = (versions.length > 0 ? versions[0].version_number : 0) + 1;
    const sourcePdfs = sourceFiles.map(s => ({ file_name: s.file_name, file_path: s.file_path }));

    await (supabase.from('exam_profile_versions' as any) as any).insert({
      exam_template_id: selectedTemplateId,
      profile_json: profileJson,
      version_number: nextVersion,
      status,
      source_pdfs: sourcePdfs,
      change_summary: changeSummary,
      created_by: user.id,
    });

    await loadVersions(selectedTemplateId);
  };

  // ─── Step 1: Select Exam ─────────────────────────────────────
  const handleSelectExam = (id: string) => {
    setSelectedTemplateId(id);
    setStep(2);
  };

  // ─── Step 2: Upload Sources ──────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !selectedTemplateId) return;

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('يجب تسجيل الدخول'); setUploading(false); return; }

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`الملف ${file.name} أكبر من 20MB`);
        continue;
      }

      const filePath = `${selectedTemplateId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('exam-sources')
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`فشل رفع ${file.name}: ${uploadError.message}`);
        continue;
      }

      await (supabase.from('exam_profile_sources' as any) as any).insert({
        exam_template_id: selectedTemplateId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type.includes('pdf') ? 'pdf' : 'document',
        file_size_bytes: file.size,
        uploaded_by: user.id,
      });

      toast.success(`تم رفع ${file.name}`);
    }

    await loadProfileAndSources(selectedTemplateId);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExtractText = async (source: SourceFile) => {
    setExtracting(source.id);
    try {
      const { data, error } = await supabase.functions.invoke('parse-exam-pdf', {
        body: { file_path: source.file_path, exam_template_id: selectedTemplateId },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`تم استخراج ${data.char_count} حرف من ${source.file_name}`);
        await loadProfileAndSources(selectedTemplateId);
      } else {
        toast.error(data?.error || 'فشل الاستخراج');
      }
    } catch (e: any) {
      toast.error('فشل الاستخراج: ' + e.message);
    }
    setExtracting(null);
  };

  const handleDeleteSource = async (source: SourceFile) => {
    await supabase.storage.from('exam-sources').remove([source.file_path]);
    await (supabase.from('exam_profile_sources' as any) as any).delete().eq('id', source.id);
    toast.success('تم حذف الملف');
    await loadProfileAndSources(selectedTemplateId);
  };

  // ─── Step 3: Generate DNA ───────────────────────────────────
  const handleFetchSpec = async () => {
    if (!selectedTemplateId) return;
    setFetchingSpec(true);
    try {
      const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
        body: { action: 'fetch_spec', exam_template_id: selectedTemplateId },
      });
      if (error) throw error;
      toast.success('تم جلب المواصفات');
      await loadProfileAndSources(selectedTemplateId);
      if (data?.profile) {
        setDnaData(data.profile);
        setJsonText(JSON.stringify(data.profile, null, 2));
      }
    } catch (e: any) {
      toast.error('فشل جلب المواصفات: ' + e.message);
    }
    setFetchingSpec(false);
  };

  const handleGenerateDNA = async () => {
    if (!selectedTemplateId) return;
    setGenerating(true);
    try {
      const extractedTexts = sourceFiles
        .filter(s => s.extracted_text)
        .map(s => s.extracted_text)
        .join('\n\n---\n\n');
      const combinedText = [extractedTexts, manualText, adminNotes ? `ملاحظات المسؤول: ${adminNotes}` : '']
        .filter(Boolean)
        .join('\n\n');

      const { data, error } = await supabase.functions.invoke('exam-profile-builder', {
        body: {
          action: 'infer_dna',
          exam_template_id: selectedTemplateId,
          sample_questions_text: combinedText || undefined,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('تم توليد DNA بنجاح');
        await loadProfileAndSources(selectedTemplateId);
        if (data?.profile) {
          setDnaData(data.profile);
          setJsonText(JSON.stringify(data.profile, null, 2));
          // Auto-save version
          await saveVersion(data.profile, 'draft', 'توليد DNA بالذكاء الاصطناعي');
        }
        setStep(4);
      } else {
        toast.error(data?.message || 'فشل التوليد');
      }
    } catch (e: any) {
      toast.error('فشل التوليد: ' + e.message);
    }
    setGenerating(false);
  };

  // ─── Step 4: Review & Edit DNA ──────────────────────────────
  const updateDnaField = (path: string, value: any) => {
    const updated = setNestedValue(dnaData, path, value);
    setDnaData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  const updateDifficultyMix = (key: string, val: number) => {
    const mix = { ...dnaData?.psychometric_dna?.difficulty_mix_default };
    mix[key] = val;
    const others = Object.keys(mix).filter(k => k !== key);
    const remaining = 100 - val;
    const otherSum = others.reduce((s, k) => s + (mix[k] || 0), 0);
    if (otherSum > 0) {
      others.forEach(k => { mix[k] = Math.round((mix[k] / otherSum) * remaining); });
      const newSum: number = Object.values(mix as Record<string, number>).reduce((s, v) => s + v, 0);
      if (newSum !== 100) mix[others[0]] += 100 - newSum;
    }
    updateDnaField('psychometric_dna.difficulty_mix_default', mix);
  };

  const saveDraft = async () => {
    if (!selectedTemplateId) return;
    setSaving(true);
    try {
      const dataToSave = jsonText ? (() => { try { return JSON.parse(jsonText); } catch { return dnaData; } })() : dnaData;
      if (profile) {
        await (supabase.from('exam_profiles' as any) as any).update({ profile_json: dataToSave, status: 'draft' }).eq('id', profile.id);
      } else {
        await (supabase.from('exam_profiles' as any) as any).insert({ exam_template_id: selectedTemplateId, profile_json: dataToSave, status: 'draft' });
      }
      await saveVersion(dataToSave, 'draft', 'حفظ مسودة يدوي');
      toast.success('تم حفظ المسودة');
      await loadProfileAndSources(selectedTemplateId);
    } catch (e: any) {
      toast.error('خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const approveProfile = async () => {
    if (!selectedTemplateId || !dnaData) return;
    const { valid, errors } = validateProfile(dnaData);
    if (!valid) {
      toast.error('لا يمكن الاعتماد — حقول مفقودة: ' + errors.join('، '));
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (profile) {
        await (supabase.from('exam_profiles' as any) as any).update({
          profile_json: dnaData,
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        }).eq('id', profile.id);
      } else {
        await (supabase.from('exam_profiles' as any) as any).insert({
          exam_template_id: selectedTemplateId,
          profile_json: dnaData,
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        });
      }
      await saveVersion(dnaData, 'approved', 'اعتماد DNA');
      toast.success('✅ تم اعتماد DNA بنجاح');
      await loadProfileAndSources(selectedTemplateId);
    } catch (e: any) {
      toast.error('خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const restoreVersion = async (v: ProfileVersion) => {
    setDnaData(v.profile_json);
    setJsonText(JSON.stringify(v.profile_json, null, 2));
    toast.success(`تم تحميل إصدار v${v.version_number} — احفظ أو اعتمد لتثبيت التغييرات`);
  };

  // ─── Validation Status ──────────────────────────────────────
  const validationResult = dnaData ? validateProfile(dnaData) : null;

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Dna className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">بناء بصمة الاختبار (DNA Builder)</h1>
            <p className="text-muted-foreground text-sm">رفع PDF → توليد DNA → مراجعة → اعتماد</p>
          </div>
        </div>
        {selectedTemplateId && (
          <Button variant="outline" size="sm" onClick={() => { setSelectedTemplateId(''); setStep(1); }}>
            تغيير الاختبار
          </Button>
        )}
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 flex-wrap bg-card rounded-xl p-4 border">
        <StepIndicator step={1} currentStep={step} label="اختيار الاختبار" />
        <StepIndicator step={2} currentStep={step} label="رفع المصادر" />
        <StepIndicator step={3} currentStep={step} label="توليد DNA" />
        <StepIndicator step={4} currentStep={step} label="مراجعة واعتماد" />
      </div>

      {/* Step 1: Select Exam */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>اختر قالب الاختبار</CardTitle>
            <CardDescription>حدد الاختبار الذي تريد بناء بصمته</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map(tmpl => (
                <Card
                  key={tmpl.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleSelectExam(tmpl.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">{tmpl.name_ar}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{tmpl.country_id} · {tmpl.default_question_count} سؤال</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload Sources */}
      {step === 2 && selectedTemplate && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                رفع مصادر — {selectedTemplate.name_ar}
              </CardTitle>
              <CardDescription>ارفع عينات PDF أو الصق نص الأسئلة يدوياً</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* PDF Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">رفع ملفات PDF</Label>
                <div className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">اسحب الملفات هنا أو</p>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Plus className="h-4 w-4 ml-1" />}
                    اختر ملفات
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              {/* Uploaded files list */}
              {sourceFiles.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">الملفات المرفوعة ({sourceFiles.length})</Label>
                  {sourceFiles.map(sf => (
                    <div key={sf.id} className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{sf.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(sf.file_size_bytes / 1024).toFixed(0)} KB
                            {sf.extracted_text && ` · ${sf.extracted_text.length} حرف مُستخرج`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {sf.extracted_text ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 text-xs">تم الاستخراج</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExtractText(sf)}
                            disabled={extracting === sf.id}
                          >
                            {extracting === sf.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />}
                            <span className="mr-1 text-xs">استخراج</span>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteSource(sf)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              {/* Manual text input */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">نص يدوي (اختياري)</Label>
                <Textarea
                  className="min-h-[150px]"
                  placeholder="الصق أسئلة نموذجية أو إرشادات رسمية هنا..."
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                />
              </div>

              {/* Admin notes */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">ملاحظات المسؤول (اختياري)</Label>
                <Textarea
                  className="min-h-[80px]"
                  placeholder="ملاحظات حول طبيعة الاختبار، مصادر إضافية..."
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>السابق</Button>
            <Button onClick={() => setStep(3)}>
              التالي: توليد DNA
              <ChevronRight className="h-4 w-4 mr-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Generate DNA */}
      {step === 3 && selectedTemplate && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                توليد DNA — {selectedTemplate.name_ar}
              </CardTitle>
              <CardDescription>سيقوم الذكاء الاصطناعي بتحليل المصادر وبناء بصمة الاختبار</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{sourceFiles.length}</p>
                  <p className="text-xs text-muted-foreground">ملفات مرفوعة</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{sourceFiles.filter(s => s.extracted_text).length}</p>
                  <p className="text-xs text-muted-foreground">تم استخراجها</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{manualText.length > 0 ? '✓' : '—'}</p>
                  <p className="text-xs text-muted-foreground">نص يدوي</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{profile?.status === 'approved' ? '✅' : profile?.status === 'draft' ? '📝' : '—'}</p>
                  <p className="text-xs text-muted-foreground">الحالة</p>
                </div>
              </div>

              {sourceFiles.length > 0 && sourceFiles.some(s => !s.extracted_text) && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 text-yellow-700 rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  بعض الملفات لم يتم استخراج نصها — عُد للخطوة السابقة واستخرج النص أولاً
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleFetchSpec} disabled={fetchingSpec}>
                  {fetchingSpec ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <FileSearch className="h-4 w-4 ml-1" />}
                  1. جلب المواصفات
                </Button>
                <Button onClick={handleGenerateDNA} disabled={generating} className="bg-primary">
                  {generating ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Sparkles className="h-4 w-4 ml-1" />}
                  2. توليد DNA بالذكاء الاصطناعي
                </Button>
              </div>

              {generating && (
                <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm">جارٍ تحليل المصادر وبناء البصمة... قد يستغرق 30-60 ثانية</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>السابق</Button>
            {dnaData && (
              <Button onClick={() => setStep(4)}>
                التالي: مراجعة DNA
                <ChevronRight className="h-4 w-4 mr-1" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review & Approve */}
      {step === 4 && selectedTemplate && dnaData && (
        <div className="space-y-4">
          {/* Status Bar */}
          <div className="flex items-center justify-between bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Dna className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">{selectedTemplate.name_ar}</h2>
                <p className="text-xs text-muted-foreground">
                  {profile?.status === 'approved' ? 'معتمد' : 'مسودة'}
                  {profile?.updated_at && ` · آخر تحديث: ${new Date(profile.updated_at).toLocaleDateString('ar')}`}
                  {versions.length > 0 && ` · ${versions.length} إصدار`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {profile?.status === 'approved'
                ? <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><ShieldCheck className="h-3 w-3 ml-1" />معتمد</Badge>
                : <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Shield className="h-3 w-3 ml-1" />مسودة</Badge>
              }
            </div>
          </div>

          {/* Validation errors */}
          {validationResult && !validationResult.valid && (
            <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
              <p className="text-sm font-medium text-destructive mb-2">حقول مفقودة ({validationResult.errors.length}):</p>
              <ul className="text-xs text-destructive space-y-1">
                {validationResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          <Tabs defaultValue="form">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="form">النموذج المهيكل</TabsTrigger>
              <TabsTrigger value="json">محرر JSON</TabsTrigger>
              <TabsTrigger value="validation">التحقق ({validationResult?.errors.length || 0})</TabsTrigger>
              <TabsTrigger value="versions" className="flex items-center gap-1">
                <History className="h-3.5 w-3.5" />
                الإصدارات ({versions.length})
              </TabsTrigger>
            </TabsList>

            {/* Structured Form */}
            <TabsContent value="form" className="space-y-4">
              {/* Official Spec */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">المواصفات الرسمية</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">عدد الأسئلة</Label>
                    <Input
                      type="number"
                      value={dnaData?.official_spec?.total_questions || ''}
                      onChange={e => updateDnaField('official_spec.total_questions', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">المدة (دقائق)</Label>
                    <Input
                      type="number"
                      value={dnaData?.official_spec?.duration_minutes || ''}
                      onChange={e => updateDnaField('official_spec.duration_minutes', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">اللغات</Label>
                    <Input
                      value={(dnaData?.official_spec?.languages || []).join(', ')}
                      onChange={e => updateDnaField('official_spec.languages', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Psychometric DNA */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">البصمة السيكومترية (DNA)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">أسلوب التفكير</Label>
                      <Select
                        value={dnaData?.psychometric_dna?.thinking_style || 'mixed'}
                        onValueChange={v => updateDnaField('psychometric_dna.thinking_style', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">مباشر</SelectItem>
                          <SelectItem value="reasoning">استدلالي</SelectItem>
                          <SelectItem value="mixed">مختلط</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ضغط الوقت</Label>
                      <Select
                        value={dnaData?.psychometric_dna?.time_pressure_level || 'medium'}
                        onValueChange={v => updateDnaField('psychometric_dna.time_pressure_level', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">منخفض</SelectItem>
                          <SelectItem value="medium">متوسط</SelectItem>
                          <SelectItem value="high">عالي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">كثافة المصائد</Label>
                      <Select
                        value={dnaData?.psychometric_dna?.trap_density || 'medium'}
                        onValueChange={v => updateDnaField('psychometric_dna.trap_density', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">منخفض</SelectItem>
                          <SelectItem value="medium">متوسط</SelectItem>
                          <SelectItem value="high">عالي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">تعقيد الصياغة</Label>
                      <Select
                        value={dnaData?.psychometric_dna?.wording_complexity || 'medium'}
                        onValueChange={v => updateDnaField('psychometric_dna.wording_complexity', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">منخفض</SelectItem>
                          <SelectItem value="medium">متوسط</SelectItem>
                          <SelectItem value="high">عالي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">حمل الحساب</Label>
                      <Select
                        value={dnaData?.psychometric_dna?.calculation_load || 'low'}
                        onValueChange={v => updateDnaField('psychometric_dna.calculation_load', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">منخفض</SelectItem>
                          <SelectItem value="medium">متوسط</SelectItem>
                          <SelectItem value="high">عالي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">عمق التفكير: {dnaData?.psychometric_dna?.reasoning_depth_level || 3}</Label>
                      <Slider
                        min={1} max={5} step={1}
                        value={[dnaData?.psychometric_dna?.reasoning_depth_level || 3]}
                        onValueChange={([v]) => updateDnaField('psychometric_dna.reasoning_depth_level', v)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Difficulty Mix */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">توزيع الصعوبة</Label>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label className="text-xs">سهل: {dnaData?.psychometric_dna?.difficulty_mix_default?.easy || 0}%</Label>
                        <Slider
                          min={0} max={100} step={5}
                          value={[dnaData?.psychometric_dna?.difficulty_mix_default?.easy || 30]}
                          onValueChange={([v]) => updateDifficultyMix('easy', v)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">متوسط: {dnaData?.psychometric_dna?.difficulty_mix_default?.medium || 0}%</Label>
                        <Slider
                          min={0} max={100} step={5}
                          value={[dnaData?.psychometric_dna?.difficulty_mix_default?.medium || 50]}
                          onValueChange={([v]) => updateDifficultyMix('medium', v)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">صعب: {dnaData?.psychometric_dna?.difficulty_mix_default?.hard || 0}%</Label>
                        <Slider
                          min={0} max={100} step={5}
                          value={[dnaData?.psychometric_dna?.difficulty_mix_default?.hard || 20]}
                          onValueChange={([v]) => updateDifficultyMix('hard', v)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      المجموع: {(dnaData?.psychometric_dna?.difficulty_mix_default?.easy || 0) +
                        (dnaData?.psychometric_dna?.difficulty_mix_default?.medium || 0) +
                        (dnaData?.psychometric_dna?.difficulty_mix_default?.hard || 0)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Generation Rules */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">قواعد التوليد</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">عدد الخيارات</Label>
                      <Input
                        type="number"
                        value={dnaData?.generation_rules?.options_count || 4}
                        onChange={e => updateDnaField('generation_rules.options_count', parseInt(e.target.value) || 4)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الحد الأقصى لطول السؤال (حرف)</Label>
                      <Input
                        type="number"
                        value={dnaData?.generation_rules?.stem_max_chars || 200}
                        onChange={e => updateDnaField('generation_rules.stem_max_chars', parseInt(e.target.value) || 200)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={dnaData?.generation_rules?.single_correct_answer ?? true}
                        onCheckedChange={v => updateDnaField('generation_rules.single_correct_answer', v)}
                      />
                      <Label className="text-xs">إجابة صحيحة واحدة</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={dnaData?.generation_rules?.no_answer_in_stem ?? true}
                        onCheckedChange={v => updateDnaField('generation_rules.no_answer_in_stem', v)}
                      />
                      <Label className="text-xs">عدم كشف الإجابة في السؤال</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={dnaData?.generation_rules?.language_match_required ?? true}
                        onCheckedChange={v => updateDnaField('generation_rules.language_match_required', v)}
                      />
                      <Label className="text-xs">مطابقة اللغة</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* JSON Editor */}
            <TabsContent value="json">
              <Textarea
                className="font-mono text-xs min-h-[500px] direction-ltr text-left"
                dir="ltr"
                value={jsonText}
                onChange={e => {
                  setJsonText(e.target.value);
                  try { setDnaData(JSON.parse(e.target.value)); } catch {}
                }}
              />
            </TabsContent>

            {/* Validation */}
            <TabsContent value="validation">
              <div className="space-y-2 p-4">
                {REQUIRED_FIELDS_CHECKS.map((check, i) => {
                  const val = getNestedValue(dnaData, check.path);
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

            {/* Version History */}
            <TabsContent value="versions">
              <VersionHistoryPanel
                versions={versions}
                loading={versionsLoading}
                onRestore={restoreVersion}
              />
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex items-center justify-between bg-card border rounded-xl p-4">
            <Button variant="outline" onClick={() => setStep(3)}>السابق</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                حفظ كمسودة
              </Button>
              <Button
                onClick={approveProfile}
                disabled={saving || !validationResult?.valid}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                <ShieldCheck className="h-4 w-4 ml-1" />
                اعتماد DNA
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
