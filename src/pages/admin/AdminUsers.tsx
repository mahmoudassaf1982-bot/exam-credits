import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Shield,
  User,
  Edit2,
  Coins,
  KeyRound,
  Ban,
  Trash2,
  ChevronDown,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  country_name: string;
  created_at: string;
  banned_until: string | null;
  balance: number;
  roles: string[];
}

type RoleFilter = 'all' | 'admin' | 'moderator' | 'user';

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير',
  moderator: 'محرر',
  user: 'مستخدم',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  moderator: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  user: 'bg-muted text-muted-foreground border-border',
};

async function callAdminUsers(action: string, method: 'GET' | 'POST', body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Balance dialog
  const [balanceDialog, setBalanceDialog] = useState<{ open: boolean; user?: AdminUser }>({ open: false });
  const [balanceDelta, setBalanceDelta] = useState('');
  const [balanceNote, setBalanceNote] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Delete/Ban confirm
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user?: AdminUser; action: 'ban' | 'unban' | 'delete' }>({ open: false, action: 'ban' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await callAdminUsers('list', 'GET');
      setUsers(data.users || []);
    } catch (err) {
      toast({ title: 'خطأ', description: 'فشل تحميل المستخدمين', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole =
        roleFilter === 'all' ||
        u.roles.includes(roleFilter) ||
        (roleFilter === 'user' && u.roles.length === 0);
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  const handleRoleChange = async (userId: string, role: string) => {
    setActionLoading(`role-${userId}`);
    try {
      await callAdminUsers('set_role', 'POST', { user_id: userId, role });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, roles: role === 'user' ? [] : [role] } : u))
      );
      toast({ title: 'تم تغيير الدور بنجاح' });
    } catch {
      toast({ title: 'خطأ', description: 'فشل تغيير الدور', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (email: string) => {
    setActionLoading(`reset-${email}`);
    try {
      await callAdminUsers('reset_password', 'POST', { email });
      toast({ title: 'تم إرسال رابط استعادة كلمة المرور', description: `تم إرسال البريد إلى ${email}` });
    } catch {
      toast({ title: 'خطأ', description: 'فشل إرسال رابط الاستعادة', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBalanceAdjust = async () => {
    if (!balanceDialog.user) return;
    const delta = parseInt(balanceDelta);
    if (isNaN(delta) || delta === 0) {
      toast({ title: 'أدخل قيمة صحيحة', variant: 'destructive' });
      return;
    }
    setBalanceLoading(true);
    try {
      const result = await callAdminUsers('adjust_balance', 'POST', {
        user_id: balanceDialog.user.id,
        delta,
        reason: balanceNote,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === balanceDialog.user!.id ? { ...u, balance: result.new_balance } : u))
      );
      toast({ title: 'تم تعديل الرصيد بنجاح', description: `الرصيد الجديد: ${result.new_balance} نقطة` });
      setBalanceDialog({ open: false });
      setBalanceDelta('');
      setBalanceNote('');
    } catch {
      toast({ title: 'خطأ', description: 'فشل تعديل الرصيد', variant: 'destructive' });
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleBanDelete = async () => {
    const { user, action } = deleteDialog;
    if (!user) return;
    setActionLoading(`${action}-${user.id}`);
    try {
      if (action === 'delete') {
        await callAdminUsers('delete_user', 'POST', { user_id: user.id });
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        toast({ title: 'تم حذف المستخدم' });
      } else {
        await callAdminUsers('ban_user', 'POST', { user_id: user.id, ban: action === 'ban' });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, banned_until: action === 'ban' ? '2099-01-01' : null } : u
          )
        );
        toast({ title: action === 'ban' ? 'تم حظر المستخدم' : 'تم رفع الحظر' });
      }
      setDeleteDialog({ open: false, action: 'ban' });
    } catch {
      toast({ title: 'خطأ', description: 'فشلت العملية', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const getPrimaryRole = (roles: string[]) => {
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('moderator')) return 'moderator';
    return 'user';
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} مستخدم {roleFilter !== 'all' ? `(${ROLE_LABELS[roleFilter]})` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsers}
          disabled={loading}
          className="gap-2 self-start"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          تحديث
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 text-right"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="فلترة بالدور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأدوار</SelectItem>
            <SelectItem value="admin">المديرون فقط</SelectItem>
            <SelectItem value="moderator">المحررون فقط</SelectItem>
            <SelectItem value="user">المستخدمون فقط</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <User className="h-12 w-12 opacity-30" />
          <p>لا يوجد مستخدمون</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">المستخدم</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">الدور</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">الرصيد</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">تاريخ الانضمام</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">الحالة</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, idx) => {
                  const primaryRole = getPrimaryRole(u.roles);
                  const isBanned = !!u.banned_until && u.banned_until > new Date().toISOString();
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                      )}
                    >
                      {/* User info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{u.name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="py-3 px-4">
                        {actionLoading === `role-${u.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Select
                            value={primaryRole}
                            onValueChange={(v) => handleRoleChange(u.id, v)}
                            disabled={isSelf}
                          >
                            <SelectTrigger className={cn('h-7 text-xs w-32 border', ROLE_COLORS[primaryRole])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مدير</SelectItem>
                              <SelectItem value="moderator">محرر</SelectItem>
                              <SelectItem value="user">مستخدم</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      {/* Balance */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-amber-500">{u.balance.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground mr-1">نقطة</span>
                      </td>
                      {/* Date */}
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(u.created_at).toLocaleDateString('ar-SA')}
                      </td>
                      {/* Status */}
                      <td className="py-3 px-4">
                        {isBanned ? (
                          <Badge variant="destructive" className="text-xs">محظور</Badge>
                        ) : (
                          <div className="flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="text-xs">نشط</span>
                          </div>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                            title="تعديل الرصيد"
                            onClick={() => { setBalanceDialog({ open: true, user: u }); setBalanceDelta(''); setBalanceNote(''); }}
                          >
                            <Coins className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                            title="إعادة تعيين كلمة المرور"
                            disabled={actionLoading === `reset-${u.email}`}
                            onClick={() => handleResetPassword(u.email)}
                          >
                            {actionLoading === `reset-${u.email}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {!isSelf && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={cn(
                                  'h-7 w-7 p-0',
                                  isBanned
                                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                                    : 'text-orange-500 hover:text-orange-400 hover:bg-orange-500/10'
                                )}
                                title={isBanned ? 'رفع الحظر' : 'حظر المستخدم'}
                                onClick={() => setDeleteDialog({ open: true, user: u, action: isBanned ? 'unban' : 'ban' })}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="حذف المستخدم"
                                onClick={() => setDeleteDialog({ open: true, user: u, action: 'delete' })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map((u) => {
              const primaryRole = getPrimaryRole(u.roles);
              const isBanned = !!u.banned_until && u.banned_until > new Date().toISOString();
              const isSelf = u.id === currentUser?.id;
              return (
                <div key={u.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{u.name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <Badge className={cn('text-xs border', ROLE_COLORS[primaryRole])}>
                      {ROLE_LABELS[primaryRole]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">الرصيد:</span>
                    <span className="font-mono font-semibold text-amber-500">{u.balance.toLocaleString()} نقطة</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => { setBalanceDialog({ open: true, user: u }); setBalanceDelta(''); setBalanceNote(''); }}>
                      <Coins className="h-3 w-3" /> تعديل الرصيد
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => handleResetPassword(u.email)}>
                      <KeyRound className="h-3 w-3" /> إعادة كلمة المرور
                    </Button>
                    {!isSelf && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                        onClick={() => setDeleteDialog({ open: true, user: u, action: 'delete' })}>
                        <Trash2 className="h-3 w-3" /> حذف
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Balance Dialog */}
      <Dialog open={balanceDialog.open} onOpenChange={(o) => setBalanceDialog({ open: o })}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل رصيد النقاط</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">المستخدم</p>
              <p className="font-medium">{balanceDialog.user?.name} ({balanceDialog.user?.email})</p>
              <p className="text-sm text-muted-foreground mt-1">
                الرصيد الحالي: <span className="text-amber-500 font-semibold">{balanceDialog.user?.balance} نقطة</span>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                المبلغ (موجب للإضافة، سالب للخصم)
              </label>
              <Input
                type="number"
                placeholder="مثال: 50 أو -20"
                value={balanceDelta}
                onChange={(e) => setBalanceDelta(e.target.value)}
                className="text-right"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظة (اختياري)</label>
              <Input
                placeholder="سبب التعديل..."
                value={balanceNote}
                onChange={(e) => setBalanceNote(e.target.value)}
                className="text-right"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBalanceDialog({ open: false })}>إلغاء</Button>
            <Button onClick={handleBalanceAdjust} disabled={balanceLoading} className="gap-2">
              {balanceLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban/Delete Confirm */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog((p) => ({ ...p, open: o }))}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog.action === 'delete' ? 'حذف المستخدم' :
               deleteDialog.action === 'ban' ? 'حظر المستخدم' : 'رفع الحظر'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.action === 'delete'
                ? `هل أنت متأكد من حذف المستخدم "${deleteDialog.user?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
                : deleteDialog.action === 'ban'
                ? `سيتم حظر المستخدم "${deleteDialog.user?.name}" ومنعه من تسجيل الدخول.`
                : `سيتم رفع الحظر عن المستخدم "${deleteDialog.user?.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanDelete}
              className={deleteDialog.action === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {deleteDialog.action === 'delete' ? 'حذف نهائياً' :
               deleteDialog.action === 'ban' ? 'حظر' : 'رفع الحظر'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
