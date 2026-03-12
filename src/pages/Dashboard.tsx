import { Coins, BookOpen, UserPlus, TrendingUp, ArrowLeft, Sparkles, Loader2, Shield, Trophy, Target, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/StatsCard';
import { reasonLabels } from '@/data/constants';
import { useExamTemplates } from '@/hooks/useExamTemplates';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PointsTransaction } from '@/types';
import { Progress } from '@/components/ui/progress';
import SkillMapCard from '@/components/SkillMapCard';
import RecommendedTrainingCard from '@/components/RecommendedTrainingCard';
import LearningDNACard from '@/components/LearningDNACard';
import SmartInsightHeader from '@/components/SmartInsightHeader';
import ProgressJourney from '@/components/ProgressJourney';
import QuickAIActions from '@/components/QuickAIActions';
import { getStudentMemory } from '@/services/studentMemory';
import { useTrainingRecommendationsRealtime } from '@/hooks/useTrainingRecommendationsRealtime';
import type { LearningDNA } from '@/services/learningDNAEngine';
import { SarisCoachController } from '@/components/SarisCoach';

interface ExamStats {
  totalSessions: number;
  completedSessions: number;
  passedSessions: number;
  avgPercentage: number;
  recentSessions: {
    id: string;
    examName: string;
    percentage: number;
    passed: boolean;
    completedAt: string;
  }[];
}

