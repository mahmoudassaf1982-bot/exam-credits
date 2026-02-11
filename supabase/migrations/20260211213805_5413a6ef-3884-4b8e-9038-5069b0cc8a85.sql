
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  country_id TEXT NOT NULL DEFAULT '',
  country_name TEXT NOT NULL DEFAULT '',
  is_diamond BOOLEAN NOT NULL DEFAULT false,
  referral_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- 4. Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Wallets table
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);

-- 6. Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- 7. Trigger: auto-create profile + wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
  _country_id TEXT;
  _country_name TEXT;
  _referral_code TEXT;
  _ref_code TEXT;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'name', '');
  _country_id := COALESCE(NEW.raw_user_meta_data->>'country_id', '');
  _country_name := COALESCE(NEW.raw_user_meta_data->>'country_name', '');
  _referral_code := UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  _ref_code := NEW.raw_user_meta_data->>'referral_code';

  -- Create profile
  INSERT INTO public.profiles (id, name, email, country_id, country_name, referral_code)
  VALUES (NEW.id, _name, NEW.email, _country_id, _country_name, _referral_code);

  -- Create wallet with signup bonus (20 points)
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 20);

  -- Record signup bonus transaction
  INSERT INTO public.transactions (user_id, type, amount, reason)
  VALUES (NEW.id, 'credit', 20, 'signup_bonus');

  -- Handle referral bonus if referral code provided
  IF _ref_code IS NOT NULL AND _ref_code != '' THEN
    DECLARE
      _referrer_id UUID;
    BEGIN
      SELECT id INTO _referrer_id FROM public.profiles WHERE referral_code = _ref_code;
      IF _referrer_id IS NOT NULL THEN
        -- Give referrer 30 points
        UPDATE public.wallets SET balance = balance + 30 WHERE user_id = _referrer_id;
        INSERT INTO public.transactions (user_id, type, amount, reason, meta_json)
        VALUES (_referrer_id, 'credit', 30, 'referral_bonus', jsonb_build_object('referred_user_name', _name));
        -- Give new user extra 10 points
        UPDATE public.wallets SET balance = balance + 10 WHERE user_id = NEW.id;
        INSERT INTO public.transactions (user_id, type, amount, reason)
        VALUES (NEW.id, 'credit', 10, 'referral_bonus');
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Trigger for wallet updated_at
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
