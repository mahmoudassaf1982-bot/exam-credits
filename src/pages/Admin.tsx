import { useState } from 'react';
import { Settings, BookOpen, Users, Save, Coins } from 'lucide-react';
import { mockSettings, mockExams, mockReferralEvents } from '@/data/mock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Admin() {
  const [settings, setSettings] = useState(mockSettings);
  const [exams, setExams] = useState(mockExams);

  const handleSaveSettings = () => {
    toast.success('تم حفظ الإعدادات بنجاح');
  };

  const handleSaveExamCosts = () => {
    toast.success('تم حفظ تكاليف الاختبارات بنجاح');
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

      <Tabs defaultValue="settings" dir="rtl">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">الإعدادات</span>
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">تكاليف الاختبارات</span>
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

        {/* Exam costs */}
        <TabsContent value="exams">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {exams.map((exam, idx) => (
              <div
                key={exam.id}
                className="rounded-2xl border bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold">{exam.nameAr}</h3>
                    <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                      {exam.name}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs">تكلفة جلسة المحاكاة</Label>
                    <Input
                      type="number"
                      value={exam.simulationSessionCostPoints}
                      onChange={(e) => {
                        const updated = [...exams];
                        updated[idx] = {
                          ...exam,
                          simulationSessionCostPoints: Number(e.target.value),
                        };
                        setExams(updated);
                      }}
                      min={0}
                      dir="ltr"
                      className="text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">تكلفة جلسة التدريب</Label>
                    <Input
                      type="number"
                      value={exam.practiceSessionCostPoints}
                      onChange={(e) => {
                        const updated = [...exams];
                        updated[idx] = {
                          ...exam,
                          practiceSessionCostPoints: Number(e.target.value),
                        };
                        setExams(updated);
                      }}
                      min={0}
                      dir="ltr"
                      className="text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">تكلفة التحليل</Label>
                    <Input
                      type="number"
                      value={exam.analysisCostPoints}
                      onChange={(e) => {
                        const updated = [...exams];
                        updated[idx] = {
                          ...exam,
                          analysisCostPoints: Number(e.target.value),
                        };
                        setExams(updated);
                      }}
                      min={0}
                      dir="ltr"
                      className="text-center"
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              onClick={handleSaveExamCosts}
              className="gradient-primary text-primary-foreground font-bold gap-2"
            >
              <Save className="h-4 w-4" />
              حفظ التكاليف
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
