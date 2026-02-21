import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Country {
  id: string;
  name: string;
  name_ar: string;
  flag: string;
  currency: string;
  is_active: boolean;
}

export default function AdminCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ id: '', name: '', name_ar: '', flag: '', currency: 'USD' });

  const fetchCountries = async () => {
    const { data, error } = await supabase.from('countries').select('*').order('created_at');
    if (error) toast.error('خطأ في تحميل الدول');
    else setCountries(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCountries(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ id: '', name: '', name_ar: '', flag: '', currency: 'USD' });
    setShowDialog(true);
  };

  const openEdit = (c: Country) => {
    setEditing(c);
    setForm({ id: c.id, name: c.name, name_ar: c.name_ar, flag: c.flag, currency: c.currency });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.id) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (editing) {
      const { error } = await supabase.from('countries').update({
        name: form.name, name_ar: form.name_ar, flag: form.flag, currency: form.currency,
      }).eq('id', editing.id);
      if (error) toast.error('خطأ في التحديث');
      else { toast.success('تم تحديث الدولة'); setShowDialog(false); fetchCountries(); }
    } else {
      const { error } = await supabase.from('countries').insert({
        id: form.id.toLowerCase(), name: form.name, name_ar: form.name_ar, flag: form.flag, currency: form.currency,
      });
      if (error) toast.error(error.message.includes('duplicate') ? 'هذا الرمز مستخدم بالفعل' : 'خطأ في الإضافة');
      else { toast.success('تم إضافة الدولة'); setShowDialog(false); fetchCountries(); }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Safety check: prevent deleting if country has exams
    const { count } = await supabase.from('exam_templates').select('id', { count: 'exact', head: true }).eq('country_id', deleteId);
    if (count && count > 0) {
      toast.error(`لا يمكن حذف هذه الدولة لأنها تحتوي على ${count} اختبار(ات). احذف الاختبارات أولاً.`);
      setDeleteId(null); return;
    }
    const { error } = await supabase.from('countries').delete().eq('id', deleteId);
    if (error) toast.error('خطأ في الحذف');
    else { toast.success('تم حذف الدولة'); fetchCountries(); }
    setDeleteId(null);
  };

  const toggleActive = async (c: Country) => {
    await supabase.from('countries').update({ is_active: !c.is_active }).eq('id', c.id);
    fetchCountries();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">إدارة الدول</h1>
          <p className="mt-1 text-muted-foreground">{countries.length} دولة مسجلة</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground font-bold gap-2">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">دولة جديدة</span>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {countries.map((c) => (
          <div key={c.id} className="rounded-2xl border bg-card p-5 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{c.flag}</span>
                <div>
                  <h3 className="font-bold text-foreground">{c.name_ar}</h3>
                  <p className="text-xs text-muted-foreground font-mono" dir="ltr">{c.id.toUpperCase()} · {c.currency}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">مفعّلة</span>
              <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
            </div>
          </div>
        ))}
        {countries.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>لا توجد دول مسجلة بعد</p>
          </div>
        )}
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">{editing ? 'تعديل الدولة' : 'إضافة دولة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الرمز (ID)</Label>
                <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} placeholder="sa" dir="ltr" className="text-center font-mono" disabled={!!editing} />
              </div>
              <div className="space-y-2">
                <Label>العلم (Emoji)</Label>
                <Input value={form.flag} onChange={(e) => setForm({ ...form, flag: e.target.value })} placeholder="🇸🇦" className="text-center text-2xl" />
              </div>
            </div>
            <div className="space-y-2"><Label>الاسم بالعربي *</Label><Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="السعودية" /></div>
            <div className="space-y-2"><Label>الاسم بالإنجليزي</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Saudi Arabia" dir="ltr" /></div>
            <div className="space-y-2"><Label>العملة</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="SAR" dir="ltr" className="text-center font-mono" /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} className="flex-1 gradient-primary text-primary-foreground font-bold">{editing ? 'تحديث' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الدولة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذه الدولة؟ سيتم حذف جميع البيانات المرتبطة بها.</AlertDialogDescription>
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