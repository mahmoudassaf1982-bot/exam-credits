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
  signup: (email: string, password: string, meta: { name: string; country_id: string; country_name: string; referral_code?: string }) => Promise<{ error?: string }>;
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

  // Fetch profile + wallet for a given user id
  const fetchUserData = async (userId: string) => {
    const [profileRes, walletRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('wallets').select('*').eq('user_id', userId).single(),
    ]);

    if (profileRes.data) {
      setUser({
        id: profileRes.data.id,
        name: profileRes.data.name,
        email: profileRes.data.email,
        countryId: profileRes.data.country_id,
        countryName: profileRes.data.country_name,
        isDiamond: profileRes.data.is_diamond,
        referralCode: profileRes.data.referral_code || '',
        isAdmin: false, // checked via user_roles if needed
        createdAt: profileRes.data.created_at,
      });
    }

    if (walletRes.data) {
      setWallet({ userId: walletRes.data.user_id, balance: walletRes.data.balance });
    }
  };

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Use setTimeout to avoid potential deadlocks with Supabase client
          setTimeout(() => fetchUserData(newSession.user.id), 0);
        } else {
          setUser(null);
          setWallet(null);
        }
        setLoading(false);
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      if (existingSession?.user) {
        fetchUserData(existingSession.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: meta,
      },
    });
    if (error) return { error: error.message };
    return {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setWallet(null);
    setSession(null);
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
