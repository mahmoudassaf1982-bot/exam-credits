import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Question, QuestionDifficulty, QuestionOption, Country, ExamTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExamTemplates } from '@/hooks/useExamTemplates';

interface QuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Question | null;
  onSave: (question: Question) => void;
}

const emptyForm = (): Partial<Question> => ({
  countryId: '',
  examTemplateId: '',
  sectionId: '',
  topic: '',
  difficulty: 'medium',
  textAr: '',
  options: [
    { id: `opt-${Date.now()}-a`, textAr: '' },
    { id: `opt-${Date.now()}-b`, textAr: '' },
    { id: `opt-${Date.now()}-c`, textAr: '' },
    { id: `opt-${Date.now()}-d`, textAr: '' },
  ],
  correctOptionId: '',
  explanation: '',
  isApproved: false,
});

export function QuestionFormDialog({ open, onOpenChange, question, onSave }: QuestionFormDialogProps) {
  const [form, setForm] = useState<Partial<Question>>(() =>
    question ? { ...question } : emptyForm()
  );
  const [countries, setCountries] = useState<Country[]>([]);

  // Fetch countries from DB
  useEffect(() => {
    const fetchCountries = async () => {
      const { data } = await supabase.from('countries').select('*').order('name_ar');
      if (data) {
        setCountries(data.map(c => ({
          id: c.id,
          name: c.name,
          nameAr: c.name_ar,
          flag: c.flag,
          currency: c.currency,
          isActive: c.is_active,
        })));
      }
    };
    fetchCountries();
  }, []);

  // Fetch exam templates for the selected country
  const { templates: examsForCountry } = useExamTemplates(form.countryId || undefined);
  const selectedExam = examsForCountry.find((t) => t.id === form.examTemplateId);

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setForm(question ? { ...question } : emptyForm());
    }
    onOpenChange(isOpen);
  };

  const updateOption = (idx: number, textAr: string) => {
    const opts = [...(form.options || [])];
    opts[idx] = { ...opts[idx], textAr };
    setForm({ ...form, options: opts });
  };

  const handleSave = () => {
    if (!form.textAr || !form.topic || !form.correctOptionId) {
      return;
    }

    const result: Question = {
      ...(form as Question),
      id: question?.id || `q-${Date.now()}`,
      createdAt: question?.createdAt || new Date().toISOString(),
    };
    onSave(result);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{question ? 'تعديل السؤال' : 'إضافة سؤال جديد'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select value={form.countryId} onValueChange={(v) => setForm({ ...form, countryId: v, examTemplateId: '', sectionId: '' })}>
                <SelectTrigger><SelectValue placeholder="اختر الدولة" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.flag} {c.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الاختبار</Label>
              <Select value={form.examTemplateId || 'none'} onValueChange={(v) => setForm({ ...form, examTemplateId: v === 'none' ? '' : v, sectionId: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— عام —</SelectItem>
                  {examsForCountry.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>القسم</Label>
              <Select value={form.sectionId || 'none'} onValueChange={(v) => setForm({ ...form, sectionId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— عام —</SelectItem>
                  {(selectedExam?.sections || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الموضوع</Label>
              <Input value={form.topic || ''} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="مثال: أمراض القلب" />
            </div>
            <div className="space-y-2">
              <Label>الصعوبة</Label>
              <Select value={form.difficulty || 'medium'} onValueChange={(v) => setForm({ ...form, difficulty: v as QuestionDifficulty })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">سهل</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="hard">صعب</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>نص السؤال</Label>
            <Textarea value={form.textAr || ''} onChange={(e) => setForm({ ...form, textAr: e.target.value })} className="min-h-[80px]" placeholder="اكتب نص السؤال هنا..." />
          </div>

          <div className="space-y-3">
            <Label>الخيارات (اضغط لتحديد الإجابة الصحيحة)</Label>
            {(form.options || []).map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, correctOptionId: opt.id })}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold flex-shrink-0 transition-all ${
                    form.correctOptionId === opt.id
                      ? 'bg-success text-success-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {String.fromCharCode(65 + idx)}
                </button>
                <Input
                  value={opt.textAr}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`الخيار ${String.fromCharCode(65 + idx)}`}
                  className="flex-1"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>الشرح (اختياري)</Label>
            <Textarea value={form.explanation || ''} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="شرح الإجابة الصحيحة..." className="min-h-[60px]" />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <Label className="cursor-pointer">سؤال معتمد</Label>
            <Switch checked={form.isApproved ?? false} onCheckedChange={(v) => setForm({ ...form, isApproved: v })} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">إلغاء</Button>
          <Button
            onClick={handleSave}
            className="flex-1 gradient-primary text-primary-foreground font-bold"
            disabled={!form.textAr || !form.topic || !form.correctOptionId}
          >
            {question ? 'تحديث' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}