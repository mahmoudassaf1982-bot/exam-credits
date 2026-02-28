import { useState, useEffect, useCallback, useMemo } from 'react';
import ActiveJobsBadge from '@/components/admin/ActiveJobsBadge';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Eye, Send, RotateCcw, Trash2, Edit3,
  FileCheck, Clock, ArrowLeftRight, Wand2, ShieldCheck, ShieldAlert, ShieldX,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DraftQuestion {
  index: number;
  text_ar: string;
  options: { id: string; textAr: string }[];
  correct_option_id: string;
  explanation: string;
  difficulty: string;
  topic: string;
  section_id?: string | null;
}

interface QualityScores {
  confidence_score: number;
  clarity_score: number;
  difficulty_match: number;
  single_answer_confidence: number;
  language_quality: number;
  language_consistency_score?: number;
}

interface ReviewItem {
  index: number;
  ok: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  duplicate_risk: boolean;
  quality_scores?: QualityScores;
  corrected?: DraftQuestion;
}

interface QualityGate {
  decision: string;
  avg_confidence: number;
  auto_publishable: number;
  needs_review_count: number;
  needs_fix_count: number;
  language_failures?: number;
  thresholds: { auto_publish: number; needs_review: number };
}

interface BatchStats {
  total_batches: number;
  completed_batches: number;
  failed_batches: number[];
  batch_size: number;
}

interface ReviewReport {
  overall_ok: boolean;
  summary: string;
  issues_count: number;
  reviews: ReviewItem[];
  batch_stats?: BatchStats;
  quality_gate?: QualityGate;
}

interface Draft {
  id: string;
  created_at: string;
  country_id: string;
  exam_template_id: string | null;
  difficulty: string;
  count: number;
  generator_model: string;
  reviewer_model: string;
  draft_questions_json: DraftQuestion[];
  corrected_questions_json: DraftQuestion[] | null;
  reviewer_report_json: ReviewReport | null;
  status: string;
  approved_at: string | null;
  notes: string | null;
}

