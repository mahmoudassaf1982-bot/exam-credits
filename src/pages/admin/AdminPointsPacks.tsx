import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Plus, Pencil, Trash2, Star } from 'lucide-react';
import { mockPointsPacks as initialPacks, countries } from '@/data/mock';
import type { PointsPack } from '@/types';
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

export default function AdminPointsPacks() {
  const [packs, setPacks] = useState<PointsPack[]>(initialPacks);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPack, setEditingPack] = useState<PointsPack | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ countryId: 'sa', points: 0, priceUSD: 0, label: '', popular: false });

  const openCreate = () => {
    setEditingPack(null);
    setForm({ countryId: 'sa', points: 0, priceUSD: 0, label: '', popular: false });
    setShowDialog(true);
  };

  const openEdit = (pack: PointsPack) => {
    setEditingPack(pack);
    setForm({ countryId: pack.countryId, points: pack.points, priceUSD: pack.priceUSD, label: pack.label, popular: pack.popular || false });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.label || form.points <= 0 || form.priceUSD <= 0) {
      toast.error('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }
    if (editingPack) {
      setPacks((prev) => prev.map((p) => p.id === editingPack.id ? { ...p, ...form } : p));
      toast.success('تم تحديث الحزمة');
    } else {
      setPacks((prev) => [...prev, { id: `pack-${Date.now()}`, ...form, isActive: true }]);
      toast.success('تم إضافة الحزمة');
    }
    setShowDialog(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setPacks((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success('تم حذف الحزمة');
      setDeleteId(null);
    }
  };

  const toggleActive = (id: string) => {
    setPacks((prev) => prev.map((p) => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  // Group by country
  const grouped = countries
    .map((c) => ({ country: c, items: packs.filter((p) => p.countryId === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">حزم النقاط</h1>
          <p className="mt-1 text-muted-foreground">{packs.length} حزمة</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">حزمة جديدة</span>
        </Button>
      </motion.div>

      {grouped.map(({ country, items }) => (
        <motion.div key={country.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{country.flag}</span>
            <h2 className="font-bold">{country.nameAr}</h2>
            <span className="text-sm text-muted-foreground">({items.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((pack) => (
              <div key={pack.id} className={`rounded-2xl border bg-card p-4 shadow-card hover:shadow-card-hover transition-all relative ${pack.popular ? 'ring-2 ring-gold' : ''}`}>
                {pack.popular && (
                  <div className="absolute -top-2 right-3 rounded-full gradient-gold px-2 py-0.5 text-[10px] font-bold text-gold-foreground flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    الأكثر شعبية
                  </div>
                )}
                <div className="flex items-start justify-between mt-1">
                  <div>
                    <p className="font-bold text-foreground">{pack.label}</p>
                    <p className="text-2xl font-black text-primary mt-1">{pack.points}</p>
                    <p className="text-xs text-muted-foreground">نقطة</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(pack)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(pack.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-gold" dir="ltr">${pack.priceUSD}</span>
                  <Switch checked={pack.isActive ?? true} onCheckedChange={() => toggleActive(pack.id)} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {packs.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Coins className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-lg font-bold">لا توجد حزم</p>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingPack ? 'تعديل الحزمة' : 'حزمة جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select value={form.countryId} onValueChange={(v) => setForm({ ...form, countryId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (<SelectItem key={c.id} value={c.id}>{c.flag} {c.nameAr}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم الحزمة</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="مثال: أساسي" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عدد النقاط</Label>
                <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} min={1} dir="ltr" className="text-center" />
              </div>
              <div className="space-y-2">
                <Label>السعر (USD)</Label>
                <Input type="number" value={form.priceUSD} onChange={(e) => setForm({ ...form, priceUSD: Number(e.target.value) })} min={0} step={0.01} dir="ltr" className="text-center" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <Label className="cursor-pointer">الأكثر شعبية</Label>
              <Switch checked={form.popular} onCheckedChange={(v) => setForm({ ...form, popular: v })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">{editingPack ? 'تحديث' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الحزمة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذه الحزمة؟</AlertDialogDescription>
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
