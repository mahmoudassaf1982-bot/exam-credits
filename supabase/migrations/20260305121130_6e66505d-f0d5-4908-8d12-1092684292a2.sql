-- Add welcome_seen column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_seen boolean NOT NULL DEFAULT false;

-- Mark all existing users as having seen welcome (they're already onboarded)
UPDATE public.profiles SET welcome_seen = true WHERE welcome_seen = false;