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
  welcomeSeen: boolean;
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
  isActive?: boolean;
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
  currency?: string;
  isActive?: boolean;
}

export type SessionType = 'simulation' | 'practice' | 'analysis' | 'adaptive_training' | 'smart_training';

// ── Exam Template System ──

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export interface ExamSection {
  id: string;
  examTemplateId: string;
  order: number;
  nameAr: string;
  timeLimitSec: number | null;
  questionCount: number;
  topicFilterJson: string[] | null;
  difficultyMixJson: DifficultyMix | null;
  scoringRuleJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface ExamTemplate {
  id: string;
  countryId: string;
  slug: string;
  nameAr: string;
  descriptionAr: string;
  isActive: boolean;
  defaultTimeLimitSec: number;
  defaultQuestionCount: number;
  simulationSessionCostPoints: number;
  practiceSessionCostPoints: number;
  analysisCostPoints: number;
  sections: ExamSection[];
  availableLanguages?: string[];
  createdAt: string;
}

export interface QuestionPoolRule {
  id: string;
  examSectionId: string;
  ruleJson: Record<string, unknown>;
  createdAt: string;
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id: string;
  textAr: string;
}

export interface Question {
  id: string;
  countryId: string;
  examTemplateId?: string;
  sectionId?: string;
  topic: string;
  difficulty: QuestionDifficulty;
  textAr: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation?: string;
  isApproved: boolean;
  createdAt: string;
}

// ── Diamond Plan ──

export interface DiamondPlan {
  id: string;
  countryId: string;
  nameAr: string;
  priceUSD: number;
  currency: string;
  durationMonths: number;
  isActive: boolean;
  createdAt: string;
}
