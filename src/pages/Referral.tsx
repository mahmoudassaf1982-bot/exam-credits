import { useState, useEffect } from 'react';
import { Copy, Check, Gift, Users, Clock, Share2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { mockSettings } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ReferralTransaction {
  id: string;
  referred_name: string;
  created_at: string;
  status: 'rewarded';
}

export default function Referral() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [referrals, setReferrals] = useState<ReferralTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink = `${window.location.origin}/auth/register?ref=${user?.referralCode}`;

  useEffect(() => {
    const fetchReferrals = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      // Get referral bonus transactions for this user (as referrer: amount=30)
      const { data } = await supabase
        .from('transactions')
        .select('id, meta_json, created_at')
        .eq('user_id', session.user.id)
        .eq('reason', 'referral_bonus')
        .eq('type', 'credit')
        .order('created_at', { ascending: false });

      if (data) {
        const rows: ReferralTransaction[] = data
          .filter((t) => {
            const meta = t.meta_json as Record<string, string> | null;
            return meta && meta['referred_user_name'];
          })
          .map((t) => {
            const meta = t.meta_json as Record<string, string>;
            return {
              id: t.id,
              referred_name: meta['referred_user_name'] ?? '—',
              created_at: t.created_at,
              status: 'rewarded',
            };
          });
        setReferrals(rows);
      }
      setLoading(false);
    };
    fetchReferrals();
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('تم نسخ رابط الدعوة');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Saris Exams - ادعوني اشتركت!',
        text: `سجّل في Saris Exams واحصل على ${mockSettings.referredBonusPoints} نقاط مجانية!`,
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const totalPoints = referrals.length * mockSettings.referrerBonusPoints;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">
          دعوة صديق
        </h1>
        <p className="mt-1 text-muted-foreground">
          ادعُ أصدقاءك واحصل على نقاط مجانية لكليكما
        </p>
      </motion.div>

      {/* Referral link card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border bg-card p-6 shadow-card"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success text-success-foreground">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg">رابط الدعوة الخاص بك</h2>
            <p className="text-sm text-muted-foreground">
              شاركه مع أصدقائك وزملائك
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-xl bg-muted px-4 py-3 font-mono text-sm text-foreground overflow-x-auto" dir="ltr">
            {referralLink}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={copyLink}
              variant="outline"
              className="gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'تم النسخ' : 'نسخ'}
            </Button>
            <Button
              onClick={shareLink}
              className="gap-2 gradient-primary text-primary-foreground"
            >
              <Share2 className="h-4 w-4" />
              مشاركة
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted/50 p-4">
          <p className="text-sm font-medium text-foreground mb-2">كود الدعوة:</p>
          <p className="text-2xl font-black tracking-widest text-primary" dir="ltr">
            {user?.referralCode}
          </p>
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border bg-card p-6 shadow-card"
      >
        <h2 className="font-bold text-lg mb-4">كيف تعمل الدعوة؟</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              1
            </div>
            <div>
              <p className="font-semibold text-sm">شارك الرابط</p>
              <p className="text-xs text-muted-foreground mt-1">
                أرسل رابط الدعوة لأصدقائك
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              2
            </div>
            <div>
              <p className="font-semibold text-sm">صديقك يسجّل ويشتري</p>
              <p className="text-xs text-muted-foreground mt-1">
                يكمل التسجيل ثم يشتري نقاط أو Diamond
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-gold text-gold-foreground text-sm font-bold flex-shrink-0">
              3
            </div>
            <div>
              <p className="font-semibold text-sm">تحصلان على نقاط</p>
              <p className="text-xs text-muted-foreground mt-1">
                أنت تحصل على {mockSettings.referrerBonusPoints} نقطة وصديقك {mockSettings.referredBonusPoints} نقطة
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <StatsCard
          title="دعوات ناجحة"
          value={loading ? '...' : referrals.length}
          icon={Users}
          variant="success"
        />
        <StatsCard
          title="نقاط مكتسبة"
          value={loading ? '...' : totalPoints}
          subtitle="من الدعوات"
          icon={Gift}
          variant="gold"
        />
      </motion.div>

      {/* Referral events */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border bg-card shadow-card overflow-hidden"
      >
        <div className="p-5 border-b">
          <h2 className="font-bold text-lg">سجل الدعوات</h2>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : referrals.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">لا توجد دعوات حالياً</p>
              <p className="text-sm mt-1">شارك رابطك مع أصدقائك للبدء</p>
            </div>
          ) : (
            referrals.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {event.referred_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {event.referred_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-bold bg-success/10 text-success">
                  ✅ مكافأة مُنحت
                </span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
