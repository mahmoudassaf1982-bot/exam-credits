import { Coins, ArrowDown, ArrowUp, Filter, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { reasonLabels } from '@/data/mock';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PointsTransaction } from '@/types';

export default function Wallet() {
  const { wallet, user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchTransactions = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) {
        setTransactions(data.map(tx => ({
          id: tx.id,
          userId: tx.user_id,
          type: tx.type as 'credit' | 'debit',
          amount: tx.amount,
          reason: tx.reason as PointsTransaction['reason'],
          metaJson: tx.meta_json as Record<string, unknown> | undefined,
          createdAt: tx.created_at,
        })));
      }
      setLoading(false);
    };
    fetchTransactions();
  }, [user]);

  const filtered = transactions.filter((tx) => filter === 'all' || tx.type === filter);

  const totalCredits = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">المحفظة</h1>
        <p className="mt-1 text-muted-foreground">إدارة رصيد النقاط والحركات</p>
      </motion.div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl gradient-gold p-6 text-gold-foreground shadow-gold"
      >
        <div className="flex items-center gap-3 mb-4">
          <Coins className="h-8 w-8" />
          <span className="text-lg font-bold">رصيد النقاط</span>
          {user?.isDiamond && (
            <span className="mr-auto rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
              💎 Diamond
            </span>
          )}
        </div>
        <p className="text-5xl font-black">{wallet?.balance ?? 0}</p>
        <p className="text-sm opacity-80 mt-1">نقطة متاحة</p>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-white/15 p-3">
            <div className="flex items-center gap-2 text-sm opacity-80">
              <ArrowDown className="h-4 w-4" />
              إجمالي الإيداعات
            </div>
            <p className="text-xl font-bold mt-1">{totalCredits}</p>
          </div>
          <div className="rounded-xl bg-white/15 p-3">
            <div className="flex items-center gap-2 text-sm opacity-80">
              <ArrowUp className="h-4 w-4" />
              إجمالي المصروفات
            </div>
            <p className="text-xl font-bold mt-1">{totalDebits}</p>
          </div>
        </div>
      </motion.div>

      {/* Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border bg-card shadow-card overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">سجل الحركات</h2>
          <div className="flex rounded-lg bg-muted p-0.5">
            {[
              { key: 'all' as const, label: 'الكل' },
              { key: 'credit' as const, label: 'إيداع' },
              { key: 'debit' as const, label: 'خصم' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  filter === f.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>لا توجد حركات</p>
            </div>
          ) : (
            filtered.map((tx) => (
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
                  {tx.type === 'credit' ? (
                    <ArrowDown className="h-5 w-5" />
                  ) : (
                    <ArrowUp className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {reasonLabels[tx.reason] || tx.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString('ar-SA', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.type === 'credit' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '-'}
                  {tx.amount} نقطة
                </span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
