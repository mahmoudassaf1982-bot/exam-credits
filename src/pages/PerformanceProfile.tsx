import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Loader2, BarChart3, Wifi, WifiOff } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePerformanceRealtime } from '@/hooks/usePerformanceRealtime';
import OverviewSummary from '@/components/performance/OverviewSummary';
import PredictedScoreOverview from '@/components/performance/PredictedScoreOverview';
import LearningDNACard from '@/components/LearningDNACard';
import SkillMapCard from '@/components/SkillMapCard';
import RecommendedTrainingCard from '@/components/RecommendedTrainingCard';
import TrainingHistoryList from '@/components/performance/TrainingHistoryList';

export default function PerformanceProfile() {
  const { user } = useAuth();
  const { dna, memory, recommendations, sessions, loading, realtimeConnected } = usePerformanceRealtime(user?.id);

  // Extract unique exam template IDs from sessions
  const examTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    sessions.forEach(s => {
      if ((s as any).exam_template_id) ids.add((s as any).exam_template_id);
    });
    return Array.from(ids);
  }, [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const hasData = sessions.length > 0 || dna || memory;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black">ملف الأداء الشامل</h1>
        <div className="rounded-2xl border bg-card p-12 text-center">
          <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-bold mb-2">لا توجد بيانات بعد</h2>
          <p className="text-muted-foreground">أكمل اختباراً واحداً على الأقل لرؤية تحليل أدائك</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">ملف الأداء الشامل</h1>
        <p className="mt-1 text-muted-foreground">نظرة موحّدة على بصمة التعلم، خريطة المهارات، التوصيات، وتاريخ التدريب</p>
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          {realtimeConnected ? (
            <span className="flex items-center gap-1 text-success">
              <Wifi className="h-3 w-3" />
              يتحدث تلقائياً
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              تحديث تلقائي غير متاح
            </span>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="prediction">الدرجة المتوقعة</TabsTrigger>
          <TabsTrigger value="dna">بصمة التعلم (DNA)</TabsTrigger>
          <TabsTrigger value="skills">خريطة المهارات</TabsTrigger>
          <TabsTrigger value="recommendations">التوصيات</TabsTrigger>
          <TabsTrigger value="history">سجل التدريبات</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewSummary dna={dna} memory={memory} sessions={sessions} />
        </TabsContent>

        <TabsContent value="prediction">
          {examTemplateIds.length > 0 ? (
            <PredictedScoreOverview examTemplateIds={examTemplateIds} />
          ) : (
            <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
              أكمل اختباراً واحداً على الأقل لرؤية الدرجة المتوقعة
            </div>
          )}
        </TabsContent>

        <TabsContent value="dna">
          <LearningDNACard studentId={user?.id} />
        </TabsContent>

        <TabsContent value="skills">
          {memory ? (
            <SkillMapCard profile={memory} />
          ) : (
            <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
              لا توجد بيانات مهارات بعد. أكمل المزيد من الاختبارات.
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations">
          <RecommendedTrainingCard recommendations={recommendations} loading={false} />
          {recommendations.length === 0 && (
            <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
              لا توجد توصيات حالياً. أكمل اختباراً لتحصل على توصيات مخصصة.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <TrainingHistoryList sessions={sessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
