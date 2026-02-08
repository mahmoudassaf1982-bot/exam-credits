import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, Coins, Users, Filter } from 'lucide-react';
import { mockSettings, mockReferralEvents } from '@/data/mock';
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

export default function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(mockSettings);
  const [referralFilter, setReferralFilter] = useState<string>('all');

  const handleSave = () => {
    toast.success('تم حفظ الإعدادات بنجاح');
  };

  const filteredReferrals = mockReferralEvents.filter((e) => {
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
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-grid">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">الإعدادات</span>
          </TabsTrigger>
          <TabsTrigger value="referrals" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">الدعوات</span>
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
                <p className="text-sm text-muted-foreground mt-1">{filteredReferrals.length} دعوة {referralFilter !== 'all' ? `(${referralFilter === 'rewarded' ? 'مكافأة' : 'قيد الانتظار'})` : 'مسجلة'}</p>
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

            {filteredReferrals.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-bold text-foreground">لا توجد دعوات</p>
                <p className="text-sm text-muted-foreground mt-1">لم يتم تسجيل أي دعوات بعد</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">الداعي</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">المدعو</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">البريد</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">التاريخ</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredReferrals.map((event) => (
                        <tr key={event.id} className="hover:bg-muted/50 transition-colors">
                          <td className="p-3 text-sm font-medium">{event.referrerName}</td>
                          <td className="p-3 text-sm">{event.referredUserName}</td>
                          <td className="p-3 text-sm text-muted-foreground font-mono text-xs" dir="ltr">{event.referredUserEmail}</td>
                          <td className="p-3 text-sm text-muted-foreground">{new Date(event.createdAt).toLocaleDateString('ar-SA')}</td>
                          <td className="p-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${event.status === 'rewarded' ? 'bg-success/10 text-success' : 'bg-gold/10 text-gold-foreground'}`}>
                              {event.status === 'rewarded' ? 'مكافأة' : 'قيد الانتظار'}
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
                        <span className="text-sm font-medium">{event.referrerName} → {event.referredUserName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${event.status === 'rewarded' ? 'bg-success/10 text-success' : 'bg-gold/10 text-gold-foreground'}`}>
                          {event.status === 'rewarded' ? 'مكافأة' : 'انتظار'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleDateString('ar-SA')}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
