import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-card">
        <XCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground">تم إلغاء عملية الدفع</h1>
        <p className="text-sm text-muted-foreground mt-2">لم تتم عملية الدفع. يمكنك المحاولة مرة أخرى.</p>
        <Button onClick={() => navigate('/app/topup')} className="mt-6">
          العودة لصفحة الشراء
        </Button>
      </div>
    </div>
  );
}
