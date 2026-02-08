import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { User, PointsWallet } from '@/types';
import { mockUser, mockWallet } from '@/data/mock';

interface AuthContextType {
  user: User | null;
  wallet: PointsWallet | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  updateBalance: (delta: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(mockUser);
  const [wallet, setWallet] = useState<PointsWallet | null>(mockWallet);

  const login = () => {
    setUser(mockUser);
    setWallet(mockWallet);
  };

  const logout = () => {
    setUser(null);
    setWallet(null);
  };

  const updateBalance = (delta: number) => {
    setWallet((prev) =>
      prev ? { ...prev, balance: prev.balance + delta } : prev
    );
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        wallet,
        isAuthenticated: !!user,
        login,
        logout,
        updateBalance,
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
