import { useState, useEffect, useRef } from 'react';
import {
  PayPalScriptProvider,
  PayPalHostedFieldsProvider,
  PayPalHostedField,
  PayPalButtons,
  usePayPalHostedFields,
} from '@paypal/react-paypal-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CreditCard, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

function SubmitPayment({ priceUSD, onSuccess, onCancel }: {
  priceUSD: number;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}) {
  const hostedFields = usePayPalHostedFields();
  const [paying, setPaying] = useState(false);
  const { updateBalance } = useAuth();

  const handleSubmit = async () => {
    if (!hostedFields?.cardFields) {
      toast.error('حقول البطاقة غير جاهزة');
      return;
    }

    const cardFieldsValid = typeof hostedFields.cardFields.getState === 'function'
      ? Object.values(hostedFields.cardFields.getState().fields).every((f: any) => f.isValid)
      : true;

    if (!cardFieldsValid) {
      toast.error('يرجى التحقق من بيانات البطاقة');
      return;
    }

    setPaying(true);
    try {
      const response = await hostedFields.cardFields.submit({
        cardholderName: '',
      });

      if (response?.orderId) {
        const { data: result, error } = await supabase.functions.invoke('paypal-capture-order', {
          body: { paypal_order_id: response.orderId },
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشل تأكيد الدفع';
      toast.error(message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Button
      onClick={handleSubmit}
      disabled={paying}
      className="w-full gradient-gold text-gold-foreground font-bold text-base py-6 mt-4"
    >
      {paying ? (
        <Loader2 className="h-5 w-5 ml-2 animate-spin" />
      ) : (
        <Lock className="h-4 w-4 ml-2" />
      )}
      {paying ? 'جارٍ المعالجة...' : `ادفع $${priceUSD}`}
    </Button>
  );
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
  const { updateBalance } = useAuth();

  useEffect(() => {
    supabase.functions.invoke('paypal-config').then(({ data }) => {
      if (data?.client_id) {
        setClientId(data.client_id);
      } else {
        toast.error('فشل تحميل إعدادات الدفع');
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
        components: 'buttons,hosted-fields',
        enableFunding: 'card',
        disableFunding: 'credit,paylater',
      }}
    >
      <div className="space-y-6" dir="ltr">
        {/* Card fields section */}
        <div dir="rtl">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">
              ادفع ببطاقتك مباشرة
            </span>
          </div>
          <p className="text-xs text-muted-foreground text-center mb-4">
            بيانات البطاقة محمية بالكامل بواسطة PayPal — لا حاجة لحساب PayPal
          </p>
        </div>

        <PayPalHostedFieldsProvider
          createOrder={createOrderCallback}
          styles={{
            input: {
              'font-size': '16px',
              'font-family': 'inherit',
              color: '#333',
              padding: '12px',
            },
            '.invalid': {
              color: '#dc2626',
            },
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5 text-right">
                رقم البطاقة
              </label>
              <div className="rounded-xl border bg-background overflow-hidden h-12">
                <PayPalHostedField
                  id="card-number"
                  hostedFieldType="number"
                  options={{
                    selector: '#card-number',
                    placeholder: '4111 1111 1111 1111',
                  }}
                  className="w-full h-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5 text-right">
                  تاريخ الانتهاء
                </label>
                <div className="rounded-xl border bg-background overflow-hidden h-12">
                  <PayPalHostedField
                    id="expiration-date"
                    hostedFieldType="expirationDate"
                    options={{
                      selector: '#expiration-date',
                      placeholder: 'MM/YY',
                    }}
                    className="w-full h-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5 text-right">
                  رمز الأمان CVV
                </label>
                <div className="rounded-xl border bg-background overflow-hidden h-12">
                  <PayPalHostedField
                    id="cvv"
                    hostedFieldType="cvv"
                    options={{
                      selector: '#cvv',
                      placeholder: '123',
                    }}
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <SubmitPayment
            priceUSD={priceUSD}
            onSuccess={onSuccess}
            onCancel={onCancel}
          />
        </PayPalHostedFieldsProvider>

        {/* Optional PayPal wallet divider */}
        <div className="flex items-center gap-3 my-2" dir="rtl">
          <div className="flex-1 border-t" />
          <span className="text-xs text-muted-foreground">أو ادفع عبر PayPal</span>
          <div className="flex-1 border-t" />
        </div>

        {/* PayPal wallet button (optional) */}
        <PayPalButtons
          style={{
            layout: 'horizontal',
            color: 'blue',
            shape: 'rect',
            label: 'paypal',
            height: 40,
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
