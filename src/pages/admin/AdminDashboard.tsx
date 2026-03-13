import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe,
  BookOpen,
  HelpCircle,
  Coins,
  Crown,
  Settings,
  Users,
  TrendingUp,
  Sparkles,
  DollarSign,
  BarChart2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const quickLinks = [
  { label: 'إدارة الدول', icon: Globe, href: '/app/admin/countries', desc: 'إضافة وتعديل الدول والعملات' },
  { label: 'هيكل الاختبارات', icon: BookOpen, href: '/app/admin/exams', desc: 'إدارة الاختبارات والأقسام' },
  { label: 'بنك الأسئلة', icon: HelpCircle, href: '/app/admin/questions', desc: 'إضافة ومراجعة الأسئلة' },
  { label: 'حزم النقاط', icon: Coins, href: '/app/admin/points-packs', desc: 'تسعير حزم النقاط' },
  { label: 'خطط Diamond', icon: Crown, href: '/app/admin/plans', desc: 'إدارة خطط الاشتراك' },
  { label: 'الإعدادات', icon: Settings, href: '/app/admin/settings', desc: 'إعدادات المنصة العامة' },
  { label: 'توليد بالذكاء', icon: Sparkles, href: '/app/admin/ai-generator', desc: 'توليد أسئلة بالذكاء الاصطناعي' },
];

interface LiveStats {
  totalUsers: number;
  totalSalesUSD: number;
  totalOrders: number;
  totalPointsGranted: number;
}

interface ContentStats {
  activeCountries: number;
  totalCountries: number;
  activeExams: number;
  totalExams: number;
}

export default function AdminDashboard() {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [contentStats, setContentStats] = useState<ContentStats>({ activeCountries: 0, totalCountries: 0, activeExams: 0, totalExams: 0 });
  const [loadingContent, setLoadingContent] = useState(true);

  useEffect(() => {
    // Fetch live stats from edge function
    const fetchLive = async () => {
      try {
        const { data: json, error: fnError } = await supabase.functions.invoke('admin-stats');
        if (fnError || !json) return;
        setLiveStats({
          totalUsers: json.summary.totalUsers,
          totalSalesUSD: json.summary.totalSalesUSD,
          totalOrders: json.summary.totalOrders,
          totalPointsGranted: json.summary.totalPointsGranted,
        });
      } catch {
        // silent fail — non-critical widget
      } finally {
        setLoadingLive(false);
      }
    };

    // Fetch content stats from DB
    const fetchContent = async () => {
      try {
        const [countriesRes, examsRes] = await Promise.all([
          supabase.from('countries').select('id, is_active'),
          supabase.from('exam_templates').select('id, is_active'),
        ]);

        setContentStats({
          activeCountries: countriesRes.data?.filter(c => c.is_active).length ?? 0,
          totalCountries: countriesRes.data?.length ?? 0,
          activeExams: examsRes.data?.filter(e => e.is_active).length ?? 0,
          totalExams: examsRes.data?.length ?? 0,
        });
      } catch {
        // silent
      } finally {
        setLoadingContent(false);
      }
    };

    fetchLive();
    fetchContent();
  }, []);

  const baseStats = [
    {
      label: 'الدول المفعّلة',
      value: contentStats.activeCountries,
      total: contentStats.totalCountries,
      icon: Globe,
      color: 'text-info',
      bg: 'bg-info/10',
      href: '/app/admin/countries',
      loading: loadingContent,
    },
    {
      label: 'الاختبارات',
      value: contentStats.activeExams,
      total: contentStats.totalExams,
      icon: BookOpen,
      color: 'text-primary',
      bg: 'bg-primary/10',
      href: '/app/admin/exams',
      loading: loadingContent,
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-muted-foreground">نظرة عامة على منصة Saris Exams</p>
      </motion.div>

      {/* ── Live Quick Stats ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            إحصائيات حية
          </h2>
          <Link
            to="/app/admin/stats"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            عرض التفاصيل الكاملة
          </Link>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* Total Users */}
          <Link
            to="/app/admin/users"
            className="group rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">إجمالي المستخدمين</p>
                {loadingLive ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
                ) : (
                  <p className="text-3xl font-black text-foreground">
                    {liveStats?.totalUsers?.toLocaleString() ?? '—'}
                  </p>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-info/10 group-hover:bg-info/20 transition-colors">
                <Users className="h-5 w-5 text-info" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
              عرض إدارة المستخدمين ←
            </p>
          </Link>

          {/* Total Sales */}
          <Link
            to="/app/admin/stats"
            className="group rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">إجمالي المبيعات</p>
                {loadingLive ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
                ) : (
                  <p className="text-3xl font-black text-foreground">
                    ${liveStats?.totalSalesUSD?.toFixed(2) ?? '0.00'}
                  </p>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 group-hover:bg-success/20 transition-colors">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {loadingLive ? '...' : `${liveStats?.totalOrders ?? 0} طلب مكتمل`}
            </p>
          </Link>

          {/* Points Granted */}
          <Link
            to="/app/admin/stats"
            className="group rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">النقاط الممنوحة</p>
                {loadingLive ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
                ) : (
                  <p className="text-3xl font-black text-foreground">
                    {liveStats?.totalPointsGranted?.toLocaleString() ?? '—'}
                  </p>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/10 group-hover:bg-gold/20 transition-colors">
                <Coins className="h-5 w-5 text-gold" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">إجمالي النقاط الكل</p>
          </Link>

          {/* Quick link to full stats */}
          <Link
            to="/app/admin/stats"
            className="group rounded-2xl border-2 border-dashed border-border bg-card/50 p-5 hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center text-center gap-2"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <BarChart2 className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              الإحصائيات المتقدمة
            </p>
            <p className="text-[11px] text-muted-foreground">رسوم بيانية ونشاط يومي</p>
          </Link>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {baseStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 + 0.1 }}
          >
            <Link
              to={stat.href}
              className="block rounded-2xl border bg-card p-4 shadow-card hover:shadow-card-hover transition-all group"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg} mb-3`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              {stat.loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-black text-foreground">{stat.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {stat.label}
                {!stat.loading && stat.total !== stat.value && (
                  <span className="text-muted-foreground/60"> / {stat.total}</span>
                )}
              </p>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          الوصول السريع
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-card hover:shadow-card-hover transition-all group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary text-primary-foreground flex-shrink-0">
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                  {link.label}
                </h3>
                <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}