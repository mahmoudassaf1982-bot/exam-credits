import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockExamTemplates, getTopicsForCountry } from '@/data/examTemplates';
import type { ExamTemplate, ExamSection } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowRight,
  Save,
  Plus,
  Coins,
  Clock,
  HelpCircle,
  Layers,
  BookOpen,
} from 'lucide-react';
import { ExamSectionCard } from '@/components/admin/ExamSectionCard';
import { Textarea } from '@/components/ui/textarea';

export default function AdminExamDetail() {
  const { id } = useParams<{ id: string }>();
  const initial = mockExamTemplates.find((t) => t.id === id);

  const [template, setTemplate] = useState<ExamTemplate | null>(initial ?? null);

  const allTopics = useMemo(
    () => (template ? getTopicsForCountry(template.countryId) : []),
    [template?.countryId]
  );

  if (!template) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-lg font-bold">لم يتم العثور على الاختبار</p>
        <Link
          to="/app/admin/exams"
          className="mt-4 inline-flex items-center gap-2 text-primary hover:underline text-sm"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  const updateTemplate = (partial: Partial<ExamTemplate>) => {
    setTemplate((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const updateSection = (sectionId: string, updated: ExamSection) => {
    setTemplate((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s) => (s.id === sectionId ? updated : s)),
          }
        : prev
    );
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    setTemplate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= sections.length) return prev;

      // Swap
      [sections[index], sections[targetIdx]] = [sections[targetIdx], sections[index]];
      // Update order
      const reordered = sections.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, sections: reordered };
    });
  };

  const deleteSection = (sectionId: string) => {
    setTemplate((prev) => {
      if (!prev) return prev;
      const sections = prev.sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, sections };
    });
  };

  const addSection = () => {
    const newSection: ExamSection = {
      id: `sec-${Date.now()}`,
      examTemplateId: template.id,
      order: template.sections.length + 1,
      nameAr: 'قسم جديد',
      timeLimitSec: null,
      questionCount: 20,
      topicFilterJson: null,
      difficultyMixJson: { easy: 30, medium: 50, hard: 20 },
      scoringRuleJson: null,
      createdAt: new Date().toISOString(),
    };
    updateTemplate({ sections: [...template.sections, newSection] });
  };

  const handleSave = () => {
    toast.success('تم حفظ التغييرات بنجاح');
  };

  const totalQuestions = template.sections.reduce((sum, s) => sum + s.questionCount, 0);
  const totalTimeSec = template.sections.reduce((sum, s) => sum + (s.timeLimitSec ?? 0), 0);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h} ساعة ${m} دقيقة`;
    if (h > 0) return `${h} ساعة`;
    return `${m} دقيقة`;
  };

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
            to="/app/admin/exams"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">{template.nameAr}</h1>
            <p className="text-sm text-muted-foreground font-mono" dir="ltr">
              {template.slug.toUpperCase()}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          className="gradient-primary text-primary-foreground font-bold gap-2"
        >
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">حفظ</span>
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main info - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4"
          >
            <h2 className="font-bold text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              معلومات الاختبار
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>اسم الاختبار (عربي)</Label>
                <Input
                  value={template.nameAr}
                  onChange={(e) => updateTemplate({ nameAr: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>المعرّف (Slug)</Label>
                <Input
                  value={template.slug}
                  onChange={(e) => updateTemplate({ slug: e.target.value })}
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                value={template.descriptionAr}
                onChange={(e) => updateTemplate({ descriptionAr: e.target.value })}
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
              <Label className="cursor-pointer">الاختبار مفعّل</Label>
              <Switch
                checked={template.isActive}
                onCheckedChange={(v) => updateTemplate({ isActive: v })}
              />
            </div>
          </motion.div>

          {/* Default settings */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4"
          >
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-info" />
              الإعدادات الافتراضية
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>عدد الأسئلة الافتراضي</Label>
                <Input
                  type="number"
                  value={template.defaultQuestionCount}
                  onChange={(e) => updateTemplate({ defaultQuestionCount: Number(e.target.value) })}
                  min={1}
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <div className="space-y-2">
                <Label>الزمن الافتراضي (بالثواني)</Label>
                <Input
                  type="number"
                  value={template.defaultTimeLimitSec}
                  onChange={(e) => updateTemplate({ defaultTimeLimitSec: Number(e.target.value) })}
                  min={60}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">
                  = {formatTime(template.defaultTimeLimitSec)}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Sections */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-gold" />
                الأقسام ({template.sections.length})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={addSection}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة قسم
              </Button>
            </div>

            {template.sections.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center">
                <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">لا توجد أقسام</p>
                <p className="text-sm text-muted-foreground mt-1">أضف أقسام لتحديد هيكل الاختبار</p>
              </div>
            ) : (
              <div className="space-y-3">
                {template.sections
                  .sort((a, b) => a.order - b.order)
                  .map((section, idx) => (
                    <ExamSectionCard
                      key={section.id}
                      section={section}
                      index={idx}
                      totalSections={template.sections.length}
                      allTopics={allTopics}
                      onUpdate={(updated) => updateSection(section.id, updated)}
                      onMoveUp={() => moveSection(idx, 'up')}
                      onMoveDown={() => moveSection(idx, 'down')}
                      onDelete={() => deleteSection(section.id)}
                    />
                  ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar - costs + stats */}
        <div className="space-y-6">
          {/* Costs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-4"
          >
            <h2 className="font-bold flex items-center gap-2">
              <Coins className="h-5 w-5 text-gold" />
              تكاليف النقاط
            </h2>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">جلسة المحاكاة</Label>
                <Input
                  type="number"
                  value={template.simulationSessionCostPoints}
                  onChange={(e) =>
                    updateTemplate({ simulationSessionCostPoints: Number(e.target.value) })
                  }
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">جلسة التدريب</Label>
                <Input
                  type="number"
                  value={template.practiceSessionCostPoints}
                  onChange={(e) =>
                    updateTemplate({ practiceSessionCostPoints: Number(e.target.value) })
                  }
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">التحليل</Label>
                <Input
                  type="number"
                  value={template.analysisCostPoints}
                  onChange={(e) => updateTemplate({ analysisCostPoints: Number(e.target.value) })}
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
              </div>
            </div>
          </motion.div>

          {/* Summary stats */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border bg-card p-5 shadow-card space-y-3"
          >
            <h2 className="font-bold text-sm">ملخص الأقسام</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  عدد الأقسام
                </span>
                <span className="font-bold">{template.sections.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5" />
                  إجمالي الأسئلة
                </span>
                <span className="font-bold">{totalQuestions}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  إجمالي الزمن
                </span>
                <span className="font-bold">{totalTimeSec > 0 ? formatTime(totalTimeSec) : '—'}</span>
              </div>
            </div>

            {totalQuestions !== template.defaultQuestionCount && template.sections.length > 0 && (
              <p className="text-xs text-gold bg-gold-muted rounded-lg p-2">
                ⚠ إجمالي أسئلة الأقسام ({totalQuestions}) يختلف عن العدد الافتراضي (
                {template.defaultQuestionCount})
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
