import { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CreditCard } from 'lucide-react';

interface PayPalCardPaymentProps {
  orderType: 'points_pack' | 'diamond_plan';
  packId?: string;
  planId?: string;
  pointsAmount?: number;
  priceUSD: number;
  description?: string;
  onSuccess?: (result: { points_credited?: number; diamond_activated?: boolean }) => void;
  onCancel?: () => void;
}

export function PayPalCardPayment({
  orderType,
  packId,
  planId,
  pointsAmount,
  priceUSD,
  description,
  onSuccess,
  onCancel,
}: PayPalCardPaymentProps) {
  const { updateBalance } = useAuth();
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.functions.invoke('paypal-config').then(({ data, error }) => {
      if (data?.client_id) {
        setClientId(data.client_id);
      } else {
        toast.error('فشل تحميل إعدادات الدفع');
      }
      setLoading(false);
    });
  }, []);

  const createOrder = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('paypal-create-order', {
      body: {
        order_type: orderType,
        pack_id: packId,
        plan_id: planId,
        points_amount: pointsAmount,
        price_usd: priceUSD,
        description,
        user_id: session?.user?.id || null,
      },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'فشل إنشاء الطلب');
    }

    return data.id;
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('paypal-capture-order', {
        body: { paypal_order_id: data.orderID },
      });

      if (error || result?.error) {
        if (result?.already_completed) {
          toast.info('تم معالجة هذا الطلب مسبقاً');
          return;
        }
        throw new Error(result?.error || error?.message);
      }

      if (result?.points_credited) {
        updateBalance(result.points_credited);
      }

      toast.success(result?.message || 'تمت عملية الدفع بنجاح 🎉');
      onSuccess?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشل تأكيد الدفع';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="text-center p-4 text-sm text-muted-foreground">
        بوابة الدفع غير متاحة حالياً
      </div>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: 'USD',
        intent: 'capture',
        components: 'buttons',
        enableFunding: 'card',
        disableFunding: 'paypal,credit,paylater',
      }}
    >
      <div className="w-full" dir="ltr">
        <div className="flex items-center gap-2 mb-3 justify-center" dir="rtl">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            ادفع ببطاقتك مباشرة — بدون حساب PayPal
          </span>
        </div>
        <PayPalButtons
          style={{
            layout: 'vertical',
            color: 'black',
            shape: 'rect',
            label: 'pay',
            height: 45,
          }}
          fundingSource="card"
          createOrder={createOrder}
          onApprove={onApprove}
          onCancel={() => {
            toast.info('تم إلغاء عملية الدفع');
            onCancel?.();
          }}
          onError={(err) => {
            console.error('PayPal error:', err);
            toast.error('حدث خطأ في بوابة الدفع');
          }}
        />
      </div>
    </PayPalScriptProvider>
  );
}
