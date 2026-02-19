
-- Remove duplicate old triggers
DROP TRIGGER IF EXISTS trigger_notify_admin_new_user ON public.profiles;
DROP TRIGGER IF EXISTS trigger_notify_admin_payment ON public.payment_orders;
