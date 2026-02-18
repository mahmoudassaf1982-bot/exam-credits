import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, ShoppingCart } from 'lucide-react';

export function useAdminNotifications(enabled: boolean) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Small delay to let auth settle before subscribing
    const timer = setTimeout(() => {
      const channel = supabase
        .channel('admin-realtime-notifications')
        // New user registered → INSERT on profiles table
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'profiles' },
          (payload) => {
            const name = (payload.new as { name?: string })?.name || 'مستخدم جديد';
            toast.success(`🧑‍💼 ${name}`, {
              description: 'انضم إلى المنصة للتو',
              duration: 6000,
              position: 'bottom-left',
            });
          }
        )
        // Purchase completed → UPDATE on payment_orders where status = completed
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'payment_orders' },
          (payload) => {
            const newRow = payload.new as { status?: string; price_usd?: number; order_type?: string };
            if (newRow?.status !== 'completed') return;
            const amount = newRow.price_usd?.toFixed(2) ?? '0.00';
            const isPoints = newRow.order_type === 'points_pack';
            toast.success(`💰 عملية شراء مكتملة`, {
              description: `${isPoints ? 'شراء نقاط' : 'اشتراك Diamond'} — $${amount}`,
              duration: 7000,
              position: 'bottom-left',
            });
          }
        )
        .subscribe();

      channelRef.current = channel;
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled]);
}
