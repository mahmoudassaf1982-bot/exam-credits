
-- Create trigger: notify admin when a new user profile is created
CREATE TRIGGER notify_admin_on_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_user();

-- Create trigger: notify admin when a payment order is completed
CREATE TRIGGER notify_admin_on_payment_completed
  AFTER UPDATE ON public.payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_payment_completed();
