import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, Coins, Users, Filter, Bell, Loader2, Mail } from 'lucide-react';
import { mockSettings } from '@/data/mock';
import type { PlatformSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface ReferralRow {
  id: string;
  referrer_name: string;
  referred_name: string;
  referred_email: string;
  status: string;
  created_at: string;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(mockSettings);
  const [referralFilter, setReferralFilter] = useState<string>('all');
  const [adminEmail, setAdminEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(true);

  // Load admin notification email from DB
  useEffect(() => {
    const fetchAdminEmail = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'admin_notification_email')
        .single();
      if (data) setAdminEmail(data.value ?? '');
      setLoadingEmail(false);
    };
    fetchAdminEmail();
  }, []);

  // Load real referral data from transactions
  useEffect(() => {
    const fetchReferrals = async () => {
      setLoadingReferrals(true);
      // referral_bonus transactions for referrers have meta_json with referred_user_name
      const { data } = await supabase
        .from('transactions')
        .select('id, user_id, amount, reason, meta_json, created_at, type')
        .eq('reason', 'referral_bonus')
        .eq('type', 'credit')
        .order('created_at', { ascending: false });

      if (data) {
        // Filter only referrer bonuses (amount=30, meta has referred_user_name)
        const rows: ReferralRow[] = data
          .filter((t) => {
            const meta = t.meta_json as Record<string, string> | null;
            return meta && meta['referred_user_name'];
          })
          .map((t) => {
            const meta = t.meta_json as Record<string, string>;
            return {
              id: t.id,
              referrer_name: '—',
              referred_name: meta['referred_user_name'] ?? '—',
              referred_email: '—',
              status: 'rewarded',
              created_at: t.created_at,
            };
          });
        setReferrals(rows);
      }
      setLoadingReferrals(false);
    };
    fetchReferrals();
  }, []);

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    const { error } = await supabase
      .from('platform_settings')
      .update({ value: adminEmail })
      .eq('key', 'admin_notification_email');
    setSavingEmail(false);
    if (error) {
      toast.error('فشل حفظ البريد الإلكتروني');
    } else {
      toast.success('تم حفظ بريد التنبيهات بنجاح');
    }
  };

  const handleSave = () => {
    toast.success('تم حفظ الإعدادات بنجاح');
  };

  const filteredReferrals = referrals.filter((e) => {
    if (referralFilter === 'all') return true;
    return e.status === referralFilter;
  });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">الإعدادات</h1>
        <p className="mt-1 text-muted-foreground">إعدادات المنصة العامة وسجل الدعوات</p>
      </motion.div>

      <Tabs defaultValue="settings" dir="rtl">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">الإعدادات</span>
          </TabsTrigger>
          <TabsTrigger value="referrals" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">الدعوات</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">التنبيهات</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card p-6 shadow-card"
          >
            <h2 className="font-bold text-lg mb-6 flex items-center gap-2">
              <Coins className="h-5 w-5 text-gold" />
              إعدادات النقاط العامة
            </h2>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>نقاط هدية التسجيل</Label>
                <Input
                  type="number"
                  value={settings.signupBonusPoints}
                  onChange={(e) => setSettings({ ...settings, signupBonusPoints: Number(e.target.value) })}
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">النقاط الممنوحة عند إنشاء حساب جديد</p>
              </div>
              <div className="space-y-2">
                <Label>نقاط الداعي</Label>
                <Input
                  type="number"
                  value={settings.referrerBonusPoints}
                  onChange={(e) => setSettings({ ...settings, referrerBonusPoints: Number(e.target.value) })}
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">النقاط الممنوحة للشخص الداعي</p>
              </div>
              <div className="space-y-2">
                <Label>نقاط المدعو</Label>
                <Input
                  type="number"
                  value={settings.referredBonusPoints}
                  onChange={(e) => setSettings({ ...settings, referredBonusPoints: Number(e.target.value) })}
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">النقاط الممنوحة للصديق المدعو</p>
              </div>
            </div>

            <Button onClick={handleSave} className="mt-6 gradient-primary text-primary-foreground font-bold gap-2">
              <Save className="h-4 w-4" />
              حفظ الإعدادات
            </Button>
          </motion.div>
        </TabsContent>

        <TabsContent value="referrals">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card shadow-card overflow-hidden"
          >
            <div className="p-5 border-b flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-lg">جميع أحداث الدعوات</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {loadingReferrals ? 'جارٍ التحميل...' : `${filteredReferrals.length} دعوة مسجلة`}
                </p>
              </div>
              <Select value={referralFilter} onValueChange={setReferralFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 ml-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="rewarded">مكافأة</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loadingReferrals ? (
              <div className="p-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredReferrals.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">لا توجد دعوات حالياً</p>
                <p className="text-sm text-muted-foreground mt-1">لم يتم تسجيل أي دعوات بعد</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">المدعو</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">التاريخ</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredReferrals.map((event) => (
                        <tr key={event.id} className="hover:bg-muted/50 transition-colors">
                          <td className="p-3 text-sm">{event.referred_name}</td>
                          <td className="p-3 text-sm text-muted-foreground">{new Date(event.created_at).toLocaleDateString('ar-SA')}</td>
                          <td className="p-3">
                            <span className="rounded-full px-3 py-1 text-xs font-bold bg-success/10 text-success">
                              مكافأة مُنحت
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="sm:hidden divide-y">
                  {filteredReferrals.map((event) => (
                    <div key={event.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{event.referred_name}</span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-success/10 text-success">
                          مكافأة
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleDateString('ar-SA')}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card p-6 shadow-card space-y-6"
          >
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2 mb-1">
                <Bell className="h-5 w-5 text-primary" />
                إعدادات التنبيهات بالبريد الإلكتروني
              </h2>
              <p className="text-sm text-muted-foreground">
                سيتلقى هذا البريد إشعارات فورية عند تسجيل مستخدم جديد، أو إتمام عملية شراء نقاط، أو تفعيل اشتراك Diamond.
              </p>
            </div>

            <div className="space-y-2 max-w-md">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                بريد التنبيهات الإداري
              </Label>
              {loadingEmail ? (
                <div className="flex items-center gap-2 h-10 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ التحميل...
                </div>
              ) : (
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  dir="ltr"
                  className="text-left"
                />
              )}
              <p className="text-xs text-muted-foreground">
                اتركه فارغاً لتعطيل التنبيهات الإلكترونية.
              </p>
            </div>

            {adminEmail && (
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 flex items-center gap-3">
                <span className="text-success text-lg">✅</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">التنبيهات مفعّلة</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{adminEmail}</p>
                </div>
              </div>
            )}

            {/* What triggers notifications */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">الأحداث التي تُطلق التنبيهات:</p>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5">🆕</span>
                  <div>
                    <p className="text-sm font-medium">تسجيل مستخدم جديد</p>
                    <p className="text-xs text-muted-foreground">يحتوي على الاسم والدولة</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5">💰</span>
                  <div>
                    <p className="text-sm font-medium">شراء نقاط ناجح</p>
                    <p className="text-xs text-muted-foreground">يحتوي على اسم المستخدم وعدد النقاط والمبلغ</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5">💎</span>
                  <div>
                    <p className="text-sm font-medium">تفعيل اشتراك Diamond</p>
                    <p className="text-xs text-muted-foreground">يحتوي على تفاصيل المشترك والمبلغ</p>
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveEmail}
              disabled={savingEmail || loadingEmail}
              className="gradient-primary text-primary-foreground font-bold gap-2"
            >
              {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ بريد التنبيهات
            </Button>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
