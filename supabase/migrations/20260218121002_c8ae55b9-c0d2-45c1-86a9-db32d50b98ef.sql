
-- Create platform_settings table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read settings
CREATE POLICY "Admins can view settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings"
ON public.platform_settings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
ON public.platform_settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default empty admin notification email setting
INSERT INTO public.platform_settings (key, value)
VALUES ('admin_notification_email', '')
ON CONFLICT (key) DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_platform_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_platform_settings_updated_at();

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Helper function: get the admin notification email
CREATE OR REPLACE FUNCTION public.get_admin_notification_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.platform_settings WHERE key = 'admin_notification_email' LIMIT 1;
$$;

-- Function to call the notification edge function (new user)
CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  PERFORM extensions.http_post(
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
  RETURN NEW;
END;
$$;

-- Trigger on profiles INSERT (after user registers)
CREATE OR REPLACE TRIGGER trigger_notify_admin_new_user
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_new_user();

-- Function to call the notification edge function (payment completed)
CREATE OR REPLACE FUNCTION public.notify_admin_payment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_email text;
  _project_url text := 'https://pypkjchxhgjbzgkyskhj.supabase.co';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cGtqY2h4aGdqYnpna3lza2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzEwMzgsImV4cCI6MjA4NjIwNzAzOH0.h-_HqgM39WlvTC9t2IsvCdIRWKaCSQPCfUdBzYJxSWo';
  _user_name text;
BEGIN
  -- Only react when status changes TO 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  _admin_email := public.get_admin_notification_email();
  IF _admin_email IS NULL OR _admin_email = '' THEN
    RETURN NEW;
  END IF;

  -- Get user name from profiles
  SELECT name INTO _user_name FROM public.profiles WHERE id = NEW.user_id;

  PERFORM extensions.http_post(
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
  RETURN NEW;
END;
$$;

-- Trigger on payment_orders UPDATE
CREATE OR REPLACE TRIGGER trigger_notify_admin_payment
AFTER UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_payment_completed();
