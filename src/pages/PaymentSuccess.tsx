import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePayPal } from '@/hooks/usePayPal';
import { useAuth } from '@/contexts/AuthContext';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { captureOrder, loading } = usePayPal();
  const { updateBalance } = useAuth();
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token && !captured) {
      captureOrder(token).then((result) => {
        if (result?.success) {
          setCaptured(true);
          if (result.points_credited) {
            updateBalance(result.points_credited);
          }
        } else {
          setError(true);
        }
      }).catch(() => setError(true));
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-card">
        {loading ? (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground">جارٍ تأكيد الدفع...</h1>
            <p className="text-sm text-muted-foreground mt-2">يرجى الانتظار</p>
          </>
        ) : error ? (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">❌</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">فشل تأكيد الدفع</h1>
            <p className="text-sm text-muted-foreground mt-2">حدث خطأ أثناء تأكيد الدفع. يرجى المحاولة مرة أخرى.</p>
            <Button onClick={() => navigate('/app/topup')} className="mt-6">
              العودة لصفحة الشراء
            </Button>
          </>
        ) : (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground">تمت عملية الدفع بنجاح 🎉</h1>
            <p className="text-sm text-muted-foreground mt-2">تمت إضافة النقاط إلى حسابك.</p>
            <Button onClick={() => navigate('/app/topup')} className="mt-6">
              العودة للصفحة الرئيسية
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
