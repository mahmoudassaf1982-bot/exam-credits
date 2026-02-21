
-- Fix 1: Allow authenticated users to view approved questions
CREATE POLICY "Users can view approved questions"
ON public.questions FOR SELECT
TO authenticated
USING (is_approved = true);

-- Fix 2: Create points_packs table for server-side price validation
CREATE TABLE public.points_packs (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  points integer NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  label text NOT NULL DEFAULT '',
  popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.points_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packs" ON public.points_packs
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage packs" ON public.points_packs
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create diamond_plans table for server-side price validation
CREATE TABLE public.diamond_plans (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  name_ar text NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  duration_months integer NOT NULL DEFAULT 12,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.diamond_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON public.diamond_plans
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON public.diamond_plans
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed points packs
INSERT INTO public.points_packs (id, country_id, points, price_usd, label, popular) VALUES
  ('pack-1', 'sa', 30, 5, 'تجربة', false),
  ('pack-2', 'sa', 80, 12, 'أساسي', true),
  ('pack-3', 'sa', 200, 25, 'متقدم', false),
  ('pack-4', 'sa', 500, 50, 'احترافي', false),
  ('pack-5', 'ae', 30, 6, 'تجربة', false),
  ('pack-6', 'ae', 80, 14, 'أساسي', true),
  ('pack-7', 'ae', 200, 28, 'متقدم', false);

-- Seed diamond plans
INSERT INTO public.diamond_plans (id, country_id, name_ar, price_usd, currency, duration_months) VALUES
  ('plan-sa-1', 'sa', 'Diamond سنوي - السعودية', 99, 'SAR', 12),
  ('plan-ae-1', 'ae', 'Diamond سنوي - الإمارات', 109, 'AED', 12);
