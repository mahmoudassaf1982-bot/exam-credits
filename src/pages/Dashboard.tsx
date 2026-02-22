import { Coins, BookOpen, UserPlus, TrendingUp, ArrowLeft, Sparkles, Loader2, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/StatsCard';
import { reasonLabels } from '@/data/mock';
import { useExamTemplates } from '@/hooks/useExamTemplates';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PointsTransaction } from '@/types';

export default function Dashboard() {
  const { user, wallet } = useAuth();
  const [recentTx, setRecentTx] = useState<PointsTransaction[]>([]);
  const [txStats, setTxStats] = useState({ debitCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) {
        setRecentTx(data.map(tx => ({
          id: tx.id,
          userId: tx.user_id,
          type: tx.type as 'credit' | 'debit',
          amount: tx.amount,
          reason: tx.reason as PointsTransaction['reason'],
          metaJson: tx.meta_json as Record<string, unknown> | undefined,
          createdAt: tx.created_at,
        })));
        setTxStats({ debitCount: data.filter(t => t.type === 'debit').length });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const { templates: userExams } = useExamTemplates(user?.countryId);

  return (
    <div className="space-y-8">
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
        <StatsCard
          title="رصيد النقاط"
          value={wallet?.balance ?? 0}
          subtitle="نقطة متاحة"
          icon={Coins}
          variant="gold"
        />
        <StatsCard
          title="الاختبارات المتاحة"
          value={userExams.length}
          subtitle={`في ${user?.countryName}`}
          icon={BookOpen}
          variant="info"
        />
        <StatsCard
          title="دعوات ناجحة"
          value={0}
          subtitle="0 قيد الانتظار"
          icon={UserPlus}
          variant="success"
        />
        <StatsCard
          title="الجلسات المستخدمة"
          value={txStats.debitCount}
          subtitle="جلسة مكتملة"
          icon={TrendingUp}
        />
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-2xl border bg-card shadow-card overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">آخر الحركات</h2>
          <Link
            to="/app/wallet"
            className="text-sm text-primary font-medium hover:underline"
          >
            عرض الكل
          </Link>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : recentTx.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">لا توجد حركات بعد</div>
          ) : (
            recentTx.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    tx.type === 'credit'
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  <Coins className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {reasonLabels[tx.reason] || tx.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.type === 'credit' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '-'}
                  {tx.amount}
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
        <Link
          to="/app/exams"
          className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">ابدأ اختبار</h3>
            <p className="text-xs text-muted-foreground">محاكاة أو تدريب ذكي</p>
          </div>
        </Link>

        <Link
          to="/app/referral"
          className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success text-success-foreground">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">ادعُ أصدقاءك</h3>
            <p className="text-xs text-muted-foreground">واحصل على نقاط مجانية</p>
          </div>
        </Link>

        <Link
          to="/app/topup"
          className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
            <Coins className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">شراء نقاط</h3>
            <p className="text-xs text-muted-foreground">أو اشتراك Diamond</p>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
