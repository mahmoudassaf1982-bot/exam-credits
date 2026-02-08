import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plus, Pencil, Trash2, Check, X as XIcon } from 'lucide-react';
import { countries as initialCountries } from '@/data/mock';
import type { Country } from '@/types';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminCountries() {
  const [countriesList, setCountriesList] = useState<Country[]>(initialCountries);
  const [showDialog, setShowDialog] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ id: '', name: '', nameAr: '', flag: '', currency: 'USD' });

  const openCreate = () => {
    setEditingCountry(null);
    setForm({ id: '', name: '', nameAr: '', flag: '', currency: 'USD' });
    setShowDialog(true);
  };

  const openEdit = (country: Country) => {
    setEditingCountry(country);
    setForm({
      id: country.id,
      name: country.name,
      nameAr: country.nameAr,
      flag: country.flag,
      currency: country.currency || 'USD',
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.nameAr || !form.id) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (editingCountry) {
      setCountriesList((prev) =>
        prev.map((c) =>
          c.id === editingCountry.id
            ? { ...c, name: form.name, nameAr: form.nameAr, flag: form.flag, currency: form.currency }
            : c
        )
      );
      toast.success('تم تحديث الدولة بنجاح');
    } else {
      if (countriesList.find((c) => c.id === form.id)) {
        toast.error('هذا الرمز مستخدم بالفعل');
        return;
      }
      setCountriesList((prev) => [
        ...prev,
        { id: form.id, name: form.name, nameAr: form.nameAr, flag: form.flag, currency: form.currency, isActive: true },
      ]);
      toast.success('تم إضافة الدولة بنجاح');
    }
    setShowDialog(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setCountriesList((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success('تم حذف الدولة');
      setDeleteId(null);
    }
  };

  const toggleActive = (id: string) => {
    setCountriesList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    );
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">إدارة الدول</h1>
          <p className="mt-1 text-muted-foreground">{countriesList.length} دولة مسجلة</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">دولة جديدة</span>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {countriesList.map((country) => (
          <div
            key={country.id}
            className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{country.flag}</span>
                <div>
                  <h3 className="font-bold text-foreground">{country.nameAr}</h3>
                  <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                    {country.id.toUpperCase()} · {country.currency || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(country)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(country.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">مفعّلة</span>
              <Switch checked={country.isActive ?? true} onCheckedChange={() => toggleActive(country.id)} />
            </div>
          </div>
        ))}
      </motion.div>

      {/* Create/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editingCountry ? 'تعديل الدولة' : 'إضافة دولة جديدة'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الرمز (ID)</Label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })}
                  placeholder="sa"
                  dir="ltr"
                  className="text-center font-mono"
                  disabled={!!editingCountry}
                />
              </div>
              <div className="space-y-2">
                <Label>العلم (Emoji)</Label>
                <Input
                  value={form.flag}
                  onChange={(e) => setForm({ ...form, flag: e.target.value })}
                  placeholder="🇸🇦"
                  className="text-center text-2xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الاسم بالعربي</Label>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="السعودية" />
            </div>
            <div className="space-y-2">
              <Label>الاسم بالإنجليزي</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Saudi Arabia" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>العملة</Label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="SAR" dir="ltr" className="text-center font-mono" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">
              {editingCountry ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الدولة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف هذه الدولة؟ سيتم حذف جميع البيانات المرتبطة بها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
