import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateOrderParams {
  order_type: 'points_pack' | 'diamond_plan';
  pack_id?: string;
  plan_id?: string;
  points_amount?: number;
  price_usd: number;
  description?: string;
}

interface CaptureResult {
  success: boolean;
  order_type: string;
  points_credited?: number;
  diamond_activated?: boolean;
  message?: string;
}

export function usePayPal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = async (params: CreateOrderParams) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'paypal-create-order',
        { body: params }
      );

      if (fnError) {
        throw new Error(fnError.message || 'فشل إنشاء الطلب');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.approve_url) {
        // Redirect user to PayPal for approval
        window.location.href = data.approve_url;
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const captureOrder = async (paypalOrderId: string): Promise<CaptureResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'paypal-capture-order',
        { body: { paypal_order_id: paypalOrderId } }
      );

      if (fnError) {
        throw new Error(fnError.message || 'فشل تأكيد الدفع');
      }

      if (data?.error) {
        if (data.already_completed) {
          toast.info('تم معالجة هذا الطلب مسبقاً');
          return null;
        }
        throw new Error(data.error);
      }

      if (data?.message) {
        toast.success(data.message);
      }

      return data as CaptureResult;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ في تأكيد الدفع';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    createOrder,
    captureOrder,
    loading,
    error,
  };
}
