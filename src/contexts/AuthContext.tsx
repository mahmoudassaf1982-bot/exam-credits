import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, PointsWallet } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  wallet: PointsWallet | null;
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, meta: { name: string; country_id: string; country_name: string; referral_code?: string }) => Promise<{ error?: string; success?: boolean; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  updateBalance: (delta: number) => void;
  refreshWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    setUser(null);
    setWallet(null);
    setSession(null);
  };

  // Validate that the stored session user matches the current user
  const validateSessionUser = async (sessionUserId: string): Promise<boolean> => {
    try {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser();
      if (error) return false;
      return currentUser?.id === sessionUserId;
    } catch (error) {
      console.error('[Auth] validateSessionUser failed:', error);
      return false;
    }
  };

  // Fetch profile + wallet + role for a given user id
  const fetchUserData = async (userId: string) => {
    const [profileRes, walletRes, roleRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('wallets').select('*').eq('user_id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);

    if (profileRes.data) {
      const roles = roleRes.data?.map((r) => r.role) ?? [];
      setUser({
        id: profileRes.data.id,
        name: profileRes.data.name,
        email: profileRes.data.email,
        countryId: profileRes.data.country_id,
        countryName: profileRes.data.country_name,
        isDiamond: profileRes.data.is_diamond,
        referralCode: profileRes.data.referral_code || '',
        isAdmin: roles.includes('admin'),
        welcomeSeen: (profileRes.data as any).welcome_seen ?? true,
        createdAt: profileRes.data.created_at,
      });
    }

    if (walletRes.data) {
      setWallet({ userId: walletRes.data.user_id, balance: walletRes.data.balance });
    }
  };

  useEffect(() => {
    let initialSessionHandled = false;
    let isUnmounted = false;

    const finishLoading = () => {
      if (!isUnmounted) setLoading(false);
    };

    const hydrateAuthenticatedSession = async (event: string, newSession: Session) => {
      try {
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          const valid = await validateSessionUser(newSession.user.id);
          if (!valid) {
            await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
            clearAuthState();
            return;
          }
        }

        await fetchUserData(newSession.user.id);
      } catch (e) {
        console.error('[Auth] Failed to hydrate authenticated session:', e);
        clearAuthState();
      } finally {
        finishLoading();
      }
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      initialSessionHandled = true;

      if (isUnmounted) return;

      setSession(newSession);

      if (!newSession?.user) {
        clearAuthState();
        finishLoading();
        return;
      }

      // Don't await inside onAuthStateChange callback
      void hydrateAuthenticatedSession(event, newSession);
    });

    // Fallback: check existing session if auth callback didn't fire
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (initialSessionHandled || isUnmounted) return;

        if (error) {
          console.error('[Auth] getSession failed:', error);
          clearAuthState();
          return;
        }

        setSession(data.session);

        if (data.session?.user) {
          await fetchUserData(data.session.user.id);
        } else {
          clearAuthState();
        }
      } catch (e) {
        console.error('[Auth] Initial session restore failed:', e);
        clearAuthState();
      } finally {
        if (!initialSessionHandled) finishLoading();
      }
    })();

    return () => {
      isUnmounted = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signup = async (
    email: string,
    password: string,
    meta: { name: string; country_id: string; country_name: string; referral_code?: string }
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: meta,
      },
    });
    if (error) {
      if (error.status === 429) return { error: 'يرجى الانتظار قبل المحاولة مرة أخرى' };
      return { error: error.message };
    }
    // Email confirmation required - user created but no session
    if (data?.user && !data.session) {
      return { success: true, needsConfirmation: true };
    }
    return {};
  };

  const logout = async () => {
    // Hard logout: clear all local storage auth keys before signing out
    try {
      // Sign out from Supabase (clears session server-side & removes tokens)
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      // Ignore errors and proceed with local cleanup
    } finally {
      // Clear all auth-related localStorage keys
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      // Clear session cookies if any
      document.cookie.split(';').forEach((cookie) => {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
      setUser(null);
      setWallet(null);
      setSession(null);
    }
  };

  const updateBalance = (delta: number) => {
    setWallet((prev) => (prev ? { ...prev, balance: prev.balance + delta } : prev));
  };

  const refreshWallet = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('wallets').select('*').eq('user_id', session.user.id).single();
    if (data) setWallet({ userId: data.user_id, balance: data.balance });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        wallet,
        session,
        isAuthenticated: !!session,
        loading,
        login,
        signup,
        logout,
        updateBalance,
        refreshWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
