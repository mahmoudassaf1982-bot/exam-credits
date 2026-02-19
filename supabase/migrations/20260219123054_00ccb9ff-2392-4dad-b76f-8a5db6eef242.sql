
-- Fix: Replace extensions.http_post with net.http_post (pg_net extension)
-- and wrap in EXCEPTION block so notification failures never block user signup

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Fix notify_admin_new_user: use net.http_post and catch exceptions
CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _admin_email text;
  _project_url text := 'https://pypkjchxhgjbzgkyskhj.supabase.co';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cGtqY2h4aGdqYnpna3lza2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzEwMzgsImV4cCI6MjA4NjIwNzAzOH0.h-_HqgM39WlvTC9t2IsvCdIRWKaCSQPCfUdBzYJxSWo';
BEGIN
  _admin_email := public.get_admin_notification_email();
  IF _admin_email IS NULL OR _admin_email = '' THEN
    RETURN NEW;
  END IF;

  -- Use net.http_post (pg_net) asynchronously — never blocks the transaction
  BEGIN
    PERFORM extensions.net.http_post(
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
    -- Notification failure must NEVER block user creation
    NULL;
  END;

  RETURN NEW;
END;
$function$;

-- Fix notify_admin_payment_completed similarly
CREATE OR REPLACE FUNCTION public.notify_admin_payment_completed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
    PERFORM extensions.net.http_post(
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
$function$;
