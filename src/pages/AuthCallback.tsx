import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          toast.error('حدث خطأ أثناء تفعيل الحساب. يرجى المحاولة مرة أخرى.');
          navigate('/auth/login');
        } else {
          toast.success('تم تفعيل حسابك بنجاح! مرحباً بك 🎉');
          navigate('/app');
        }
      } catch {
        toast.error('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
        navigate('/auth/login');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">جاري تفعيل حسابك...</p>
      </div>
    </div>
  );
}
