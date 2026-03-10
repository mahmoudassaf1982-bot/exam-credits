import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useExamTemplates } from '@/hooks/useExamTemplates';
import { useExamReadiness } from '@/hooks/useExamReadiness';
import { SessionCostDialog } from '@/components/SessionCostDialog';
import { PredictiveScoreCard } from '@/components/PredictiveScoreCard';
import type { ExamTemplate, SessionType } from '@/types';
import {
  BookOpen,
  Zap,
  Brain,
  BarChart3,
  Clock,
  HelpCircle,
  Coins,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function Exams() {
  const { user } = useAuth();
  const [selectedExam, setSelectedExam] = useState<ExamTemplate | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionType>('simulation');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);

  const { templates: userExams, loading: examsLoading } = useExamTemplates(user?.countryId);
  const { readiness: examReadiness } = useExamReadiness(userExams);

  const openSession = (exam: ExamTemplate, type: SessionType) => {
    setSelectedExam(exam);
    setSelectedSession(type);
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    toast.success(`تم بدء ${sessionLabels[selectedSession]} - ${selectedExam?.nameAr}`);
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h}س ${m}د`;
    if (h > 0) return `${h} ساعة`;
    return `${m} دقيقة`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">الاختبارات</h1>
        <p className="mt-1 text-muted-foreground">
          اختبارات {user?.countryName} المتاحة
        </p>
      </motion.div>

      {/* Exams grid */}
      {examsLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="grid gap-6 sm:grid-cols-2">
        {userExams.map((exam, i) => {
          const isExpanded = expandedExam === exam.id;
          const isReady = examReadiness[exam.id] !== false;
          return (
            <motion.div
              key={exam.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="rounded-2xl border bg-card shadow-card overflow-hidden hover:shadow-card-hover transition-all"
            >
              {/* Exam header */}
              <div className="gradient-primary p-5 text-primary-foreground">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80 font-mono" dir="ltr">
                      {exam.slug.toUpperCase()}
                    </p>
                    <h3 className="text-xl font-black mt-1">{exam.nameAr}</h3>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                    <BookOpen className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-80">
                  <span className="flex items-center gap-1">
                    <HelpCircle className="h-3.5 w-3.5" />
                    {exam.defaultQuestionCount} سؤال
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(exam.defaultTimeLimitSec)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {exam.sections.length} قسم
                  </span>
                </div>
              </div>

              {/* Sections preview */}
              {exam.sections.length > 0 && (
                <div className="border-b">
                  <button
                    onClick={() => setExpandedExam(isExpanded ? null : exam.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      أقسام الاختبار
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-2">
                          {exam.sections
                            .sort((a, b) => a.order - b.order)
                            .map((section) => (
                              <div
                                key={section.id}
                                className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2"
                              >
                                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                                  {section.order}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{section.nameAr}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{section.questionCount} سؤال</span>
                                    {section.timeLimitSec && (
                                      <span>· {formatTime(section.timeLimitSec)}</span>
                                    )}
                                  </div>
                                </div>
                                {section.difficultyMixJson && (
                                  <div className="hidden sm:flex items-center gap-1">
                                    <div
                                      className="h-1.5 rounded-full bg-success"
                                      style={{ width: `${section.difficultyMixJson.easy * 0.4}px` }}
                                    />
                                    <div
                                      className="h-1.5 rounded-full bg-gold"
                                      style={{ width: `${section.difficultyMixJson.medium * 0.4}px` }}
                                    />
                                    <div
                                      className="h-1.5 rounded-full bg-destructive"
                                      style={{ width: `${section.difficultyMixJson.hard * 0.4}px` }}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Predictive Score */}
              <div className="px-4 pt-4">
                <PredictiveScoreCard examTemplateId={exam.id} />
              </div>

              {/* Session types */}
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">أنواع الجلسات:</p>

                {/* Simulation */}
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">محاكاة رسمية</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-gold" />
                        {user?.isDiamond
                          ? 'مجاني (Diamond)'
                          : `${exam.simulationSessionCostPoints} نقطة`}
                      </p>
                    </div>
                  </div>
                  {isReady ? (
                    <Button
                      size="sm"
                      onClick={() => openSession(exam, 'simulation')}
                      className="gradient-primary text-primary-foreground text-xs"
                    >
                      ابدأ
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      <span>غير جاهز</span>
                    </div>
                  )}
                </div>

                {/* Practice */}
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">تدريب ذكي (AI)</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-gold" />
                        {user?.isDiamond
                          ? 'مجاني (Diamond)'
                          : `${exam.practiceSessionCostPoints} نقطة`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openSession(exam, 'practice')}
                    className="text-xs"
                  >
                    ابدأ
                  </Button>
                </div>

                {/* Adaptive Training (CAT) */}
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">تدريب تكيّفي (CAT)</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-gold" />
                        {user?.isDiamond
                          ? 'مجاني (Diamond)'
                          : `${exam.practiceSessionCostPoints} نقطة`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openSession(exam, 'adaptive_training')}
                    className="text-xs border-gold/30 text-gold hover:bg-gold/10"
                  >
                    ⚡ ابدأ
                  </Button>
                </div>

                {/* Analysis */}
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">تحليل النتيجة</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-gold" />
                        {user?.isDiamond
                          ? 'مجاني (Diamond)'
                          : `${exam.analysisCostPoints} نقطة`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openSession(exam, 'analysis')}
                    className="text-xs"
                  >
                    تحليل
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {userExams.length === 0 && (
          <div className="col-span-full rounded-2xl border bg-card p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-bold text-foreground">لا توجد اختبارات متاحة</p>
            <p className="text-sm text-muted-foreground mt-1">
              لا توجد اختبارات لدولتك حاليًا
            </p>
          </div>
        )}
      </div>
      )}

      <SessionCostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exam={selectedExam}
        sessionType={selectedSession}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

const sessionLabels: Record<SessionType, string> = {
  simulation: 'جلسة المحاكاة',
  practice: 'جلسة التدريب الذكي',
  analysis: 'تحليل النتيجة',
  adaptive_training: 'جلسة التدريب التكيّفي',
};
