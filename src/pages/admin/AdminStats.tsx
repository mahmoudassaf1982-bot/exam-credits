import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  DollarSign,
  Coins,
  TrendingUp,
  Loader2,
  RefreshCw,
  Award,
  ShoppingCart,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Summary {
  totalUsers: number;
  totalBalance: number;
  totalPointsGranted: number;
  totalSalesUSD: number;
  totalOrders: number;
  totalPointsSold: number;
}

interface DayData {
  date: string;
  label: string;
  credits: number;
  debits: number;
  sales: number;
  newUsers: number;
}

interface ReasonData {
  name: string;
  value: number;
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--gold))',
  'hsl(var(--success))',
  'hsl(var(--info))',
  'hsl(var(--diamond))',
  'hsl(var(--destructive))',
];

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  colorClass,
  bgClass,
  delay,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-black text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgClass}`}>
          <Icon className={`h-6 w-6 ${colorClass}`} />
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminStats() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dailyActivity, setDailyActivity] = useState<DayData[]>([]);
  const [reasonData, setReasonData] = useState<ReasonData[]>([]);
  const [chartRange, setChartRange] = useState<'7' | '14' | '30'>('14');
  const { toast } = useToast();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-stats`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      setSummary(json.summary);
      setDailyActivity(json.dailyActivity ?? []);
      setReasonData(json.reasonData ?? []);
    } catch (err) {
      toast({ title: 'خطأ', description: 'فشل تحميل الإحصائيات', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const filteredDays = dailyActivity.slice(-parseInt(chartRange));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">الإحصائيات المتقدمة</h1>
          <p className="mt-1 text-muted-foreground">نظرة تحليلية شاملة على أداء المنصة</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </motion.div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="إجمالي المستخدمين"
          value={summary?.totalUsers ?? 0}
          icon={Users}
          colorClass="text-info"
          bgClass="bg-info/10"
          delay={0.04}
        />
        <StatCard
          label="المبيعات الإجمالية"
          value={`$${summary?.totalSalesUSD?.toFixed(2) ?? '0.00'}`}
          sub={`${summary?.totalOrders ?? 0} طلب مكتمل`}
          icon={DollarSign}
          colorClass="text-success"
          bgClass="bg-success/10"
          delay={0.08}
        />
        <StatCard
          label="النقاط الممنوحة"
          value={(summary?.totalPointsGranted ?? 0).toLocaleString()}
          sub="إجمالي كل العمليات"
          icon={Coins}
          colorClass="text-gold"
          bgClass="bg-gold/10"
          delay={0.12}
        />
        <StatCard
          label="النقاط المباعة"
          value={(summary?.totalPointsSold ?? 0).toLocaleString()}
          sub="من شراء النقاط"
          icon={ShoppingCart}
          colorClass="text-primary"
          bgClass="bg-primary/10"
          delay={0.16}
        />
        <StatCard
          label="الرصيد الكلي"
          value={(summary?.totalBalance ?? 0).toLocaleString()}
          sub="مجموع محافظ المستخدمين"
          icon={Award}
          colorClass="text-diamond"
          bgClass="bg-diamond/10"
          delay={0.20}
        />
        <StatCard
          label="متوسط الرصيد"
          value={
            summary && summary.totalUsers > 0
              ? Math.round(summary.totalBalance / summary.totalUsers)
              : 0
          }
          sub="نقطة / مستخدم"
          icon={TrendingUp}
          colorClass="text-primary"
          bgClass="bg-primary/10"
          delay={0.24}
        />
      </div>

      {/* Chart range selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">نطاق الرسوم البيانية:</span>
        <Select value={chartRange} onValueChange={(v) => setChartRange(v as '7' | '14' | '30')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">آخر 7 أيام</SelectItem>
            <SelectItem value="14">آخر 14 يوم</SelectItem>
            <SelectItem value="30">آخر 30 يوم</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily users chart */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <h2 className="text-base font-bold text-foreground mb-4">المستخدمون الجدد يومياً</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="newUsers"
                name="مستخدم جديد"
                stroke="hsl(var(--info))"
                fill="url(#gradUsers)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Daily sales chart */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <h2 className="text-base font-bold text-foreground mb-4">المبيعات اليومية (USD)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="المبيعات $"
                stroke="hsl(var(--success))"
                fill="url(#gradSales)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Points credits vs debits */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="lg:col-span-2 rounded-2xl border bg-card p-5 shadow-card"
        >
          <h2 className="text-base font-bold text-foreground mb-4">نشاط النقاط اليومي</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={filteredDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
              />
              <Bar dataKey="credits" name="نقاط ممنوحة" fill="hsl(var(--gold))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="debits" name="نقاط مخصومة" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Reason breakdown pie */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.40 }}
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <h2 className="text-base font-bold text-foreground mb-4">توزيع مصادر النقاط</h2>
          {reasonData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">
              لا توجد بيانات
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={reasonData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={3}
                >
                  {reasonData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(value) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>
    </div>
  );
}
