export interface User {
  id: string;
  name: string;
  email: string;
  countryId: string;
  countryName: string;
  isDiamond: boolean;
  diamondExpiresAt?: string;
  referralCode: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface PointsWallet {
  userId: string;
  balance: number;
}

export interface PointsTransaction {
  id: string;
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: TransactionReason;
  metaJson?: Record<string, unknown>;
  createdAt: string;
}

export type TransactionReason =
  | 'signup_bonus'
  | 'referral_bonus'
  | 'purchase_points'
  | 'exam_attempt_session'
  | 'practice_session'
  | 'exam_analysis';

export interface ReferralEvent {
  id: string;
  referrerUserId: string;
  referrerName: string;
  referredUserId: string;
  referredUserName: string;
  referredUserEmail: string;
  status: 'pending' | 'rewarded';
  createdAt: string;
  rewardedAt?: string;
}

export interface ExamCatalog {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  countryId: string;
  simulationSessionCostPoints: number;
  practiceSessionCostPoints: number;
  analysisCostPoints: number;
  questionsCount: number;
  durationMinutes: number;
}

export interface PointsPack {
  id: string;
  countryId: string;
  points: number;
  priceUSD: number;
  label: string;
  popular?: boolean;
}

export interface PlatformSettings {
  signupBonusPoints: number;
  referrerBonusPoints: number;
  referredBonusPoints: number;
}

export interface Country {
  id: string;
  name: string;
  nameAr: string;
  flag: string;
}

export type SessionType = 'simulation' | 'practice' | 'analysis';
