import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Eye, EyeOff, UserPlus, LogIn, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { countries } from '@/data/mock';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// ---- Email Validation ----
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const ALLOWED_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com',
  'aol.com',
  'zoho.com',
  'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.net', 'gmx.de',
  'mail.com',
  'tutanota.com',
  'fastmail.com',
  'pm.me',
  // Arabic region common providers
  'hotmail.com', 'outlook.sa',
];

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', 'temp-mail.org', 'throwam.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
  'guerrillamail.org', 'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.net',
  'dispostable.com', 'mailnull.com', 'maildrop.cc', 'spamgourmet.com', 'spamgourmet.net',
  'tempmail.com', 'temp-mail.ru', 'tmpmail.org', 'tmpmail.net', 'throwam.com',
  'fakeinbox.com', 'mailcatch.com', 'trashmail.at', 'discard.email', 'tempinbox.com',
  'mailsiphon.com', 'spambog.com', 'spambog.de', 'spambog.ru', 'binkmail.com',
  'safetymail.info', 'spamevader.com', 'spamfree24.org', 'spamthisplease.com',
  'spamdecoy.net', 'spamherelots.com', 'hailmail.net', 'ieatspam.eu', 'ieatspam.info',
  'jetable.fr.nf', 'kasmail.com', 'klassmaster.com', 'klzlk.com', 'kurzepost.de',
  'lopl.co.cc', 'lortemail.dk', 'lol.ovpn.to', 'mail.mezimages.net', 'mailbidon.com',
  'mailblocks.com', 'mailbucket.org', 'mailchop.com', 'mailexpire.com', 'mailme.lv',
  'mailmetrash.com', 'mailnew.com', 'mailscrap.com', 'mailshuttle.com', 'mailsiphon.com',
  'mailslapping.com', 'mailslite.com', 'mailtemporaire.fr', 'mailtrash.net', 'mailtv.tv',
  'mailtv.net', 'mailzilla.com', 'mailzilla.org', 'monemail.fr.nf', 'monumentmail.com',
  'mt2009.com', 'mt2014.com', 'mytrashmail.com', 'mytrashmail.net',
  'noclickemail.com', 'nogmailspam.info', 'nospam.ze.tc', 'nospam4.us', 'notsharingmy.info',
  'nowmymail.com', 'objectmail.com', 'obobbo.com', 'odaymail.com', 'onewaymail.com',
  'rppkn.com', 'rtrtr.com', 's0ny.net', 'safe-mail.net', 'sandelf.de', 'saynotospams.com',
  'shitmail.me', 'shitmail.org', 'shortmail.net', 'sibmail.com', 'sneakemail.com',
  'sofimail.com', 'sogetthis.com', 'soodonims.com', 'spam.la', 'spamavert.com',
  'spambox.info', 'spambox.us', 'spamcero.com', 'spamcon.org', 'spamcorptastic.com',
  'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org', 'spamday.com', 'spamex.com',
  'tempail.com', 'tempe-mail.com', 'tempemail.co.za', 'tempemail.com', 'tempemail.net',
];

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return 'صيغة البريد الإلكتروني غير صحيحة (مثال صحيح: name@gmail.com)';
  }
  const domain = trimmed.split('@')[1];
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return 'لا يُسمح باستخدام إيميلات مؤقتة أو وهمية';
  }
  return null;
}

export default function Auth() {
  const location = useLocation();
  const initialMode = location.pathname === '/auth/register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get('ref') || '';
  const navigate = useNavigate();
  const { login, signup, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) navigate('/app');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'register') setMode('register');
    else if (location.pathname === '/auth/register') setMode('register');
  }, [location.pathname, searchParams]);

  const [showSuccess, setShowSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    countryId: '',
    referralCode: refCode,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Email validation for both login and register
    const emailError = validateEmail(form.email);
    if (emailError) {
      toast.error(emailError);
      return;
    }

    if (mode === 'register' && !form.countryId) {
      toast.error('يرجى اختيار الدولة');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const result = await login(form.email, form.password);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('تم تسجيل الدخول بنجاح');
          navigate('/app');
        }
      } else {
        const country = countries.find(c => c.id === form.countryId);
        const result = await signup(form.email, form.password, {
          name: form.name,
          country_id: form.countryId,
          country_name: country?.nameAr || '',
          referral_code: form.referralCode || undefined,
        });
        if (result.error) {
          toast.error(result.error);
        } else {
          // Auto-confirm is enabled: show success screen then redirect
          setShowSuccess(true);
          setTimeout(() => {
            navigate('/app');
          }, 2500);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!form.email) {
      toast.error('أدخل بريدك الإلكتروني أولاً');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) toast.error(error.message);
    else toast.success('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
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

        {/* Success Screen */}
        {showSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border bg-card p-8 shadow-card text-center space-y-5"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground">أهلاً بك في SARIS Exams!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              تم إنشاء حسابك بنجاح، جاري تحويلك للوحة التحكم...
            </p>
            <div className="flex items-center justify-center gap-2 text-primary text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جاري التحويل...</span>
            </div>
          </motion.div>
        ) : (
        /* Card */
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
                  minLength={6}
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
              {mode === 'login' && (
                <div className="text-left">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}
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
              disabled={submitting}
              className="w-full gradient-primary text-primary-foreground font-bold py-6 text-base"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : mode === 'login' ? (
                'تسجيل الدخول'
              ) : (
                'إنشاء حساب'
              )}
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
        )}

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
