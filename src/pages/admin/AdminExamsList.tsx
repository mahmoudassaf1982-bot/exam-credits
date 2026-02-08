import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mockExamTemplates } from '@/data/examTemplates';
import { countries } from '@/data/mock';
import type { ExamTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookOpen,
  Plus,
  ChevronLeft,
  Layers,
  Clock,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
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

export default function AdminExamsList() {
  const [templates, setTemplates] = useState<ExamTemplate[]>(mockExamTemplates);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    nameAr: '',
    slug: '',
    countryId: 'sa',
    descriptionAr: '',
  });

  const handleCreate = () => {
    if (!newTemplate.nameAr || !newTemplate.slug) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const template: ExamTemplate = {
      id: `tmpl-${Date.now()}`,
      countryId: newTemplate.countryId,
      slug: newTemplate.slug,
      nameAr: newTemplate.nameAr,
      descriptionAr: newTemplate.descriptionAr,
      isActive: true,
      defaultTimeLimitSec: 7200,
      defaultQuestionCount: 100,
      simulationSessionCostPoints: 10,
      practiceSessionCostPoints: 5,
      analysisCostPoints: 5,
      sections: [],
      createdAt: new Date().toISOString(),
    };

    setTemplates((prev) => [...prev, template]);
    setShowCreateDialog(false);
    setNewTemplate({ nameAr: '', slug: '', countryId: 'sa', descriptionAr: '' });
    toast.success('تم إنشاء الاختبار بنجاح');
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h} ساعة ${m} دقيقة`;
    if (h > 0) return `${h} ساعة`;
    return `${m} دقيقة`;
  };

  // Group by country
  const grouped = countries
    .map((c) => ({
      country: c,
      exams: templates.filter((t) => t.countryId === c.id),
    }))
    .filter((g) => g.exams.length > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Link
            to="/app/admin"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">هيكل الاختبارات</h1>
            <p className="mt-1 text-muted-foreground">إدارة الاختبارات والأقسام حسب الدولة</p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="gradient-primary text-primary-foreground font-bold gap-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">اختبار جديد</span>
        </Button>
      </motion.div>

      {/* Grouped by country */}
      {grouped.map(({ country, exams }) => (
        <motion.div
          key={country.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{country.flag}</span>
            <h2 className="text-lg font-bold">{country.nameAr}</h2>
            <span className="text-sm text-muted-foreground">({exams.length} اختبار)</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {exams.map((exam) => (
              <Link
                key={exam.id}
                to={`/app/admin/exams/${exam.id}`}
                className="group rounded-2xl border bg-card shadow-card hover:shadow-card-hover transition-all overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {exam.nameAr}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                          {exam.slug.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {exam.descriptionAr}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
                      <Layers className="h-3 w-3" />
                      {exam.sections.length} قسم
                    </span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
                      <HelpCircle className="h-3 w-3" />
                      {exam.defaultQuestionCount} سؤال
                    </span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(exam.defaultTimeLimitSec)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        exam.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {exam.isActive ? 'مفعّل' : 'معطّل'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      ))}

      {templates.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-lg font-bold">لا توجد اختبارات</p>
          <p className="text-sm text-muted-foreground mt-1">ابدأ بإنشاء اختبار جديد</p>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إنشاء اختبار جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select
                value={newTemplate.countryId}
                onValueChange={(v) => setNewTemplate({ ...newTemplate, countryId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag} {c.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم الاختبار (عربي)</Label>
              <Input
                value={newTemplate.nameAr}
                onChange={(e) => setNewTemplate({ ...newTemplate, nameAr: e.target.value })}
                placeholder="مثال: الرخصة الطبية السعودية"
              />
            </div>
            <div className="space-y-2">
              <Label>المعرّف (Slug)</Label>
              <Input
                value={newTemplate.slug}
                onChange={(e) => setNewTemplate({ ...newTemplate, slug: e.target.value })}
                placeholder="مثال: smle"
                dir="ltr"
                className="text-left font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={newTemplate.descriptionAr}
                onChange={(e) => setNewTemplate({ ...newTemplate, descriptionAr: e.target.value })}
                placeholder="وصف مختصر للاختبار"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="flex-1">
              إلغاء
            </Button>
            <Button onClick={handleCreate} className="flex-1 gradient-primary text-primary-foreground font-bold">
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
