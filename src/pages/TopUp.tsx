import { useState, useEffect } from 'react';
import { Check, Coins, Crown, Sparkles, CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { PointsPack, DiamondPlan } from '@/types';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { PayPalHostedCardFields } from '@/components/PayPalHostedCardFields';

export default function TopUp() {
  const { user } = useAuth();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [showDiamondPayment, setShowDiamondPayment] = useState(false);
  const [userPacks, setUserPacks] = useState<PointsPack[]>([]);
  const [userDiamondPlan, setUserDiamondPlan] = useState<DiamondPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.countryId) return;
    const fetchData = async () => {
      const [packsRes, plansRes] = await Promise.all([
        supabase
          .from('points_packs')
          .select('*')
          .eq('country_id', user.countryId)
          .eq('is_active', true)
          .order('points', { ascending: true }),
        supabase
          .from('diamond_plans')
          .select('*')
          .eq('country_id', user.countryId)
          .eq('is_active', true)
          .limit(1),
      ]);

      if (packsRes.data) {
        setUserPacks(packsRes.data.map(p => ({
          id: p.id,
          countryId: p.country_id,
          points: p.points,
          priceUSD: p.price_usd,
          label: p.label,
          popular: p.popular,
          isActive: p.is_active,
        })));
      }

      if (plansRes.data && plansRes.data.length > 0) {
        const p = plansRes.data[0];
        setUserDiamondPlan({
          id: p.id,
          countryId: p.country_id,
          nameAr: p.name_ar,
          priceUSD: p.price_usd,
          currency: p.currency,
          durationMonths: p.duration_months,
          isActive: p.is_active,
          createdAt: p.created_at,
        });
      }

      setLoading(false);
    };
    fetchData();
  }, [user?.countryId]);

  const diamondPrice = userDiamondPlan?.priceUSD ?? 99;
  const selectedPack = userPacks.find((p) => p.id === selectedPackId);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">
          شراء نقاط
        </h1>
        <p className="mt-1 text-muted-foreground">
          اختر حزمة النقاط المناسبة أو اشترك في Diamond
        </p>
      </motion.div>

      {/* Diamond subscription */}
      {userDiamondPlan && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl gradient-diamond p-6 text-diamond-foreground shadow-diamond relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
              <Crown className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black">{userDiamondPlan.nameAr}</h2>
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mt-1 text-sm opacity-90">
                وصول غير محدود لجميع الاختبارات والتدريب والتحليل — بدون خصم نقاط
              </p>
              <ul className="mt-3 space-y-1">
                {[
                  'جلسات محاكاة غير محدودة',
                  'تدريب ذكي AI بلا حدود',
                  'تحليل نتائج مجاني',
                  'شارة Diamond مميزة',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-4xl font-black">${diamondPrice}</p>
              <p className="text-sm opacity-80">/ {userDiamondPlan.durationMonths} شهر</p>
              <Button
                onClick={() => setShowDiamondPayment(!showDiamondPayment)}
                className="mt-3 bg-white/20 hover:bg-white/30 text-diamond-foreground font-bold px-8"
              >
                <CreditCard className="h-4 w-4 ml-2" />
                {showDiamondPayment ? 'إخفاء' : 'اشترك الآن'}
              </Button>
            </div>
          </div>

          {showDiamondPayment && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-6 rounded-xl bg-white/10 backdrop-blur-sm p-4"
            >
              <PayPalHostedCardFields
                orderType="diamond_plan"
                planId={userDiamondPlan.id}
                priceUSD={diamondPrice}
                description={userDiamondPlan.nameAr}
                onSuccess={() => setShowDiamondPayment(false)}
                onCancel={() => setShowDiamondPayment(false)}
              />
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t" />
        <span className="text-sm text-muted-foreground font-medium">أو اشترِ نقاط</span>
        <div className="flex-1 border-t" />
      </div>

      {/* Points packs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {userPacks.map((pack, i) => {
          const isSelected = selectedPackId === pack.id;
          return (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className={`relative rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover cursor-pointer ${
                pack.popular ? 'ring-2 ring-gold' : ''
              } ${isSelected ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedPackId(isSelected ? null : pack.id)}
            >
              {pack.popular && (
                <div className="absolute -top-3 right-4 rounded-full gradient-gold px-3 py-1 text-xs font-bold text-gold-foreground shadow-gold">
                  الأكثر شعبية
                </div>
              )}
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10">
                  <Coins className="h-7 w-7 text-gold" />
                </div>
                <h3 className="font-bold text-sm text-muted-foreground">
                  {pack.label}
                </h3>
                <p className="text-4xl font-black text-foreground mt-2">
                  {pack.points}
                </p>
                <p className="text-sm text-muted-foreground">نقطة</p>
                <p className="mt-3 text-2xl font-bold text-foreground">
                  ${pack.priceUSD}
                </p>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPackId(isSelected ? null : pack.id);
                  }}
                  className="mt-4 w-full gradient-gold text-gold-foreground font-bold hover:opacity-90"
                >
                  <CreditCard className="h-4 w-4 ml-2" />
                  {isSelected ? 'إلغاء' : 'شراء الآن'}
                </Button>
              </div>

              {isSelected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 border-t pt-4"
                >
                  <PayPalHostedCardFields
                    orderType="points_pack"
                    packId={pack.id}
                    pointsAmount={pack.points}
                    priceUSD={pack.priceUSD}
                    description={`شراء ${pack.points} نقطة - حزمة ${pack.label}`}
                    onSuccess={() => setSelectedPackId(null)}
                    onCancel={() => setSelectedPackId(null)}
                  />
                </motion.div>
              )}
            </motion.div>
          );
        })}

        {userPacks.length === 0 && (
          <div className="col-span-full rounded-2xl border bg-card p-12 text-center">
            <Coins className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-bold text-foreground">لا توجد حزم متاحة</p>
            <p className="text-sm text-muted-foreground mt-1">
              لا توجد حزم نقاط لدولتك حاليًا
            </p>
          </div>
        )}
      </div>

      {/* Payment info */}
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground text-center">
          💳 أدخل بيانات بطاقتك مباشرة — محمية بالكامل بواسطة PayPal. لا حاجة لحساب PayPal. النقاط تُضاف فورًا بعد تأكيد الدفع.
        </p>
      </div>
    </div>
  );
}