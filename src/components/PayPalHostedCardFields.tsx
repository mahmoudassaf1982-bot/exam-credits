import { useState, useEffect } from 'react';
import {
  PayPalScriptProvider,
  PayPalButtons,
} from '@paypal/react-paypal-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Lock, AlertCircle } from 'lucide-react';

interface PayPalHostedCardFieldsProps {
  orderType: 'points_pack' | 'diamond_plan';
  packId?: string;
  planId?: string;
  pointsAmount?: number;
  priceUSD: number;
  description?: string;
  onSuccess?: (result: { points_credited?: number; diamond_activated?: boolean }) => void;
  onCancel?: () => void;
}

export function PayPalHostedCardFields({
  orderType,
  packId,
  planId,
  pointsAmount,
  priceUSD,
  description,
  onSuccess,
  onCancel,
}: PayPalHostedCardFieldsProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scriptError, setScriptError] = useState(false);
  const { updateBalance } = useAuth();

  useEffect(() => {
    supabase.functions.invoke('paypal-config').then(({ data, error }) => {
      if (error || !data?.client_id) {
        toast.error('فشل تحميل إعدادات الدفع');
        setScriptError(true);
      } else {
        setClientId(data.client_id);
      }
      setLoading(false);
    });
  }, []);

  const createOrderCallback = async (): Promise<string> => {
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

  const onApproveCallback = async (data: { orderID: string }) => {
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
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientId || scriptError) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-sm text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>بوابة الدفع غير متاحة حالياً</span>
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
      }}
    >
      <div className="space-y-4" dir="ltr">
        <PayPalButtons
          style={{
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay',
            height: 45,
            tagline: false,
          }}
          createOrder={createOrderCallback}
          onApprove={onApproveCallback}
          onCancel={() => {
            toast.info('تم إلغاء عملية الدفع');
            onCancel?.();
          }}
          onError={(err) => {
            console.error('PayPal error:', err);
            toast.error('حدث خطأ في بوابة الدفع');
          }}
        />

        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground" dir="rtl">
          <Lock className="h-3 w-3" />
          <span>مدفوعاتك مشفرة ومحمية بالكامل</span>
        </div>
      </div>
    </PayPalScriptProvider>
  );
}
