
-- Fix notify_admin_new_user function: use correct net.http_post schema
CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _admin_email text;
  _project_url text := 'https://pypkjchxhgjbzgkyskhj.supabase.co';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cGtqY2h4aGdqYnpna3lza2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzEwMzgsImV4cCI6MjA4NjIwNzAzOH0.h-_HqgM39WlvTC9t2IsvCdIRWKaCSQPCfUdBzYJxSWo';
BEGIN
  _admin_email := public.get_admin_notification_email();
  IF _admin_email IS NULL OR _admin_email = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _project_url || '/functions/v1/send-admin-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _anon_key
      ),
      body := jsonb_build_object(
        'type', 'new_user',
        'adminEmail', _admin_email,
        'data', jsonb_build_object(
          'userId', NEW.id,
          'name', NEW.name,
          'email', NEW.email,
          'countryName', NEW.country_name,
          'createdAt', NEW.created_at
        )
      )::text
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Fix notify_admin_payment_completed function: use correct net.http_post schema
CREATE OR REPLACE FUNCTION public.notify_admin_payment_completed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _admin_email text;
  _project_url text := 'https://pypkjchxhgjbzgkyskhj.supabase.co';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cGtqY2h4aGdqYnpna3lza2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzEwMzgsImV4cCI6MjA4NjIwNzAzOH0.h-_HqgM39WlvTC9t2IsvCdIRWKaCSQPCfUdBzYJxSWo';
  _user_name text;
BEGIN
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  _admin_email := public.get_admin_notification_email();
  IF _admin_email IS NULL OR _admin_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _user_name FROM public.profiles WHERE id = NEW.user_id;

  BEGIN
    PERFORM net.http_post(
      url := _project_url || '/functions/v1/send-admin-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _anon_key
      ),
      body := jsonb_build_object(
        'type', NEW.order_type,
        'adminEmail', _admin_email,
        'data', jsonb_build_object(
          'userId', NEW.user_id,
          'userName', COALESCE(_user_name, 'مستخدم'),
          'orderType', NEW.order_type,
          'pointsAmount', NEW.points_amount,
          'priceUsd', NEW.price_usd,
          'orderId', NEW.id,
          'createdAt', NEW.updated_at
        )
      )::text
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Drop existing triggers if any (safety)
DROP TRIGGER IF EXISTS notify_admin_on_new_user ON public.profiles;
DROP TRIGGER IF EXISTS notify_admin_on_payment_completed ON public.payment_orders;

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
