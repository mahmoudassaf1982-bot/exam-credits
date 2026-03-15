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
        // Check if there's a code in the URL (OAuth redirect from custom domain flow)
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          // Exchange the authorization code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            console.error('Auth callback error:', error);
            toast.error('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
            navigate('/auth/login');
            return;
          }
        }

        // Check if we now have a valid session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          toast.success('تم تسجيل الدخول بنجاح! مرحباً بك 🎉');
          navigate('/app');
        } else {
          toast.error('حدث خطأ أثناء تفعيل الحساب. يرجى المحاولة مرة أخرى.');
          navigate('/auth/login');
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
        <p className="text-muted-foreground">جاري تسجيل الدخول...</p>
      </div>
    </div>
  );
}
