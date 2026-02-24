import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Target, Brain, Trophy,
  AlertTriangle, CheckCircle2, Loader2, BookOpen, Layers,
  ArrowLeft, Zap, Shield, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';

interface SectionScore {
  correct: number;
  total: number;
  name: string;
}

interface SessionData {
  id: string;
  session_type: string;
  status: string;
  score_json: {
    total_correct: number;
    total_questions: number;
    percentage: number;
    section_scores: Record<string, SectionScore>;
  } | null;
  completed_at: string | null;
  exam_snapshot: {
    template: { name_ar: string };
    practice_mode?: string;
    is_diagnostic?: boolean;
    target_section_name?: string;
  };
}

interface SectionAnalysis {
  id: string;
  name: string;
  totalCorrect: number;
  totalQuestions: number;
  percentage: number;
  attempts: number;
  trend: 'improving' | 'declining' | 'stable' | 'new';
}

const COLORS = {
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--gold))',
  danger: 'hsl(var(--destructive))',
  primary: 'hsl(var(--primary))',
  info: 'hsl(var(--info))',
  muted: 'hsl(var(--muted-foreground))',
};

const PIE_COLORS = ['#22c55e', '#eab308', '#ef4444', '#3b82f6'];

export default function PerformanceProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('exam_sessions')
        .select('id, session_type, status, score_json, completed_at, exam_snapshot')
        .eq('user_id', user.id)
        .in('status', ['completed', 'submitted'])
        .not('score_json', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(50);

      setSessions((data as unknown as SessionData[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  // ── Computed analytics ──
  const analytics = useMemo(() => {
    if (sessions.length === 0) return null;

    const sectionMap = new Map<string, SectionAnalysis>();
    let totalCorrect = 0;
    let totalQuestions = 0;
    const sessionPercentages: number[] = [];
    const difficultyDist = { easy: 0, medium: 0, hard: 0 };

    // Process sessions chronologically (oldest first for trend)
    const chronological = [...sessions].reverse();

    for (const session of chronological) {
      if (!session.score_json) continue;
      const { section_scores, percentage, total_correct, total_questions: tq } = session.score_json;
      totalCorrect += total_correct;
      totalQuestions += tq;
      sessionPercentages.push(percentage);

      if (section_scores) {
        for (const [sId, score] of Object.entries(section_scores)) {
          const existing = sectionMap.get(sId);
          if (existing) {
            const prevPct = existing.percentage;
            existing.totalCorrect += score.correct;
            existing.totalQuestions += score.total;
            existing.percentage = existing.totalQuestions > 0
              ? Math.round((existing.totalCorrect / existing.totalQuestions) * 100) : 0;
            existing.attempts += 1;
            const newPct = existing.percentage;
            existing.trend = newPct > prevPct + 5 ? 'improving' : newPct < prevPct - 5 ? 'declining' : 'stable';
          } else {
            const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
            sectionMap.set(sId, {
              id: sId,
              name: score.name,
              totalCorrect: score.correct,
              totalQuestions: score.total,
              percentage: pct,
              attempts: 1,
              trend: 'new',
            });
          }
        }
      }
    }

    const sectionAnalyses = Array.from(sectionMap.values()).sort((a, b) => a.percentage - b.percentage);
    const overallPercentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Strengths & weaknesses
    const weakSections = sectionAnalyses.filter(s => s.percentage < 60 && s.totalQuestions > 0);
    const strongSections = sectionAnalyses.filter(s => s.percentage >= 75 && s.totalQuestions > 0);

    // Recent trend (last 5 sessions)
    const recentScores = sessionPercentages.slice(-5);
    const overallTrend = recentScores.length >= 2
      ? recentScores[recentScores.length - 1] > recentScores[0] ? 'improving' : recentScores[recentScores.length - 1] < recentScores[0] ? 'declining' : 'stable'
      : 'new';

    // Top 3 recommendations
    const recommendations: { icon: typeof Brain; title: string; description: string; action?: string }[] = [];
    if (weakSections.length > 0) {
      recommendations.push({
        icon: Target,
        title: `ركّز على: ${weakSections[0].name}`,
        description: `أداؤك ${weakSections[0].percentage}% في هذا القسم. ابدأ جلسة تدريب ذكي لتحسينه.`,
        action: 'practice',
      });
    }
    if (weakSections.length > 1) {
      recommendations.push({
        icon: Brain,
        title: `راجع: ${weakSections[1].name}`,
        description: `نسبتك ${weakSections[1].percentage}% وتحتاج مراجعة إضافية.`,
      });
    }
    if (sessions.length < 3) {
      recommendations.push({
        icon: Zap,
        title: 'أكمل المزيد من الاختبارات',
        description: 'كلما أكملت اختبارات أكثر، كلما كان التحليل أدق وأشمل.',
        action: 'exams',
      });
    }
    if (strongSections.length > 0 && recommendations.length < 3) {
      recommendations.push({
        icon: Shield,
        title: `حافظ على: ${strongSections[0].name}`,
        description: `أداء ممتاز (${strongSections[0].percentage}%)! استمر في المراجعة الدورية.`,
      });
    }

    return {
      totalSessions: sessions.length,
      overallPercentage,
      totalCorrect,
      totalQuestions,
      sectionAnalyses,
      weakSections,
      strongSections,
      overallTrend,
      recommendations,
      sessionPercentages,
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics || sessions.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black">ملف الأداء</h1>
        <div className="rounded-2xl border bg-card p-12 text-center">
          <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-bold mb-2">لا توجد بيانات بعد</h2>
          <p className="text-muted-foreground mb-6">أكمل اختباراً واحداً على الأقل لرؤية تحليل أدائك</p>
          <Button onClick={() => navigate('/app/exams')} className="gradient-primary text-primary-foreground">
            <BookOpen className="ml-2 h-4 w-4" />
            ابدأ اختبارك الأول
          </Button>
        </div>
      </div>
    );
  }

  const radarData = analytics.sectionAnalyses.map(s => ({
    section: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
    score: s.percentage,
    fullMark: 100,
  }));

  const barData = analytics.sessionPercentages.slice(-10).map((pct, i) => ({
    session: `${i + 1}`,
    percentage: pct,
  }));

  const strengthDist = [
    { name: 'ممتاز (≥80%)', value: analytics.sectionAnalyses.filter(s => s.percentage >= 80).length },
    { name: 'جيد (60-79%)', value: analytics.sectionAnalyses.filter(s => s.percentage >= 60 && s.percentage < 80).length },
    { name: 'ضعيف (<60%)', value: analytics.sectionAnalyses.filter(s => s.percentage < 60 && s.totalQuestions > 0).length },
    { name: 'غير مختبر', value: analytics.sectionAnalyses.filter(s => s.totalQuestions === 0).length },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">ملف الأداء</h1>
        <p className="mt-1 text-muted-foreground">تحليل شامل لأدائك وتوصيات مخصصة</p>
      </motion.div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl border bg-card p-4 shadow-card text-center">
          <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${analytics.overallPercentage >= 60 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            {analytics.overallPercentage >= 60 ? <Trophy className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <p className="text-2xl font-black">{analytics.overallPercentage}%</p>
          <p className="text-xs text-muted-foreground">المعدل العام</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border bg-card p-4 shadow-card text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <p className="text-2xl font-black">{analytics.totalSessions}</p>
          <p className="text-xs text-muted-foreground">اختبار مكتمل</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl border bg-card p-4 shadow-card text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-2xl font-black">{analytics.totalCorrect}/{analytics.totalQuestions}</p>
          <p className="text-xs text-muted-foreground">إجابات صحيحة</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl border bg-card p-4 shadow-card text-center">
          <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${
            analytics.overallTrend === 'improving' ? 'bg-success/10 text-success' :
            analytics.overallTrend === 'declining' ? 'bg-destructive/10 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            {analytics.overallTrend === 'improving' ? <TrendingUp className="h-5 w-5" /> :
             analytics.overallTrend === 'declining' ? <TrendingDown className="h-5 w-5" /> :
             <BarChart3 className="h-5 w-5" />}
          </div>
          <p className="text-sm font-bold">
            {analytics.overallTrend === 'improving' ? 'تحسّن ↑' :
             analytics.overallTrend === 'declining' ? 'تراجع ↓' : 'مستقر'}
          </p>
          <p className="text-xs text-muted-foreground">اتجاه الأداء</p>
        </motion.div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar chart - Section strengths */}
        {radarData.length > 2 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              خريطة الأداء بالأقسام
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="section" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name="الأداء" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Bar chart - Progress over time */}
        {barData.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              تطور الأداء (آخر 10 اختبارات)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'النسبة']}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                />
                <Bar dataKey="percentage" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Pie chart - Strength distribution */}
        {strengthDist.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Layers className="h-5 w-5 text-info" />
              توزيع مستوى الأقسام
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={strengthDist} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                  paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {strengthDist.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </div>

      {/* Section details */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5" />
          تفاصيل الأداء بالأقسام
        </h2>
        <div className="space-y-3">
          {analytics.sectionAnalyses.map((section) => {
            const isWeak = section.percentage < 60 && section.totalQuestions > 0;
            const isStrong = section.percentage >= 75;
            return (
              <div key={section.id} className={`rounded-xl p-4 ${isWeak ? 'bg-destructive/5 border border-destructive/20' : isStrong ? 'bg-success/5 border border-success/20' : 'bg-muted/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWeak ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                     isStrong ? <CheckCircle2 className="h-4 w-4 text-success" /> :
                     <BarChart3 className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm">{section.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{section.totalCorrect}/{section.totalQuestions}</span>
                    <span className={`font-bold ${isWeak ? 'text-destructive' : isStrong ? 'text-success' : ''}`}>
                      {section.percentage}%
                    </span>
                    {section.trend === 'improving' && <TrendingUp className="h-3.5 w-3.5 text-success" />}
                    {section.trend === 'declining' && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                </div>
                <Progress value={section.percentage} className={`h-2 ${isWeak ? '[&>div]:bg-destructive' : isStrong ? '[&>div]:bg-success' : ''}`} />
                <p className="text-xs text-muted-foreground mt-1">{section.attempts} محاولة</p>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Recommendations */}
      {analytics.recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-info" />
            توصيات مخصصة لك
          </h2>
          <div className="space-y-3">
            {analytics.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-4 rounded-xl bg-muted/40 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                  <rec.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{rec.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                </div>
                {rec.action && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs flex-shrink-0"
                    onClick={() => navigate(rec.action === 'practice' ? '/app/exams' : '/app/exams')}
                  >
                    ابدأ
                  </Button>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
