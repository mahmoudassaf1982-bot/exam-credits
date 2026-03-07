import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Globe, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ProposedSection {
  name_ar: string;
  question_count: number;
  time_limit_sec: number | null;
  order: number;
  difficulty_mix_json: any;
  topic_filter_json: any;
}

export interface SourceEvidence {
  url: string;
  title: string;
  snippet: string;
  relevance_score: number;
}

export interface StoredStandards {
  total_questions: number;
  total_time_sec: number;
  sections: { name_ar: string; question_count: number; time_limit_sec: number | null }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposals: ProposedSection[];
  examName: string;
  onSave: (sections: ProposedSection[]) => Promise<void>;
  tavilyUsed?: boolean;
  sources?: SourceEvidence[];
  storedStandards?: StoredStandards | null;
}

export default function AiSyncReviewDialog({ open, onOpenChange, proposals, examName, onSave, tavilyUsed, sources, storedStandards }: Props) {
  const [sections, setSections] = useState<ProposedSection[]>(proposals);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    console.log('[AiSyncReviewDialog] Received proposals:', proposals);
    setSections(proposals);
  }, [proposals]);

  const totalQuestions = useMemo(() => sections.reduce((s, sec) => s + sec.question_count, 0), [sections]);
  const totalTimeSec = useMemo(() => sections.reduce((s, sec) => s + (sec.time_limit_sec || 0), 0), [sections]);
  const totalTimeMin = Math.round(totalTimeSec / 60);

  const hasStoredStandards = storedStandards && storedStandards.sections.length > 0;
  const questionsConflict = hasStoredStandards && storedStandards.total_questions !== totalQuestions;
  const timeConflict = hasStoredStandards && storedStandards.total_time_sec !== totalTimeSec;

  const updateSection = (idx: number, field: string, value: any) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const removeSection = (idx: number) => {
    if (sections.length <= 1) {
      toast.error('يجب أن يحتوي الاختبار على قسم واحد على الأقل');
      return;
    }
    setSections(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const addSection = () => {
    setSections(prev => [...prev, {
      name_ar: 'قسم جديد',
      question_count: 20,
      time_limit_sec: 1200,
      order: prev.length + 1,
      difficulty_mix_json: { easy: 30, medium: 50, hard: 20 },
      topic_filter_json: [],
    }]);
  };

  const handleSave = async () => {
    if (sections.length === 0) {
      toast.error('يجب إضافة قسم واحد على الأقل');
      return;
    }
    if (sections.some(s => !s.name_ar.trim())) {
      toast.error('يجب تسمية جميع الأقسام');
      return;
    }
    setSaving(true);
    try {
      await onSave(sections);
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.round(sec / 60);
    return `${m} دقيقة`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto w-[calc(100%-1rem)] sm:w-full mx-auto">
        <DialogHeader>
          <DialogTitle className="text-right text-lg">
            مراجعة معايير: {examName}
          </DialogTitle>
        </DialogHeader>

        {/* Research method badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {tavilyUsed ? (
            <Badge variant="default" className="gap-1.5 text-xs px-2.5 py-1 bg-green-600">
              <Globe className="h-3 w-3" />
              بحث ويب حقيقي (Tavily)
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 text-xs px-2.5 py-1">
              <Info className="h-3 w-3" />
              معرفة النموذج الداخلية فقط
            </Badge>
          )}
        </div>

        {/* Conflict warnings */}
        {hasStoredStandards && (questionsConflict || timeConflict) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              تعارض مع المعايير المخزنة الحالية
            </p>
            {questionsConflict && (
              <p className="text-xs text-amber-600 dark:text-amber-300">
                الأسئلة: المخزن = <strong>{storedStandards.total_questions}</strong> | المقترح = <strong>{totalQuestions}</strong>
              </p>
            )}
            {timeConflict && (
              <p className="text-xs text-amber-600 dark:text-amber-300">
                المدة: المخزن = <strong>{Math.round(storedStandards.total_time_sec / 60)} دقيقة</strong> | المقترح = <strong>{totalTimeMin} دقيقة</strong>
              </p>
            )}
            <p className="text-[10px] text-amber-500">
              سيتم تحديث المعايير المخزنة فقط عند الضغط على "حفظ"
            </p>
          </div>
        )}

        {/* Summary badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1">
            الأقسام: {sections.length}
          </Badge>
          <Badge variant={totalQuestions > 0 ? 'default' : 'destructive'} className="gap-1.5 text-sm px-3 py-1">
            الأسئلة: {totalQuestions}
          </Badge>
          <Badge variant={totalTimeSec > 0 ? 'default' : 'destructive'} className="gap-1.5 text-sm px-3 py-1">
            المدة: {totalTimeMin} دقيقة
          </Badge>
          {totalTimeSec > 0 && (
            totalTimeSec === 3600 ? (
              <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />60 دقيقة ✓</span>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />المدة ≠ 60 دقيقة</span>
            )
          )}
        </div>

        {/* Sources section */}
        {sources && sources.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">المصادر المستخدمة:</p>
            <div className="space-y-1">
              {sources.map((src, i) => (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/40 border cursor-default">
                        <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{src.title || 'مصدر'}</p>
                          {src.url && (
                            <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block text-[10px]">
                              {src.url}
                            </a>
                          )}
                        </div>
                        {src.relevance_score > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {Math.round(src.relevance_score * 100)}%
                          </Badge>
                        )}
                      </div>
                    </TooltipTrigger>
                    {src.snippet && (
                      <TooltipContent side="bottom" className="max-w-sm text-right" dir="rtl">
                        <p className="text-xs">{src.snippet}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}

        {/* Sections list */}
        <div className="space-y-3 mt-2">
          {sections.map((sec, idx) => (
            <div key={idx} className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                  <Input
                    value={sec.name_ar}
                    onChange={(e) => updateSection(idx, 'name_ar', e.target.value)}
                    className="font-bold h-9 flex-1"
                    placeholder="اسم القسم"
                  />
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeSection(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">عدد الأسئلة</Label>
                  <Input
                    type="number"
                    value={sec.question_count}
                    onChange={(e) => updateSection(idx, 'question_count', Math.max(1, Number(e.target.value)))}
                    className="h-8 text-center"
                    dir="ltr"
                    min={1}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المدة (ثانية)</Label>
                  <Input
                    type="number"
                    value={sec.time_limit_sec || ''}
                    onChange={(e) => updateSection(idx, 'time_limit_sec', e.target.value ? Number(e.target.value) : null)}
                    className="h-8 text-center"
                    dir="ltr"
                  />
                  {sec.time_limit_sec && (
                    <p className="text-[10px] text-muted-foreground text-center">{formatTime(sec.time_limit_sec)}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addSection} className="gap-1.5 text-xs w-full mt-1">
          <Plus className="h-3.5 w-3.5" />إضافة قسم
        </Button>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground font-bold gap-2 w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الأقسام ({sections.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
