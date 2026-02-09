import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Coins, Crown, Sparkles, Loader2, CreditCard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { mockPointsPacks, mockDiamondPlans } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { usePayPal } from '@/hooks/usePayPal';

export default function TopUp() {
  const { user, updateBalance } = useAuth();
  const { createOrder, captureOrder, loading: paypalLoading } = usePayPal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [processingPackId, setProcessingPackId] = useState<string | null>(null);
  const [processingDiamond, setProcessingDiamond] = useState(false);

  const userPacks = mockPointsPacks.filter(
    (p) => p.countryId === user?.countryId
  );

  const userDiamondPlan = mockDiamondPlans.find(
    (p) => p.countryId === user?.countryId && p.isActive
  );

  // Handle PayPal return
  useEffect(() => {
    const status = searchParams.get('status');
    const token = searchParams.get('token'); // PayPal order ID

    if (status === 'success' && token) {
      // Capture the order
      captureOrder(token).then((result) => {
        if (result?.success) {
          if (result.points_credited) {
            updateBalance(result.points_credited);
          }
        }
        // Clean URL params
        setSearchParams({}, { replace: true });
      });
    } else if (status === 'cancelled') {
      toast.error('تم إلغاء عملية الدفع');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleBuyPack = async (pack: typeof mockPointsPacks[0]) => {
    setProcessingPackId(pack.id);
    await createOrder({
      order_type: 'points_pack',
      pack_id: pack.id,
      points_amount: pack.points,
      price_usd: pack.priceUSD,
      description: `شراء ${pack.points} نقطة - حزمة ${pack.label}`,
    });
    setProcessingPackId(null);
  };

  const handleBuyDiamond = async () => {
    setProcessingDiamond(true);
    const plan = userDiamondPlan;
    await createOrder({
      order_type: 'diamond_plan',
      plan_id: plan?.id,
      price_usd: plan?.priceUSD ?? 99,
      description: plan?.nameAr ?? 'اشتراك Diamond سنوي',
    });
    setProcessingDiamond(false);
  };

  const diamondPrice = userDiamondPlan?.priceUSD ?? 99;

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

      {/* PayPal processing indicator */}
      {paypalLoading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            جارٍ معالجة الدفع عبر PayPal...
          </p>
        </motion.div>
      )}

      {/* Diamond subscription */}
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
              <h2 className="text-2xl font-black">Diamond Yearly</h2>
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
            <p className="text-sm opacity-80">/ سنة</p>
            <Button
              onClick={handleBuyDiamond}
              disabled={processingDiamond || paypalLoading}
              className="mt-3 bg-white/20 hover:bg-white/30 text-diamond-foreground font-bold px-8"
            >
              {processingDiamond ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <CreditCard className="h-4 w-4 ml-2" />
              )}
              {processingDiamond ? 'جارٍ التحويل...' : 'اشترك عبر PayPal'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t" />
        <span className="text-sm text-muted-foreground font-medium">أو اشترِ نقاط</span>
        <div className="flex-1 border-t" />
      </div>

      {/* Points packs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {userPacks.map((pack, i) => {
          const isProcessing = processingPackId === pack.id;
          return (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className={`relative rounded-2xl border bg-card p-5 shadow-card transition-all hover:shadow-card-hover ${
                pack.popular ? 'ring-2 ring-gold' : ''
              }`}
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
                  onClick={() => handleBuyPack(pack)}
                  disabled={isProcessing || paypalLoading}
                  className="mt-4 w-full gradient-gold text-gold-foreground font-bold hover:opacity-90"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      جارٍ التحويل...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 ml-2" />
                      شراء عبر PayPal
                    </>
                  )}
                </Button>
              </div>
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
          💳 الدفع يتم عبر PayPal بشكل آمن. النقاط تُضاف فورًا بعد تأكيد الدفع.
        </p>
      </div>
    </div>
  );
}
