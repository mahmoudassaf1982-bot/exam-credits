import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { mockExams } from '@/data/mock';
import { SessionCostDialog } from '@/components/SessionCostDialog';
import type { ExamCatalog, SessionType } from '@/types';
import { BookOpen, Brain, BarChart3, Clock, HelpCircle, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Exams() {
  const { user } = useAuth();
  const [selectedExam, setSelectedExam] = useState<ExamCatalog | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionType>('simulation');
  const [dialogOpen, setDialogOpen] = useState(false);

  const userExams = mockExams.filter((e) => e.countryId === user?.countryId);

  const openSession = (exam: ExamCatalog, type: SessionType) => {
    setSelectedExam(exam);
    setSelectedSession(type);
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    toast.success(`تم بدء ${sessionLabels[selectedSession]} - ${selectedExam?.nameAr}`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">الاختبارات</h1>
        <p className="mt-1 text-muted-foreground">
          اختبارات {user?.countryName} المتاحة
        </p>
      </motion.div>

      {/* Exams grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        {userExams.map((exam, i) => (
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
                  <p className="text-sm opacity-80 font-mono" dir="ltr">{exam.name}</p>
                  <h3 className="text-xl font-black mt-1">{exam.nameAr}</h3>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                  <BookOpen className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm opacity-80">
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5" />
                  {exam.questionsCount} سؤال
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {exam.durationMinutes} دقيقة
                </span>
              </div>
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
                      {user?.isDiamond ? 'مجاني (Diamond)' : `${exam.simulationSessionCostPoints} نقطة`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => openSession(exam, 'simulation')}
                  className="gradient-primary text-primary-foreground text-xs"
                >
                  ابدأ
                </Button>
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
                      {user?.isDiamond ? 'مجاني (Diamond)' : `${exam.practiceSessionCostPoints} نقطة`}
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
                      {user?.isDiamond ? 'مجاني (Diamond)' : `${exam.analysisCostPoints} نقطة`}
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
        ))}

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
};