interface Country { id: string; name_ar: string; flag: string; }
interface ExamTemplate { id: string; country_id: string; name_ar: string; }

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending_review: { label: 'بانتظار المراجعة', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
  needs_fix: { label: 'يحتاج إصلاح', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
  approved: { label: 'تمت الموافقة', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
  rejected: { label: 'مرفوض', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
};

const optionLabels = ['أ', 'ب', 'ج', 'د'];

// ─── Quality Helpers ─────────────────────────────────────────────────
function getConfidenceColor(score: number): string {
  if (score >= 0.85) return 'text-emerald-600';
  if (score >= 0.70) return 'text-amber-600';
  return 'text-destructive';
}

function getConfidenceBg(score: number): string {
  if (score >= 0.85) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 0.70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-destructive/10 border-destructive/20';
}

function getConfidenceIcon(score: number) {
  if (score >= 0.85) return ShieldCheck;
  if (score >= 0.70) return ShieldAlert;
  return ShieldX;
}

function getQualityLevel(score: number): { label: string; level: 'green' | 'yellow' | 'red' } {
  if (score >= 0.85) return { label: 'ممتاز', level: 'green' };
  if (score >= 0.70) return { label: 'مقبول', level: 'yellow' };
  return { label: 'ضعيف', level: 'red' };
}

function ConfidenceBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  // Normalize: if score > 1, it's on 0-10 scale; convert to 0-1
  const normalized = score > 1 ? score / 10 : score;
  const Icon = getConfidenceIcon(normalized);
  const pct = Math.round(normalized * 100);
  return (
    <Badge variant="outline" className={`${getConfidenceBg(normalized)} ${getConfidenceColor(normalized)} ${size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>
      <Icon className={`${size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} ml-1`} />
      {pct}%
    </Badge>
  );
}

function QualityBadgeWithTooltip({ scores }: { scores: QualityScores }) {
  const avg = scores.confidence_score;
  const { label, level } = getQualityLevel(avg);
  const Icon = getConfidenceIcon(avg);
  const colorMap = {
    green: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    yellow: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    red: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${colorMap[level]} cursor-help gap-1`}>
            <Icon className="h-3 w-3" />
            {label} {Math.round(avg * 100)}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-1 max-w-[200px]" dir="rtl">
          <p>الثقة: {Math.round(scores.confidence_score * 100)}%</p>
          <p>الوضوح: {Math.round(scores.clarity_score * 100)}%</p>
          <p>الصعوبة: {Math.round(scores.difficulty_match * 100)}%</p>
          <p>إجابة واحدة: {Math.round(scores.single_answer_confidence * 100)}%</p>
          <p>جودة اللغة: {Math.round(scores.language_quality * 100)}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function QualityScoresPanel({ scores }: { scores: QualityScores }) {
  const items = [
    { label: 'الثقة العامة', value: scores.confidence_score },
    { label: 'الوضوح', value: scores.clarity_score },
    { label: 'تطابق الصعوبة', value: scores.difficulty_match },
    { label: 'إجابة واحدة', value: scores.single_answer_confidence },
    { label: 'جودة اللغة', value: scores.language_quality },
    ...(scores.language_consistency_score !== undefined ? [{ label: '🔤 تناسق اللغة', value: scores.language_consistency_score }] : []),
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
      {items.map(item => (
        <div key={item.label} className="text-center">
          <p className="text-[9px] text-muted-foreground mb-1">{item.label}</p>
          <div className={`text-xs font-bold ${getConfidenceColor(item.value)}`}>
            {Math.round(item.value * 100)}%
          </div>
          <Progress value={item.value * 100} className="h-1 mt-1" />
        </div>
      ))}
    </div>
  );
}

function QualityGateCard({ gate }: { gate: QualityGate }) {
  const Icon = getConfidenceIcon(gate.avg_confidence);
  const decisionLabels: Record<string, string> = {
    approved: '✅ اجتاز البوابة — جاهز للنشر التلقائي',
    pending_review: '⚠️ يحتاج مراجعة بشرية',
    needs_fix: '❌ لم يجتاز — يحتاج إصلاح',
  };

  return (
    <Card className={`border-2 ${getConfidenceBg(gate.avg_confidence)}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${getConfidenceColor(gate.avg_confidence)}`} />
            <span className="font-bold text-sm">بوابة الجودة</span>
          </div>
          <ConfidenceBadge score={gate.avg_confidence} size="lg" />
        </div>
        <p className={`text-sm font-semibold ${getConfidenceColor(gate.avg_confidence)}`}>
          {decisionLabels[gate.decision] || gate.decision}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {gate.auto_publishable !== undefined && <span className="text-emerald-600">✅ {gate.auto_publishable} جاهز</span>}
          {gate.needs_review_count !== undefined && <span className="text-amber-600">⚠️ {gate.needs_review_count} مراجعة</span>}
          {gate.needs_fix_count !== undefined && <span className="text-destructive">❌ {gate.needs_fix_count} إصلاح</span>}
          {(gate.language_failures ?? 0) > 0 && (
            <span className="text-destructive font-semibold">🔤 {gate.language_failures} فشل لغوي</span>
          )}
          {gate.thresholds?.auto_publish !== undefined && <span>الحد: {gate.thresholds.auto_publish * 100}%</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function AdminAIReviewQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending_review');
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);

  // Edit dialog
  const [editingQuestion, setEditingQuestion] = useState<{ draftId: string; index: number; question: DraftQuestion } | null>(null);
  const [editForm, setEditForm] = useState<DraftQuestion | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('question_drafts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch drafts:', error);
      toast({ title: 'خطأ في تحميل المسودات', variant: 'destructive' });
    } else {
      // Safely parse JSON fields that might come as strings
      const safeDrafts = (data || []).map((d: any) => ({
        ...d,
        draft_questions_json: Array.isArray(d.draft_questions_json) 
          ? d.draft_questions_json 
          : (typeof d.draft_questions_json === 'string' ? (() => { try { return JSON.parse(d.draft_questions_json); } catch { return []; } })() : []),
        corrected_questions_json: d.corrected_questions_json == null ? null 
          : Array.isArray(d.corrected_questions_json) ? d.corrected_questions_json 
          : (typeof d.corrected_questions_json === 'string' ? (() => { try { return JSON.parse(d.corrected_questions_json); } catch { return null; } })() : null),
        reviewer_report_json: d.reviewer_report_json == null ? null
          : typeof d.reviewer_report_json === 'object' ? d.reviewer_report_json
          : (typeof d.reviewer_report_json === 'string' ? (() => { try { return JSON.parse(d.reviewer_report_json); } catch { return null; } })() : null),
      }));
      setDrafts(safeDrafts as Draft[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchDrafts();
    const fetchMeta = async () => {
      const [cRes, eRes] = await Promise.all([
        supabase.from('countries').select('id, name_ar, flag').eq('is_active', true),
        supabase.from('exam_templates').select('id, country_id, name_ar').eq('is_active', true),
      ]);
      const c = cRes.data || [];
      setCountries(c);
      setExams(eRes.data || []);
    };
    fetchMeta();
  }, []);

  const filteredDrafts = drafts.filter(d => d.status === activeTab);

  const handleReview = async (draftId: string) => {
    setActionLoading(`review-${draftId}`);
    try {
      const { data, error } = await supabase.functions.invoke('ai-enqueue', {
        body: { type: 'review_draft', draft_id: draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: '✅ تم إضافة مهمة المراجعة للطابور — يمكنك إغلاق الصفحة بأمان' });
      fetchDrafts();
    } catch (e: any) {
      toast({ title: 'خطأ في المراجعة', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublish = async (draftId: string) => {
    setActionLoading(`publish-${draftId}`);
    try {
      const { data, error } = await supabase.functions.invoke('ai-enqueue', {
        body: { type: 'publish_draft', draft_id: draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: '✅ تم إضافة مهمة النشر للطابور' });
      setSelectedDraft(null);
      fetchDrafts();
    } catch (e: any) {
      toast({ title: 'خطأ في النشر', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (draftId: string) => {
    setActionLoading(`reject-${draftId}`);
    try {
      const { error } = await supabase
        .from('question_drafts')
        .update({ status: 'rejected' })
        .eq('id', draftId);
      if (error) throw error;
      toast({ title: 'تم رفض المسودة' });
      setSelectedDraft(null);
      fetchDrafts();
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion || !editForm) return;
    const draft = drafts.find(d => d.id === editingQuestion.draftId);
    if (!draft) return;

    const corrected = draft.corrected_questions_json ? [...draft.corrected_questions_json] : [...draft.draft_questions_json];
    corrected[editingQuestion.index] = editForm;

    const { error } = await supabase
      .from('question_drafts')
      .update({ corrected_questions_json: corrected as any })
      .eq('id', editingQuestion.draftId);

    if (error) {
      toast({ title: 'خطأ في الحفظ', variant: 'destructive' });
    } else {
      toast({ title: 'تم تحديث السؤال' });
      setEditingQuestion(null);
      setEditForm(null);
      fetchDrafts();
    }
  };

  const getCountryName = (id: string) => {
    const c = countries.find(c => c.id === id);
    return c ? `${c.flag} ${c.name_ar}` : id;
  };

  const getExamName = (id: string | null) => {
    if (!id) return 'عام';
    return exams.find(e => e.id === id)?.name_ar || id;
  };


  return (
    <div className="space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
            <FileCheck className="h-7 w-7 text-primary" />
            مراجعة الأسئلة المولّدة
          </h1>
          <p className="mt-1 text-muted-foreground">راجع المسودات واعتمدها أو ارفضها — التوليد يتم من بوابة التوليد</p>
          <div className="mt-3">
            <ActiveJobsBadge />
          </div>
        </div>
        <Button onClick={() => navigate('/app/admin/ai-generator')} className="gradient-primary text-primary-foreground">
          <Sparkles className="h-4 w-4 ml-2" />
          الذهاب لبوابة التوليد
        </Button>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          {Object.entries(STATUS_MAP).map(([key, { label, icon: Icon }]) => {
            const count = drafts.filter(d => d.status === key).length;
            return (
              <TabsTrigger key={key} value={key} className="gap-2">
                <Icon className="h-3.5 w-3.5" />
                {label}
                {count > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDrafts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد مسودات في هذه الحالة</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filteredDrafts.map(draft => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  countryName={getCountryName(draft.country_id)}
                  examName={getExamName(draft.exam_template_id)}
                  onView={() => setSelectedDraft(draft)}
                  onReview={() => handleReview(draft.id)}
                  onPublish={() => handlePublish(draft.id)}
                  onReject={() => handleReject(draft.id)}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Draft Detail Dialog */}
      {selectedDraft && (
        <DraftDetailDialog
          draft={selectedDraft}
          countryName={getCountryName(selectedDraft.country_id)}
          examName={getExamName(selectedDraft.exam_template_id)}
          onClose={() => setSelectedDraft(null)}
          onReview={() => handleReview(selectedDraft.id)}
          onPublish={() => handlePublish(selectedDraft.id)}
          onReject={() => handleReject(selectedDraft.id)}
          onEdit={(index, question) => {
            setEditingQuestion({ draftId: selectedDraft.id, index, question });
            setEditForm({ ...question });
          }}
          actionLoading={actionLoading}
        />
      )}

      {/* Edit Question Dialog */}
      {editingQuestion && editForm && (
        <Dialog open onOpenChange={() => { setEditingQuestion(null); setEditForm(null); }}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>تعديل السؤال #{editingQuestion.index + 1}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>نص السؤال</Label>
                <Textarea value={editForm.text_ar} onChange={e => setEditForm({ ...editForm, text_ar: e.target.value })} />
              </div>
              {editForm.options.map((opt, i) => (
                <div key={opt.id} className="space-y-1">
                  <Label>{optionLabels[i]}</Label>
                  <div className="flex gap-2 items-center">
                    <Input value={opt.textAr} onChange={e => {
                      const newOpts = [...editForm.options];
                      newOpts[i] = { ...newOpts[i], textAr: e.target.value };
                      setEditForm({ ...editForm, options: newOpts });
                    }} />
                    <input type="radio" checked={editForm.correct_option_id === opt.id}
                      onChange={() => setEditForm({ ...editForm, correct_option_id: opt.id })} />
                  </div>
                </div>
              ))}
              <div className="space-y-2">
                <Label>الشرح</Label>
                <Textarea value={editForm.explanation} onChange={e => setEditForm({ ...editForm, explanation: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الصعوبة</Label>
                  <Select value={editForm.difficulty} onValueChange={v => setEditForm({ ...editForm, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">سهل</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="hard">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الموضوع</Label>
                  <Input value={editForm.topic} onChange={e => setEditForm({ ...editForm, topic: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingQuestion(null); setEditForm(null); }}>إلغاء</Button>
              <Button onClick={handleSaveEdit}>حفظ التعديلات</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Draft Card ──────────────────────────────────────────────────────
function DraftCard({
  draft, countryName, examName, onView, onReview, onPublish, onReject, actionLoading,
}: {
  draft: Draft; countryName: string; examName: string;
  onView: () => void; onReview: () => void; onPublish: () => void; onReject: () => void;
  actionLoading: string | null;
}) {
  const status = STATUS_MAP[draft.status] || STATUS_MAP.pending_review;
  const StatusIcon = status.icon;
  const report = draft.reviewer_report_json;
  const hasCorrected = !!draft.corrected_questions_json;
  const qualityGate = report?.quality_gate;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="outline" className={status.color}>
                <StatusIcon className="h-3 w-3 ml-1" />{status.label}
              </Badge>
              <Badge variant="secondary">{countryName}</Badge>
              <Badge variant="secondary">{examName}</Badge>
              <Badge variant="outline">{draft.count} سؤال</Badge>
              <Badge variant="outline">{draft.difficulty === 'easy' ? 'سهل' : draft.difficulty === 'hard' ? 'صعب' : 'متوسط'}</Badge>
              {hasCorrected && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  <Wand2 className="h-3 w-3 ml-1" />مصحح
                </Badge>
              )}
              {qualityGate && (
                <ConfidenceBadge score={qualityGate.avg_confidence} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(draft.created_at).toLocaleString('ar')} • النموذج: {draft.generator_model}
            </p>
            {report && (
              <p className="text-xs mt-1 text-muted-foreground">{report.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onView}><Eye className="h-3.5 w-3.5 ml-1" />عرض</Button>
            {draft.status !== 'approved' && draft.status !== 'rejected' && (
              <>
                <Button variant="outline" size="sm" onClick={onReview} disabled={actionLoading === `review-${draft.id}`}>
                  {actionLoading === `review-${draft.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 ml-1" />}
                  مراجعة
                </Button>
                <Button size="sm" onClick={onPublish} disabled={actionLoading === `publish-${draft.id}`}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {actionLoading === `publish-${draft.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 ml-1" />}
                  نشر
                </Button>
                <Button variant="destructive" size="sm" onClick={onReject} disabled={actionLoading === `reject-${draft.id}`}>
                  <XCircle className="h-3.5 w-3.5 ml-1" />رفض
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Draft Detail Dialog ─────────────────────────────────────────────
function DraftDetailDialog({
  draft, countryName, examName, onClose, onReview, onPublish, onReject, onEdit, actionLoading,
}: {
  draft: Draft; countryName: string; examName: string;
  onClose: () => void; onReview: () => void; onPublish: () => void; onReject: () => void;
  onEdit: (index: number, question: DraftQuestion) => void;
  actionLoading: string | null;
}) {
  const originalQuestions = draft.draft_questions_json || [];
  const correctedQuestions = draft.corrected_questions_json || null;
  const report = draft.reviewer_report_json;
  const reviews = report?.reviews || [];
  const qualityGate = report?.quality_gate;
  const [showComparison, setShowComparison] = useState(!!correctedQuestions);
  const [qualityFilter, setQualityFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const displayQuestions = correctedQuestions || originalQuestions;

  // Compute quality level per question
  const questionQuality = useMemo(() => {
    return displayQuestions.map((_, i) => {
      const review = reviews.find(r => r.index === i);
      const conf = review?.quality_scores?.confidence_score;
      if (conf === undefined || conf === null) return null;
      return getQualityLevel(conf).level;
    });
  }, [displayQuestions, reviews]);

  const filteredIndices = useMemo(() => {
    return displayQuestions.map((_, i) => i).filter(i => {
      if (qualityFilter === 'all') return true;
      return questionQuality[i] === qualityFilter;
    });
  }, [displayQuestions, qualityFilter, questionQuality]);

  const toggleSelect = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(filteredIndices));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleBulkApprove = async () => {
    if (selectedIndices.size === 0) return;
    // Mark selected questions as approved by updating corrected_questions_json metadata
    // For now, we publish the entire draft if all selected
    onPublish();
  };

  const handleBulkSendBack = async () => {
    if (selectedIndices.size === 0) return;
    onReview();
  };

  const qualityCounts = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 };
    questionQuality.forEach(q => { if (q) counts[q]++; });
    return counts;
  }, [questionQuality]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            مسودة — {countryName} / {examName}
            <Badge variant="outline">{draft.count} سؤال</Badge>
            {correctedQuestions && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                <Wand2 className="h-3 w-3 ml-1" />مصحح
              </Badge>
            )}
            {qualityGate && <ConfidenceBadge score={qualityGate.avg_confidence} size="lg" />}
          </DialogTitle>
        </DialogHeader>

        {/* Quality Gate Card */}
        {qualityGate && <QualityGateCard gate={qualityGate} />}

        {report && !qualityGate && (
          <Card className={report.overall_ok ? 'border-emerald-500/30' : 'border-destructive/30'}>
            <CardContent className="p-3 space-y-2">
              <p className="text-sm font-semibold">
                {report.overall_ok ? '✅ المراجعة ناجحة' : `⚠️ ${report.issues_count} مشكلة`}
              </p>
              <p className="text-xs text-muted-foreground">{report.summary}</p>
            </CardContent>
          </Card>
        )}

        {report?.batch_stats && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1">
            <span>📦 {report.batch_stats.completed_batches}/{report.batch_stats.total_batches} دفعات</span>
            <span>📏 {report.batch_stats.batch_size} سؤال/دفعة</span>
            {report.batch_stats.failed_batches.length > 0 && (
              <span className="text-destructive">❌ {report.batch_stats.failed_batches.length} فاشلة</span>
            )}
          </div>
        )}

        {/* Quality Filter + Bulk Actions Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Button variant={qualityFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setQualityFilter('all')}>
              الكل ({displayQuestions.length})
            </Button>
            {qualityCounts.green > 0 && (
              <Button variant={qualityFilter === 'green' ? 'default' : 'outline'} size="sm"
                className={qualityFilter !== 'green' ? 'text-emerald-600 border-emerald-500/30' : ''}
                onClick={() => setQualityFilter('green')}>
                ✅ ممتاز ({qualityCounts.green})
              </Button>
            )}
            {qualityCounts.yellow > 0 && (
              <Button variant={qualityFilter === 'yellow' ? 'default' : 'outline'} size="sm"
                className={qualityFilter !== 'yellow' ? 'text-amber-600 border-amber-500/30' : ''}
                onClick={() => setQualityFilter('yellow')}>
                ⚠️ مقبول ({qualityCounts.yellow})
              </Button>
            )}
            {qualityCounts.red > 0 && (
              <Button variant={qualityFilter === 'red' ? 'default' : 'outline'} size="sm"
                className={qualityFilter !== 'red' ? 'text-destructive border-destructive/30' : ''}
                onClick={() => setQualityFilter('red')}>
                ❌ ضعيف ({qualityCounts.red})
              </Button>
            )}
          </div>

          {draft.status !== 'approved' && draft.status !== 'rejected' && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectedIndices.size === filteredIndices.length ? deselectAll : selectAll}>
                {selectedIndices.size === filteredIndices.length ? 'إلغاء التحديد' : `تحديد الكل (${filteredIndices.length})`}
              </Button>
              {selectedIndices.size > 0 && (
                <>
                  <Badge variant="secondary">{selectedIndices.size} محدد</Badge>
                  <Button size="sm" onClick={handleBulkApprove}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Send className="h-3.5 w-3.5 ml-1" />موافقة ونشر
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBulkSendBack}>
                    <RotateCcw className="h-3.5 w-3.5 ml-1" />إعادة مراجعة
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Comparison toggle */}
        {correctedQuestions && (
          <div className="flex items-center gap-2">
            <Button variant={showComparison ? 'default' : 'outline'} size="sm"
              onClick={() => setShowComparison(!showComparison)}>
              <ArrowLeftRight className="h-3.5 w-3.5 ml-1" />
              {showComparison ? 'إخفاء المقارنة' : 'عرض المقارنة'}
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {filteredIndices.map(i => {
            const q = displayQuestions[i];
            const review = reviews.find(r => r.index === i);
            const original = originalQuestions[i];
            const corrected = correctedQuestions?.[i];
            const hasChanges = corrected && JSON.stringify(original) !== JSON.stringify(corrected);
            const qs = review?.quality_scores;
            const conf = qs?.confidence_score ?? null;
            const isLowScore = conf !== null && conf < 0.70;
            const isSelected = selectedIndices.has(i);

            return (
              <Card key={i} className={isLowScore ? 'border-destructive/50 bg-destructive/5' : review && !review.ok ? 'border-destructive/30' : hasChanges ? 'border-primary/30' : ''}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {draft.status !== 'approved' && draft.status !== 'rejected' && (
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(i)} />
                      )}
                      <span className="font-bold text-primary">#{i + 1}</span>
                      {review && (
                        <Badge variant={review.ok ? 'default' : 'destructive'} className="text-[10px]">
                          {review.ok ? `✓ ${review.score}/10` : `✗ ${review.score}/10`}
                        </Badge>
                      )}
                      {qs && <QualityBadgeWithTooltip scores={qs} />}
                      {review?.duplicate_risk && <Badge variant="destructive" className="text-[10px]">تكرار</Badge>}
                      {hasChanges && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">معدّل</Badge>}
                    </div>
                    {draft.status !== 'approved' && (
                      <Button variant="ghost" size="sm" onClick={() => onEdit(i, corrected || q)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Quality scores panel */}
                  {qs && <QualityScoresPanel scores={qs} />}

                  {/* Comparison view */}
                  {showComparison && hasChanges ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                        <p className="text-[10px] font-bold text-destructive">الأصل (Flash)</p>
                        <p className="text-sm">{original?.text_ar || ''}</p>
                        <div className="space-y-1">
                          {(original?.options || []).map((opt, oi) => (
                            <div key={opt?.id || oi} className={`text-xs p-1.5 rounded ${opt?.id === original?.correct_option_id ? 'bg-emerald-500/10 font-semibold' : 'bg-muted/30'}`}>
                              <span className="font-bold ml-1">{optionLabels[oi]}.</span> {opt?.textAr || ''}
                            </div>
                          ))}
                        </div>
                        {original?.explanation && <p className="text-[11px] text-muted-foreground">💡 {original.explanation}</p>}
                      </div>
                      <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <p className="text-[10px] font-bold text-emerald-600">المصحح (Pro)</p>
                        <p className="text-sm">{corrected?.text_ar || ''}</p>
                        <div className="space-y-1">
                          {(corrected?.options || []).map((opt, oi) => (
                            <div key={opt?.id || oi} className={`text-xs p-1.5 rounded ${opt?.id === corrected?.correct_option_id ? 'bg-emerald-500/10 font-semibold' : 'bg-muted/30'}`}>
                              <span className="font-bold ml-1">{optionLabels[oi]}.</span> {opt?.textAr || ''}
                            </div>
                          ))}
                        </div>
                        {corrected?.explanation && <p className="text-[11px] text-muted-foreground">💡 {corrected.explanation}</p>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-sm">{q?.text_ar || ''}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(q?.options || []).map((opt, oi) => (
                          <div key={opt?.id || oi} className={`text-xs p-2 rounded border ${opt?.id === q?.correct_option_id ? 'bg-emerald-500/10 border-emerald-500/30 font-semibold' : 'bg-muted/50'}`}>
                            <span className="font-bold ml-1">{optionLabels[oi]}.</span> {opt?.textAr || ''}
                          </div>
                        ))}
                      </div>
                      {q?.explanation && <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">💡 {q.explanation}</p>}
                    </>
                  )}

                  {review && (review.issues || []).length > 0 && (
                    <div className="text-xs text-destructive space-y-0.5">
                      {(review.issues || []).map((issue, ii) => <p key={ii}>❌ {issue}</p>)}
                    </div>
                  )}
                  {review && (review.suggestions || []).length > 0 && (
                    <div className="text-xs text-amber-600 space-y-0.5">
                      {(review.suggestions || []).map((s, si) => <p key={si}>💡 {s}</p>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {draft.status !== 'approved' && draft.status !== 'rejected' && (
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={onReview} disabled={actionLoading === `review-${draft.id}`}>
              {actionLoading === `review-${draft.id}` ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <RotateCcw className="h-4 w-4 ml-2" />}
              إعادة المراجعة
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={actionLoading === `reject-${draft.id}`}>
              <XCircle className="h-4 w-4 ml-2" />رفض
            </Button>
            <Button onClick={onPublish} disabled={actionLoading === `publish-${draft.id}`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {actionLoading === `publish-${draft.id}` ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              {correctedQuestions ? 'موافقة ونشر المصحح' : 'موافقة ونشر'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
