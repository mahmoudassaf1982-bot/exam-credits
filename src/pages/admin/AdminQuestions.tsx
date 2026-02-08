import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Plus, Pencil, Trash2, Check, Search, Filter } from 'lucide-react';
import { mockQuestions as initialQuestions } from '@/data/examTemplates';
import { mockExamTemplates } from '@/data/examTemplates';
import { countries } from '@/data/mock';
import type { Question, QuestionDifficulty, QuestionOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const difficultyLabels: Record<QuestionDifficulty, string> = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
};

const difficultyColors: Record<QuestionDifficulty, string> = {
  easy: 'bg-success/10 text-success',
  medium: 'bg-gold/10 text-gold-foreground',
  hard: 'bg-destructive/10 text-destructive',
};

const emptyQuestion = (): Partial<Question> => ({
  countryId: 'sa',
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

export default function AdminQuestions() {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [showDialog, setShowDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Question>>(emptyQuestion());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterApproved, setFilterApproved] = useState<string>('all');

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterCountry !== 'all' && q.countryId !== filterCountry) return false;
      if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
      if (filterApproved === 'approved' && !q.isApproved) return false;
      if (filterApproved === 'pending' && q.isApproved) return false;
      if (searchQuery && !q.textAr.includes(searchQuery) && !q.topic.includes(searchQuery)) return false;
      return true;
    });
  }, [questions, filterCountry, filterDifficulty, filterApproved, searchQuery]);

  const openCreate = () => {
    setEditingQuestion(null);
    setForm(emptyQuestion());
    setShowDialog(true);
  };

  const openEdit = (q: Question) => {
    setEditingQuestion(q);
    setForm({ ...q });
    setShowDialog(true);
  };

  const updateOption = (idx: number, textAr: string) => {
    const opts = [...(form.options || [])];
    opts[idx] = { ...opts[idx], textAr };
    setForm({ ...form, options: opts });
  };

  const handleSave = () => {
    if (!form.textAr || !form.topic || !form.correctOptionId) {
      toast.error('يرجى ملء جميع الحقول المطلوبة واختيار الإجابة الصحيحة');
      return;
    }

    if (editingQuestion) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...form } as Question : q))
      );
      toast.success('تم تحديث السؤال');
    } else {
      const newQ: Question = {
        ...(form as Question),
        id: `q-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setQuestions((prev) => [...prev, newQ]);
      toast.success('تم إضافة السؤال');
    }
    setShowDialog(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setQuestions((prev) => prev.filter((q) => q.id !== deleteId));
      toast.success('تم حذف السؤال');
      setDeleteId(null);
    }
  };

  const toggleApproved = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isApproved: !q.isApproved } : q))
    );
  };

  const examsForCountry = mockExamTemplates.filter((t) => t.countryId === (form.countryId || 'sa'));
  const selectedExam = mockExamTemplates.find((t) => t.id === form.examTemplateId);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">بنك الأسئلة</h1>
          <p className="mt-1 text-muted-foreground">{questions.length} سؤال · {questions.filter((q) => q.isApproved).length} معتمد</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">سؤال جديد</span>
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl border bg-card p-4 shadow-card"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الأسئلة..."
              className="pr-9"
            />
          </div>
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="الدولة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الدول</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.flag} {c.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="الصعوبة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="easy">سهل</SelectItem>
              <SelectItem value="medium">متوسط</SelectItem>
              <SelectItem value="hard">صعب</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterApproved} onValueChange={setFilterApproved}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="approved">معتمد</SelectItem>
              <SelectItem value="pending">قيد المراجعة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Questions list */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-12 text-center">
            <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-bold">لا توجد أسئلة</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery || filterCountry !== 'all' ? 'جرّب تعديل الفلاتر' : 'ابدأ بإضافة سؤال جديد'}
            </p>
          </div>
        ) : (
          filtered.map((q, i) => {
            const countryObj = countries.find((c) => c.id === q.countryId);
            return (
              <div key={q.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-relaxed line-clamp-2">
                        {q.textAr}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs">{countryObj?.flag}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{q.topic}</Badge>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${difficultyColors[q.difficulty]}`}>
                          {difficultyLabels[q.difficulty]}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${q.isApproved ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                          {q.isApproved ? 'معتمد' : 'قيد المراجعة'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleApproved(q.id)} title={q.isApproved ? 'إلغاء الاعتماد' : 'اعتماد'}>
                        <Check className={`h-3.5 w-3.5 ${q.isApproved ? 'text-success' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(q)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </motion.div>

      {/* Create/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingQuestion ? 'تعديل السؤال' : 'إضافة سؤال جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>الدولة</Label>
                <Select value={form.countryId} onValueChange={(v) => setForm({ ...form, countryId: v, examTemplateId: '', sectionId: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">
              {editingQuestion ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف السؤال</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا السؤال؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
