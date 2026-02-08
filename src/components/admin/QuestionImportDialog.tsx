import { useState } from 'react';
import type { Question, QuestionOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface QuestionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: Question[]) => void;
}

interface ParsedPreview {
  valid: Question[];
  errors: string[];
}

const sampleJson = `[
  {
    "countryId": "sa",
    "topic": "أمراض القلب",
    "difficulty": "medium",
    "textAr": "نص السؤال هنا",
    "options": [
      { "textAr": "الخيار الأول" },
      { "textAr": "الخيار الثاني" },
      { "textAr": "الخيار الثالث" },
      { "textAr": "الخيار الرابع" }
    ],
    "correctIndex": 0,
    "explanation": "شرح الإجابة"
  }
]`;

export function QuestionImportDialog({ open, onOpenChange, onImport }: QuestionImportDialogProps) {
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);

  const handleParse = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setPreview({ valid: [], errors: ['يجب أن يكون المحتوى مصفوفة JSON (Array)'] });
        return;
      }

      const valid: Question[] = [];
      const errors: string[] = [];

      parsed.forEach((item: any, idx: number) => {
        const lineNum = idx + 1;

        if (!item.textAr || typeof item.textAr !== 'string') {
          errors.push(`سؤال #${lineNum}: نص السؤال مفقود`);
          return;
        }
        if (!item.topic || typeof item.topic !== 'string') {
          errors.push(`سؤال #${lineNum}: الموضوع مفقود`);
          return;
        }
        if (!Array.isArray(item.options) || item.options.length < 2) {
          errors.push(`سؤال #${lineNum}: يجب أن يحتوي على خيارين على الأقل`);
          return;
        }
        if (typeof item.correctIndex !== 'number' || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
          errors.push(`سؤال #${lineNum}: correctIndex غير صالح`);
          return;
        }

        const options: QuestionOption[] = item.options.map((opt: any, optIdx: number) => ({
          id: `imp-${Date.now()}-${idx}-${optIdx}`,
          textAr: opt.textAr || opt.text || `خيار ${optIdx + 1}`,
        }));

        valid.push({
          id: `q-imp-${Date.now()}-${idx}`,
          countryId: item.countryId || 'sa',
          examTemplateId: item.examTemplateId || undefined,
          sectionId: item.sectionId || undefined,
          topic: item.topic,
          difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium',
          textAr: item.textAr,
          options,
          correctOptionId: options[item.correctIndex].id,
          explanation: item.explanation || '',
          isApproved: false,
          createdAt: new Date().toISOString(),
        });
      });

      setPreview({ valid, errors });
    } catch {
      setPreview({ valid: [], errors: ['خطأ في صيغة JSON — تأكد من صحة التنسيق'] });
    }
  };

  const handleImport = () => {
    if (preview?.valid.length) {
      onImport(preview.valid);
      setJsonText('');
      setPreview(null);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setJsonText('');
      setPreview(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            استيراد أسئلة (JSON)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>ألصق محتوى JSON هنا</Label>
            <Textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setPreview(null); }}
              className="min-h-[200px] font-mono text-xs"
              dir="ltr"
              placeholder={sampleJson}
            />
          </div>

          {!preview && (
            <Button
              variant="outline"
              onClick={handleParse}
              disabled={!jsonText.trim()}
              className="w-full"
            >
              معاينة قبل الاستيراد
            </Button>
          )}

          {preview && (
            <div className="space-y-3">
              {preview.valid.length > 0 && (
                <div className="rounded-xl bg-success/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-success font-bold text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    {preview.valid.length} سؤال صالح للاستيراد
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {preview.valid.map((q, i) => (
                      <div key={i} className="rounded-lg bg-card p-3 text-sm border">
                        <p className="font-medium line-clamp-1">{q.textAr}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{q.topic}</span>
                          <span>·</span>
                          <span>{q.difficulty === 'easy' ? 'سهل' : q.difficulty === 'medium' ? 'متوسط' : 'صعب'}</span>
                          <span>·</span>
                          <span>{q.options.length} خيارات</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="rounded-xl bg-destructive/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {preview.errors.length} خطأ
                  </div>
                  <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                    {preview.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} className="flex-1">إلغاء</Button>
          <Button
            onClick={handleImport}
            className="flex-1 gradient-primary text-primary-foreground font-bold"
            disabled={!preview?.valid.length}
          >
            استيراد {preview?.valid.length ? `(${preview.valid.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
