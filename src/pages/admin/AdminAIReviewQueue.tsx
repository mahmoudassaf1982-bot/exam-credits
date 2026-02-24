import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, Loader2, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Eye, Send, RotateCcw, Trash2, Edit3,
  FileCheck, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

interface ReviewItem {
  index: number;
  ok: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  duplicate_risk: boolean;
}

interface ReviewReport {
  overall_ok: boolean;
  summary: string;
  issues_count: number;
  reviews: ReviewItem[];
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

export default function AdminAIReviewQueue() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending_review');
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Generate form state
  const [showGenerate, setShowGenerate] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [exams, setExams] = useState<ExamTemplate[]>([]);
  const [genCountry, setGenCountry] = useState('');
  const [genExam, setGenExam] = useState('');
  const [genDifficulty, setGenDifficulty] = useState('medium');
  const [genCount, setGenCount] = useState(10);
  const [generating, setGenerating] = useState(false);

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
      setDrafts((data || []) as unknown as Draft[]);
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
      if (c.length > 0 && !genCountry) setGenCountry(c[0].id);
    };
    fetchMeta();
  }, []);

  const filteredDrafts = drafts.filter(d => d.status === activeTab);
  const filteredExams = exams.filter(e => e.country_id === genCountry);

  const handleGenerate = async () => {
    if (!genCountry) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-questions-draft', {
        body: { country_id: genCountry, exam_template_id: genExam || null, difficulty: genDifficulty, count: genCount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `تم إنشاء مسودة بـ ${data.question_count} سؤال ✨` });
      setShowGenerate(false);
      fetchDrafts();
    } catch (e: any) {
      toast({ title: 'خطأ في التوليد', description: e?.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = async (draftId: string) => {
    setActionLoading(`review-${draftId}`);
    try {
      const { data, error } = await supabase.functions.invoke('review-questions-draft', {
        body: { draft_id: draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'تمت المراجعة بنجاح', description: data.report?.summary || '' });
      fetchDrafts();
      if (selectedDraft?.id === draftId) {
        const updated = drafts.find(d => d.id === draftId);
        if (updated) setSelectedDraft({ ...updated, reviewer_report_json: data.report, status: data.status });
      }
    } catch (e: any) {
      toast({ title: 'خطأ في المراجعة', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublish = async (draftId: string) => {
    setActionLoading(`publish-${draftId}`);
    try {
      const { data, error } = await supabase.functions.invoke('publish-draft', {
        body: { draft_id: draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `تم نشر ${data.published_count} سؤال في بنك الأسئلة ✅` });
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

    const updatedQuestions = [...draft.draft_questions_json];
    updatedQuestions[editingQuestion.index] = editForm;

    const { error } = await supabase
      .from('question_drafts')
      .update({ draft_questions_json: updatedQuestions as any })
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
          <p className="mt-1 text-muted-foreground">مسار: توليد ← مراجعة بالذكاء ← موافقة ← نشر</p>
        </div>
        <Button onClick={() => setShowGenerate(!showGenerate)} className="gradient-primary text-primary-foreground">
          <Sparkles className="h-4 w-4 ml-2" />
          توليد مسودة جديدة
        </Button>
      </motion.div>

      {/* Generate Form */}
      {showGenerate && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <Card>
            <CardHeader><CardTitle className="text-lg">توليد مسودة أسئلة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الدولة</Label>
                  <Select value={genCountry} onValueChange={setGenCountry}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag} {c.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الاختبار</Label>
                  <Select value={genExam} onValueChange={setGenExam}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عام</SelectItem>
                      {filteredExams.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>عدد الأسئلة</Label>
                  <Input type="number" min={1} max={50} value={genCount}
                    onChange={e => setGenCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="space-y-2">
                  <Label>الصعوبة</Label>
                  <Select value={genDifficulty} onValueChange={setGenDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">سهل</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="hard">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleGenerate} disabled={generating || !genCountry} className="w-full" size="lg">
                {generating ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />جارٍ التوليد...</> : <><Sparkles className="h-4 w-4 ml-2" />توليد المسودة</>}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(draft.created_at).toLocaleString('ar')} • النموذج: {draft.generator_model}
            </p>
            {report && (
              <p className="text-xs mt-1">
                {report.overall_ok ? (
                  <span className="text-emerald-600">✅ {report.summary}</span>
                ) : (
                  <span className="text-destructive">⚠️ {report.issues_count} مشكلة — {report.summary}</span>
                )}
              </p>
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

function DraftDetailDialog({
  draft, countryName, examName, onClose, onReview, onPublish, onReject, onEdit, actionLoading,
}: {
  draft: Draft; countryName: string; examName: string;
  onClose: () => void; onReview: () => void; onPublish: () => void; onReject: () => void;
  onEdit: (index: number, question: DraftQuestion) => void;
  actionLoading: string | null;
}) {
  const questions = draft.draft_questions_json || [];
  const report = draft.reviewer_report_json;
  const reviews = report?.reviews || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            مسودة — {countryName} / {examName}
            <Badge variant="outline">{draft.count} سؤال</Badge>
          </DialogTitle>
        </DialogHeader>

        {report && (
          <Card className={report.overall_ok ? 'border-emerald-500/30' : 'border-destructive/30'}>
            <CardContent className="p-3">
              <p className="text-sm font-semibold mb-1">
                {report.overall_ok ? '✅ المراجعة ناجحة' : `⚠️ ${report.issues_count} مشكلة`}
              </p>
              <p className="text-xs text-muted-foreground">{report.summary}</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {questions.map((q, i) => {
            const review = reviews.find(r => r.index === i);
            const correctIdx = q.options.findIndex(o => o.id === q.correct_option_id);
            return (
              <Card key={i} className={review && !review.ok ? 'border-destructive/30' : ''}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">#{i + 1}</span>
                      {review && (
                        <Badge variant={review.ok ? 'default' : 'destructive'} className="text-[10px]">
                          {review.ok ? `✓ ${review.score}/10` : `✗ ${review.score}/10`}
                        </Badge>
                      )}
                      {review?.duplicate_risk && <Badge variant="destructive" className="text-[10px]">تكرار محتمل</Badge>}
                    </div>
                    {draft.status !== 'approved' && (
                      <Button variant="ghost" size="sm" onClick={() => onEdit(i, q)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="font-medium text-sm">{q.text_ar}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <div key={opt.id} className={`text-xs p-2 rounded border ${opt.id === q.correct_option_id ? 'bg-emerald-500/10 border-emerald-500/30 font-semibold' : 'bg-muted/50'}`}>
                        <span className="font-bold ml-1">{optionLabels[oi]}.</span> {opt.textAr}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">💡 {q.explanation}</p>
                  )}
                  {review && review.issues.length > 0 && (
                    <div className="text-xs text-destructive space-y-0.5">
                      {review.issues.map((issue, ii) => <p key={ii}>❌ {issue}</p>)}
                    </div>
                  )}
                  {review && review.suggestions.length > 0 && (
                    <div className="text-xs text-amber-600 space-y-0.5">
                      {review.suggestions.map((s, si) => <p key={si}>💡 {s}</p>)}
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
              مراجعة بـ Gemini Pro
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={actionLoading === `reject-${draft.id}`}>
              <XCircle className="h-4 w-4 ml-2" />رفض
            </Button>
            <Button onClick={onPublish} disabled={actionLoading === `publish-${draft.id}`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {actionLoading === `publish-${draft.id}` ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              موافقة ونشر
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
