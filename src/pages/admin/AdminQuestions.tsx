import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Plus, Pencil, Trash2, Check, Search, Upload } from 'lucide-react';
import { mockQuestions as initialQuestions } from '@/data/examTemplates';
import { mockExamTemplates } from '@/data/examTemplates';
import { countries } from '@/data/mock';
import type { Question, QuestionDifficulty } from '@/types';
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
import { QuestionFormDialog } from '@/components/admin/QuestionFormDialog';
import { QuestionImportDialog } from '@/components/admin/QuestionImportDialog';

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

export default function AdminQuestions() {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterExam, setFilterExam] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterApproved, setFilterApproved] = useState<string>('all');

  const examsForFilter = useMemo(() => {
    if (filterCountry === 'all') return mockExamTemplates;
    return mockExamTemplates.filter((t) => t.countryId === filterCountry);
  }, [filterCountry]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterCountry !== 'all' && q.countryId !== filterCountry) return false;
      if (filterExam !== 'all' && q.examTemplateId !== filterExam) return false;
      if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
      if (filterApproved === 'approved' && !q.isApproved) return false;
      if (filterApproved === 'pending' && q.isApproved) return false;
      if (searchQuery && !q.textAr.includes(searchQuery) && !q.topic.includes(searchQuery)) return false;
      return true;
    });
  }, [questions, filterCountry, filterExam, filterDifficulty, filterApproved, searchQuery]);

  const openCreate = () => {
    setEditingQuestion(null);
    setShowFormDialog(true);
  };

  const openEdit = (q: Question) => {
    setEditingQuestion(q);
    setShowFormDialog(true);
  };

  const handleSaveQuestion = (question: Question) => {
    if (editingQuestion) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestion.id ? question : q))
      );
      toast.success('تم تحديث السؤال');
    } else {
      setQuestions((prev) => [...prev, question]);
      toast.success('تم إضافة السؤال');
    }
    setShowFormDialog(false);
    setEditingQuestion(null);
  };

  const handleImport = (imported: Question[]) => {
    setQuestions((prev) => [...prev, ...imported]);
    toast.success(`تم استيراد ${imported.length} سؤال بنجاح`);
    setShowImportDialog(false);
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

  const approvedCount = questions.filter((q) => q.isApproved).length;
  const pendingCount = questions.length - approvedCount;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">بنك الأسئلة</h1>
          <p className="mt-1 text-muted-foreground">
            {questions.length} سؤال · {approvedCount} معتمد · {pendingCount} قيد المراجعة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">استيراد</span>
          </Button>
          <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">سؤال جديد</span>
          </Button>
        </div>
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
              placeholder="بحث في الأسئلة أو الموضوع..."
              className="pr-9"
            />
          </div>
          <Select value={filterCountry} onValueChange={(v) => { setFilterCountry(v); setFilterExam('all'); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="الدولة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الدول</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.flag} {c.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterExam} onValueChange={setFilterExam}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="الاختبار" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الاختبارات</SelectItem>
              {examsForFilter.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nameAr}</SelectItem>
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
            const examObj = mockExamTemplates.find((t) => t.id === q.examTemplateId);
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
                        {examObj && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{examObj.slug.toUpperCase()}</Badge>
                        )}
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

      {/* Question Form Dialog */}
      <QuestionFormDialog
        open={showFormDialog}
        onOpenChange={(open) => { setShowFormDialog(open); if (!open) setEditingQuestion(null); }}
        question={editingQuestion}
        onSave={handleSaveQuestion}
      />

      {/* Import Dialog */}
      <QuestionImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف السؤال</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا السؤال؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
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