export default function Dashboard() {
  const { user, wallet } = useAuth();
  const navigate = useNavigate();
  const [recentTx, setRecentTx] = useState<PointsTransaction[]>([]);
  const [txStats, setTxStats] = useState({ debitCount: 0 });
  const [examStats, setExamStats] = useState<ExamStats>({ totalSessions: 0, completedSessions: 0, passedSessions: 0, avgPercentage: 0, recentSessions: [] });
  const [memoryProfile, setMemoryProfile] = useState<{ strength_map: Record<string, number>; weakness_map: Record<string, number>; speed_profile: string; accuracy_profile: number } | null>(null);
  const [dna, setDna] = useState<LearningDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const { recommendations, loading: recsLoading } = useTrainingRecommendationsRealtime(user?.id);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [txRes, sessRes, dnaRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('exam_sessions').select('id, status, score_json, exam_snapshot, completed_at').order('started_at', { ascending: false }).limit(100),
        supabase.from('student_learning_dna' as any).select('*').eq('student_id', user.id).maybeSingle(),
      ]);

      if (txRes.data) {
        setRecentTx(txRes.data.map(tx => ({
          id: tx.id,
          userId: tx.user_id,
          type: tx.type as 'credit' | 'debit',
          amount: tx.amount,
          reason: tx.reason as PointsTransaction['reason'],
          metaJson: tx.meta_json as Record<string, unknown> | undefined,
          createdAt: tx.created_at,
        })));
        setTxStats({ debitCount: txRes.data.filter(t => t.type === 'debit').length });
      }

      if (sessRes.data) {
        const completed = sessRes.data.filter(s => s.status === 'completed');
        let totalPct = 0;
        let passedCount = 0;
        const recent: ExamStats['recentSessions'] = [];

        for (const s of completed) {
          const score = s.score_json as { percentage: number } | null;
          const snap = s.exam_snapshot as { template: { name_ar: string } } | null;
          const pct = score?.percentage ?? 0;
          totalPct += pct;
          if (pct >= 60) passedCount++;
          if (recent.length < 5) {
            recent.push({
              id: s.id,
              examName: snap?.template?.name_ar || 'اختبار',
              percentage: pct,
              passed: pct >= 60,
              completedAt: s.completed_at || '',
            });
          }
        }

        setExamStats({
          totalSessions: sessRes.data.length,
          completedSessions: completed.length,
          passedSessions: passedCount,
          avgPercentage: completed.length > 0 ? Math.round(totalPct / completed.length) : 0,
          recentSessions: recent,
        });
      }

      if (dnaRes.data) setDna(dnaRes.data as any);

      const memProfile = await getStudentMemory(user.id);
      if (memProfile) setMemoryProfile(memProfile);

      setLoading(false);
    };
    load();
  }, [user]);

  const { templates: userExams } = useExamTemplates(user?.countryId);

  return (
    <div className="space-y-6">
      {/* Smart AI Insight */}
      <SmartInsightHeader
        dna={dna}
        avgPercentage={examStats.avgPercentage}
        completedSessions={examStats.completedSessions}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">
          مرحبًا {user?.name} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          إليك ملخص حسابك على منصة ساريس
        </p>
        {user?.email && (
          <p className="mt-0.5 text-xs text-muted-foreground/70 font-mono direction-ltr text-right">
            {user.email}
          </p>
        )}
      </motion.div>

      {/* Diamond upsell banner */}
      {!user?.isDiamond && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Link
            to="/app/topup"
            className="group flex items-center gap-4 rounded-2xl gradient-diamond p-5 text-diamond-foreground shadow-diamond transition-all hover:scale-[1.01]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">اشترك في Diamond</h3>
              <p className="text-sm opacity-90">
                وصول غير محدود لجميع الاختبارات والتدريب والتحليل بدون نقاط
              </p>
            </div>
            <ArrowLeft className="h-5 w-5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </Link>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatsCard title="رصيد النقاط" value={wallet?.balance ?? 0} subtitle="نقطة متاحة" icon={Coins} variant="gold" />
        <StatsCard title="الاختبارات المكتملة" value={examStats.completedSessions} subtitle={`من أصل ${examStats.totalSessions} جلسة`} icon={BookOpen} variant="info" />
        <StatsCard title="معدل النجاح" value={examStats.completedSessions > 0 ? `${Math.round((examStats.passedSessions / examStats.completedSessions) * 100)}%` : '—'} subtitle={`${examStats.passedSessions} ناجح من ${examStats.completedSessions}`} icon={Trophy} variant="success" />
        <StatsCard title="متوسط الأداء" value={examStats.avgPercentage > 0 ? `${examStats.avgPercentage}%` : '—'} subtitle="معدل الدرجات" icon={Target} />
      </motion.div>

      {/* Progress Journey (Mini Timeline) */}
      <ProgressJourney sessions={examStats.recentSessions} />

      {/* Quick AI Action Buttons */}
      <QuickAIActions />

      {/* Skill Map */}
      {memoryProfile && <SkillMapCard profile={memoryProfile} />}

      {/* Learning DNA */}
      <LearningDNACard studentId={user?.id} />

      {/* Recommended Training */}
      <div data-training-recommendations>
        <RecommendedTrainingCard recommendations={recommendations} loading={recsLoading} />
      </div>

      {/* Recent Exam Results */}
      {examStats.recentSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="rounded-2xl border bg-card shadow-card overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              آخر الاختبارات
            </h2>
            <Link to="/app/history" className="text-sm text-primary font-medium hover:underline">عرض الكل</Link>
          </div>
          <div className="divide-y">
            {examStats.recentSessions.map((s) => (
              <Link key={s.id} to={`/app/exam-session/${s.id}`} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${s.passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  {s.passed ? <Trophy className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.examName}</p>
                  <p className="text-xs text-muted-foreground">{s.completedAt ? new Date(s.completedAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Progress value={s.percentage} className="h-1.5 w-16" />
                  <span className={`text-sm font-bold font-mono ${s.passed ? 'text-success' : 'text-destructive'}`}>{s.percentage}%</span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-2xl border bg-card shadow-card overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">آخر الحركات</h2>
          <Link to="/app/wallet" className="text-sm text-primary font-medium hover:underline">عرض الكل</Link>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : recentTx.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">لا توجد حركات بعد</div>
          ) : (
            recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tx.type === 'credit' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  <Coins className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{reasonLabels[tx.reason] || tx.reason}</p>
                  <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString('ar-SA')}</p>
                </div>
                <span className={`text-sm font-bold ${tx.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                  {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                </span>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Admin Quick Access */}
      {user?.isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22 }}
        >
          <Link
            to="/app/admin"
            className="group flex items-center gap-4 rounded-2xl p-5 text-primary-foreground shadow-lg transition-all hover:scale-[1.01] gradient-primary"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Shield className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">لوحة الإدارة</h3>
              <p className="text-sm opacity-90">إدارة الاختبارات، الأسئلة، والمستخدمين</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/app/admin/ai-generator"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                توليد الأسئلة
              </Link>
              <ArrowLeft className="h-5 w-5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <Link to="/app/exams" className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-primary-foreground"><BookOpen className="h-6 w-6" /></div>
          <div>
            <h3 className="font-bold text-foreground">ابدأ اختبار</h3>
            <p className="text-xs text-muted-foreground">محاكاة أو تدريب ذكي</p>
          </div>
        </Link>
        <Link to="/app/referral" className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success text-success-foreground"><UserPlus className="h-6 w-6" /></div>
          <div>
            <h3 className="font-bold text-foreground">ادعُ أصدقاءك</h3>
            <p className="text-xs text-muted-foreground">واحصل على نقاط مجانية</p>
          </div>
        </Link>
        <Link to="/app/topup" className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold text-gold-foreground"><Coins className="h-6 w-6" /></div>
          <div>
            <h3 className="font-bold text-foreground">شراء نقاط</h3>
            <p className="text-xs text-muted-foreground">أو اشتراك Diamond</p>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
