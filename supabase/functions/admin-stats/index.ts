import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: roleData } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    // Use service role for admin queries
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Fetch all data in parallel
    const [
      { data: authUsers },
      { data: wallets },
      { data: transactions },
      { data: paymentOrders },
    ] = await Promise.all([
      adminClient.auth.admin.listUsers({ perPage: 1000 }),
      adminClient.from('wallets').select('balance, user_id'),
      adminClient.from('transactions').select('type, amount, reason, created_at'),
      adminClient.from('payment_orders').select('price_usd, status, created_at, order_type, points_amount'),
    ]);

    const totalUsers = authUsers?.users?.length ?? 0;

    // Total wallet balance across all users
    const totalBalance = (wallets ?? []).reduce((sum, w) => sum + (w.balance ?? 0), 0);

    // Total points ever granted (credits)
    const totalPointsGranted = (transactions ?? [])
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);

    // Total sales (completed payment orders)
    const completedOrders = (paymentOrders ?? []).filter(o => o.status === 'completed');
    const totalSalesUSD = completedOrders.reduce((sum, o) => sum + (o.price_usd ?? 0), 0);
    const totalOrders = completedOrders.length;

    // Points sold (from completed point purchases)
    const totalPointsSold = completedOrders
      .filter(o => o.order_type === 'points')
      .reduce((sum, o) => sum + (o.points_amount ?? 0), 0);

    // --- Daily activity for last 30 days ---
    const today = new Date();
    const last30Days: { date: string; label: string }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      last30Days.push({
        date: iso,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
      });
    }

    // Map transactions to daily credits/debits
    const txByDay: Record<string, { credits: number; debits: number }> = {};
    last30Days.forEach(({ date }) => { txByDay[date] = { credits: 0, debits: 0 }; });

    (transactions ?? []).forEach(tx => {
      const day = tx.created_at?.split('T')[0];
      if (day && txByDay[day]) {
        if (tx.type === 'credit') txByDay[day].credits += tx.amount ?? 0;
        else txByDay[day].debits += tx.amount ?? 0;
      }
    });

    // Map payment orders to daily sales
    const salesByDay: Record<string, number> = {};
    last30Days.forEach(({ date }) => { salesByDay[date] = 0; });

    completedOrders.forEach(order => {
      const day = order.created_at?.split('T')[0];
      if (day && salesByDay[day] !== undefined) {
        salesByDay[day] += order.price_usd ?? 0;
      }
    });

    // New users per day (last 30 days)
    const usersByDay: Record<string, number> = {};
    last30Days.forEach(({ date }) => { usersByDay[date] = 0; });

    (authUsers?.users ?? []).forEach(u => {
      const day = u.created_at?.split('T')[0];
      if (day && usersByDay[day] !== undefined) {
        usersByDay[day]++;
      }
    });

    const dailyActivity = last30Days.map(({ date, label }) => ({
      date,
      label,
      credits: txByDay[date]?.credits ?? 0,
      debits: txByDay[date]?.debits ?? 0,
      sales: Math.round((salesByDay[date] ?? 0) * 100) / 100,
      newUsers: usersByDay[date] ?? 0,
    }));

    // Breakdown by reason
    const reasonBreakdown: Record<string, number> = {};
    (transactions ?? [])
      .filter(t => t.type === 'credit')
      .forEach(t => {
        const r = t.reason ?? 'other';
        reasonBreakdown[r] = (reasonBreakdown[r] ?? 0) + (t.amount ?? 0);
      });

    const reasonData = Object.entries(reasonBreakdown).map(([name, value]) => ({
      name: translateReason(name),
      value,
    }));

    return new Response(JSON.stringify({
      summary: {
        totalUsers,
        totalBalance,
        totalPointsGranted,
        totalSalesUSD: Math.round(totalSalesUSD * 100) / 100,
        totalOrders,
        totalPointsSold,
      },
      dailyActivity,
      reasonData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('admin-stats error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

function translateReason(reason: string): string {
  const map: Record<string, string> = {
    signup_bonus: 'مكافأة التسجيل',
    referral_bonus: 'مكافأة الإحالة',
    purchase: 'شراء نقاط',
    manual_credit: 'إضافة يدوية',
    admin_credit: 'إضافة يدوية',
    refund: 'استرداد',
    session_cost: 'تكلفة جلسة',
    manual_debit: 'خصم يدوي',
  };
  return map[reason] ?? reason;
}
