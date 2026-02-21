import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ProposedSection {
  name_ar: string;
  question_count: number;
  time_limit_sec: number | null;
  order: number;
  difficulty_mix_json: any;
  topic_filter_json: any;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposals: ProposedSection[];
  examName: string;
  onSave: (sections: ProposedSection[]) => Promise<void>;
}

export default function AiSyncReviewDialog({ open, onOpenChange, proposals, examName, onSave }: Props) {
  const [sections, setSections] = useState<ProposedSection[]>(proposals);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    console.log('[AiSyncReviewDialog] Received proposals:', proposals);
    setSections(proposals);
  }, [proposals]);

  const totalQuestions = useMemo(() => sections.reduce((s, sec) => s + sec.question_count, 0), [sections]);
  const totalTimeSec = useMemo(() => sections.reduce((s, sec) => s + (sec.time_limit_sec || 0), 0), [sections]);
  const totalTimeMin = Math.round(totalTimeSec / 60);

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
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right text-lg">
            مراجعة معايير: {examName}
          </DialogTitle>
        </DialogHeader>

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
              <div className="grid grid-cols-2 gap-3">
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

        <DialogFooter className="gap-2 sm:gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground font-bold gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الأقسام ({sections.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
