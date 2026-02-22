import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformSettingsValues {
  signupBonusPoints: number;
  referrerBonusPoints: number;
  referredBonusPoints: number;
}

const defaults: PlatformSettingsValues = {
  signupBonusPoints: 20,
  referrerBonusPoints: 30,
  referredBonusPoints: 10,
};

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettingsValues>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['signup_bonus_points', 'referrer_bonus_points', 'referred_bonus_points']);

      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r) => { map[r.key] = r.value ?? ''; });
        setSettings({
          signupBonusPoints: Number(map['signup_bonus_points']) || defaults.signupBonusPoints,
          referrerBonusPoints: Number(map['referrer_bonus_points']) || defaults.referrerBonusPoints,
          referredBonusPoints: Number(map['referred_bonus_points']) || defaults.referredBonusPoints,
        });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  return { settings, setSettings, loading };
}
