import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, BookOpen, Users, Save, Coins, Layers } from 'lucide-react';
import { mockSettings, mockReferralEvents } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Admin() {
  const [settings, setSettings] = useState(mockSettings);

  const handleSaveSettings = () => {
    toast.success('تم حفظ الإعدادات بنجاح');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">الإدارة</h1>
        <p className="mt-1 text-muted-foreground">إعدادات المنصة وإدارة النقاط</p>
      </motion.div>

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Link
          to="/app/admin/exams"
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all group"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
            <Layers className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
              هيكل الاختبارات
            </h3>
            <p className="text-sm text-muted-foreground">
              إدارة الاختبارات والأقسام حسب الدولة
            </p>
          </div>
          <BookOpen className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>
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

        {/* Settings */}
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
                <Label>نقاط هدية التسجيل (Signup Bonus)</Label>
                <Input
                  type="number"
                  value={settings.signupBonusPoints}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      signupBonusPoints: Number(e.target.value),
                    })
                  }
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">
                  النقاط الممنوحة عند إنشاء حساب جديد
                </p>
              </div>

              <div className="space-y-2">
                <Label>نقاط الداعي (Referrer Bonus)</Label>
                <Input
                  type="number"
                  value={settings.referrerBonusPoints}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      referrerBonusPoints: Number(e.target.value),
                    })
                  }
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">
                  النقاط الممنوحة للشخص الداعي
                </p>
              </div>

              <div className="space-y-2">
                <Label>نقاط المدعو (Referred Bonus)</Label>
                <Input
                  type="number"
                  value={settings.referredBonusPoints}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      referredBonusPoints: Number(e.target.value),
                    })
                  }
                  min={0}
                  dir="ltr"
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">
                  النقاط الممنوحة للصديق المدعو
                </p>
              </div>
            </div>

            <Button
              onClick={handleSaveSettings}
              className="mt-6 gradient-primary text-primary-foreground font-bold gap-2"
            >
              <Save className="h-4 w-4" />
              حفظ الإعدادات
            </Button>
          </motion.div>
        </TabsContent>

        {/* Referral events */}
        <TabsContent value="referrals">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card shadow-card overflow-hidden"
          >
            <div className="p-5 border-b">
              <h2 className="font-bold text-lg">جميع أحداث الدعوات</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mockReferralEvents.length} دعوة مسجلة
              </p>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
                      الداعي
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
                      المدعو
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
                      البريد
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
                      التاريخ
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
                      الحالة
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mockReferralEvents.map((event) => (
                    <tr
                      key={event.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-3 text-sm font-medium">
                        {event.referrerName}
                      </td>
                      <td className="p-3 text-sm">
                        {event.referredUserName}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground font-mono text-xs" dir="ltr">
                        {event.referredUserEmail}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(event.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            event.status === 'rewarded'
                              ? 'bg-success/10 text-success'
                              : 'bg-gold/10 text-gold-foreground'
                          }`}
                        >
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
              {mockReferralEvents.map((event) => (
                <div key={event.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {event.referrerName} → {event.referredUserName}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        event.status === 'rewarded'
                          ? 'bg-success/10 text-success'
                          : 'bg-gold/10 text-gold-foreground'
                      }`}
                    >
                      {event.status === 'rewarded' ? 'مكافأة' : 'انتظار'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString('ar-SA')}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
