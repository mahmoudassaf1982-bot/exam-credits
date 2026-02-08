import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { countries } from '@/data/mock';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get('ref') || '';
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    countryId: '',
    referralCode: refCode,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && !form.countryId) {
      toast.error('يرجى اختيار الدولة');
      return;
    }
    login();
    toast.success(mode === 'login' ? 'تم تسجيل الدخول بنجاح' : 'تم إنشاء الحساب بنجاح! حصلت على 20 نقطة هدية 🎉');
    navigate('/app');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-gold text-gold-foreground font-black text-2xl shadow-gold">
            S
          </div>
          <h1 className="text-2xl font-black text-foreground">Saris Exams</h1>
          <p className="text-sm text-muted-foreground mt-1">منصة الاختبارات المهنية</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-card">
          {/* Toggle */}
          <div className="mb-6 flex rounded-xl bg-muted p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <LogIn className="h-4 w-4" />
              تسجيل الدخول
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              حساب جديد
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">الاسم الكامل</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="أدخل اسمك"
                  required
                  className="text-right"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  dir="ltr"
                  className="text-left pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <Label>الدولة (لا يمكن تغييرها لاحقًا)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {countries.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setForm({ ...form, countryId: c.id })}
                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all ${
                          form.countryId === c.id
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:border-primary/30'
                        }`}
                      >
                        <span className="text-2xl">{c.flag}</span>
                        <span className="text-xs font-medium">{c.nameAr}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralCode">
                    كود الدعوة
                    <span className="text-muted-foreground font-normal mr-1">(اختياري)</span>
                  </Label>
                  <Input
                    id="referralCode"
                    value={form.referralCode}
                    onChange={(e) =>
                      setForm({ ...form, referralCode: e.target.value.toUpperCase() })
                    }
                    placeholder="مثال: AHMED24"
                    dir="ltr"
                    className="text-left font-mono"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground font-bold py-6 text-base"
            >
              {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </Button>
          </form>

          {mode === 'register' && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              عند التسجيل ستحصل على{' '}
              <span className="font-bold text-gold">20 نقطة هدية</span>{' '}
              لتجربة المنصة مجانًا 🎁
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="font-semibold text-primary hover:underline"
          >
            {mode === 'login' ? 'أنشئ حساب' : 'سجّل دخول'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
