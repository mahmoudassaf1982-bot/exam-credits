import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CountryOption {
  id: string;
  name_ar: string;
  flag: string;
}

export default function ChooseCountry() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // If user already has a country, skip
  useEffect(() => {
    if (user && user.countryId && user.countryId.length > 0) {
      navigate(user.welcomeSeen ? '/app' : '/welcome', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchCountries = async () => {
      const { data } = await supabase
        .from('countries')
        .select('id, name_ar, flag')
        .eq('is_active', true)
        .order('name_ar');
      if (data) setCountries(data);
      setLoading(false);
    };
    fetchCountries();
  }, []);

  const handleSave = async () => {
    if (!selected || !session?.user?.id) return;
    setSaving(true);

    const country = countries.find(c => c.id === selected);

    const { error } = await supabase
      .from('profiles')
      .update({
        country_id: selected,
        country_name: country?.name_ar || '',
      })
      .eq('id', session.user.id);

    if (error) {
      toast.error('حدث خطأ أثناء حفظ الدولة');
      setSaving(false);
      return;
    }

    // Force refresh user data in context
    window.location.href = '/welcome';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
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
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-card space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Globe className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground">اختر دولتك</h2>
            <p className="text-sm text-muted-foreground">
              سيتم عرض الاختبارات المتوفرة حسب دولتك
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {countries.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-all ${
                  selected === c.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <span className="text-3xl">{c.flag}</span>
                <span className="text-sm font-semibold">{c.name_ar}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={handleSave}
            disabled={!selected || saving}
            className="w-full gradient-primary text-primary-foreground font-bold py-6 text-base"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'تأكيد الاختيار'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            ⚠️ لا يمكن تغيير الدولة لاحقًا
          </p>
        </div>
      </motion.div>
    </div>
  );
}
