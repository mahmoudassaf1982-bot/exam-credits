import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Plus, Pencil, Trash2 } from 'lucide-react';
import { mockDiamondPlans as initialPlans, countries } from '@/data/mock';
import type { DiamondPlan } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminPlans() {
  const [plans, setPlans] = useState<DiamondPlan[]>(initialPlans);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DiamondPlan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    countryId: 'sa',
    nameAr: '',
    priceUSD: 99,
    currency: 'SAR',
    durationMonths: 12,
  });

  const openCreate = () => {
    setEditingPlan(null);
    setForm({ countryId: 'sa', nameAr: '', priceUSD: 99, currency: 'SAR', durationMonths: 12 });
    setShowDialog(true);
  };

  const openEdit = (plan: DiamondPlan) => {
    setEditingPlan(plan);
    setForm({
      countryId: plan.countryId,
      nameAr: plan.nameAr,
      priceUSD: plan.priceUSD,
      currency: plan.currency,
      durationMonths: plan.durationMonths,
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.nameAr || form.priceUSD <= 0) {
      toast.error('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }
    if (editingPlan) {
      setPlans((prev) =>
        prev.map((p) => (p.id === editingPlan.id ? { ...p, ...form } : p))
      );
      toast.success('تم تحديث الخطة');
    } else {
      setPlans((prev) => [
        ...prev,
        {
          id: `plan-${Date.now()}`,
          ...form,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success('تم إضافة الخطة');
    }
    setShowDialog(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setPlans((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success('تم حذف الخطة');
      setDeleteId(null);
    }
  };

  const toggleActive = (id: string) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)));
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">خطط Diamond</h1>
          <p className="mt-1 text-muted-foreground">
            {plans.length} خطة · اشتراك سنوي بدون حدود
          </p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">خطة جديدة</span>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {plans.map((plan) => {
          const country = countries.find((c) => c.id === plan.countryId);
          return (
            <div
              key={plan.id}
              className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all relative overflow-hidden"
            >
              <div className="absolute inset-0 gradient-diamond opacity-5" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-diamond text-diamond-foreground">
                      <Crown className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{plan.nameAr}</h3>
                      <p className="text-xs text-muted-foreground">
                        {country?.flag} {country?.nameAr} · {plan.durationMonths} شهر
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(plan)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(plan.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black text-gradient-diamond" dir="ltr">
                    ${plan.priceUSD}
                  </span>
                  <span className="text-sm text-muted-foreground">/ سنة</span>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <p>✓ محاكاة غير محدودة</p>
                  <p>✓ تدريب ذكي غير محدود</p>
                  <p>✓ تحليل نتائج غير محدود</p>
                  <p>✓ شارة Diamond مميزة</p>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">مفعّلة</span>
                  <Switch checked={plan.isActive} onCheckedChange={() => toggleActive(plan.id)} />
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {plans.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Crown className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-lg font-bold">لا توجد خطط</p>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editingPlan ? 'تعديل الخطة' : 'خطة جديدة'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select value={form.countryId} onValueChange={(v) => {
                const c = countries.find((cc) => cc.id === v);
                setForm({ ...form, countryId: v, currency: c?.currency || 'USD' });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.flag} {c.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم الخطة</Label>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="Diamond سنوي - السعودية" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>السعر (USD)</Label>
                <Input type="number" value={form.priceUSD} onChange={(e) => setForm({ ...form, priceUSD: Number(e.target.value) })} min={0} dir="ltr" className="text-center" />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} dir="ltr" className="text-center font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>المدة (بالشهور)</Label>
              <Input type="number" value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })} min={1} dir="ltr" className="text-center" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">
              {editingPlan ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الخطة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذه الخطة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
