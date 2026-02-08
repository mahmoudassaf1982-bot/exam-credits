import type {
  User,
  PointsWallet,
  PointsTransaction,
  ReferralEvent,
  ExamCatalog,
  PointsPack,
  PlatformSettings,
  Country,
} from '@/types';

export const countries: Country[] = [
  { id: 'sa', name: 'Saudi Arabia', nameAr: 'السعودية', flag: '🇸🇦' },
  { id: 'ae', name: 'UAE', nameAr: 'الإمارات', flag: '🇦🇪' },
  { id: 'kw', name: 'Kuwait', nameAr: 'الكويت', flag: '🇰🇼' },
  { id: 'bh', name: 'Bahrain', nameAr: 'البحرين', flag: '🇧🇭' },
  { id: 'om', name: 'Oman', nameAr: 'عمان', flag: '🇴🇲' },
  { id: 'qa', name: 'Qatar', nameAr: 'قطر', flag: '🇶🇦' },
];

export const mockUser: User = {
  id: 'user-1',
  name: 'أحمد محمد',
  email: 'ahmed@example.com',
  countryId: 'sa',
  countryName: 'السعودية',
  isDiamond: false,
  referralCode: 'AHMED24',
  isAdmin: true,
  createdAt: '2024-06-15',
};

export const mockWallet: PointsWallet = {
  userId: 'user-1',
  balance: 45,
};

export const mockTransactions: PointsTransaction[] = [
  {
    id: 'tx-1',
    userId: 'user-1',
    type: 'credit',
    amount: 20,
    reason: 'signup_bonus',
    createdAt: '2024-06-15T10:00:00Z',
  },
  {
    id: 'tx-2',
    userId: 'user-1',
    type: 'credit',
    amount: 50,
    reason: 'purchase_points',
    createdAt: '2024-07-01T14:30:00Z',
  },
  {
    id: 'tx-3',
    userId: 'user-1',
    type: 'debit',
    amount: 10,
    reason: 'exam_attempt_session',
    metaJson: { examName: 'SMLE - الرخصة الطبية' },
    createdAt: '2024-07-05T09:00:00Z',
  },
  {
    id: 'tx-4',
    userId: 'user-1',
    type: 'debit',
    amount: 5,
    reason: 'practice_session',
    metaJson: { examName: 'SLE - طب الأسنان' },
    createdAt: '2024-07-10T16:00:00Z',
  },
  {
    id: 'tx-5',
    userId: 'user-1',
    type: 'credit',
    amount: 30,
    reason: 'referral_bonus',
    metaJson: { referredUserName: 'سارة أحمد' },
    createdAt: '2024-07-15T11:00:00Z',
  },
  {
    id: 'tx-6',
    userId: 'user-1',
    type: 'debit',
    amount: 10,
    reason: 'exam_attempt_session',
    metaJson: { examName: 'SMLE - الرخصة الطبية' },
    createdAt: '2024-08-01T08:00:00Z',
  },
  {
    id: 'tx-7',
    userId: 'user-1',
    type: 'debit',
    amount: 5,
    reason: 'exam_analysis',
    metaJson: { examName: 'SMLE - الرخصة الطبية' },
    createdAt: '2024-08-02T14:00:00Z',
  },
  {
    id: 'tx-8',
    userId: 'user-1',
    type: 'debit',
    amount: 5,
    reason: 'practice_session',
    metaJson: { examName: 'SMLE - الرخصة الطبية' },
    createdAt: '2024-08-10T10:00:00Z',
  },
  {
    id: 'tx-9',
    userId: 'user-1',
    type: 'credit',
    amount: 100,
    reason: 'purchase_points',
    createdAt: '2024-09-01T12:00:00Z',
  },
  {
    id: 'tx-10',
    userId: 'user-1',
    type: 'debit',
    amount: 10,
    reason: 'exam_attempt_session',
    metaJson: { examName: 'SLE - طب الأسنان' },
    createdAt: '2024-09-15T09:00:00Z',
  },
];

export const mockReferralEvents: ReferralEvent[] = [
  {
    id: 'ref-1',
    referrerUserId: 'user-1',
    referrerName: 'أحمد محمد',
    referredUserId: 'user-2',
    referredUserName: 'سارة أحمد',
    referredUserEmail: 'sara@example.com',
    status: 'rewarded',
    createdAt: '2024-07-10T10:00:00Z',
    rewardedAt: '2024-07-15T11:00:00Z',
  },
  {
    id: 'ref-2',
    referrerUserId: 'user-1',
    referrerName: 'أحمد محمد',
    referredUserId: 'user-3',
    referredUserName: 'خالد عبدالله',
    referredUserEmail: 'khaled@example.com',
    status: 'pending',
    createdAt: '2024-08-20T14:00:00Z',
  },
  {
    id: 'ref-3',
    referrerUserId: 'user-1',
    referrerName: 'أحمد محمد',
    referredUserId: 'user-4',
    referredUserName: 'فاطمة علي',
    referredUserEmail: 'fatima@example.com',
    status: 'rewarded',
    createdAt: '2024-09-05T08:00:00Z',
    rewardedAt: '2024-09-10T10:00:00Z',
  },
];

export const mockExams: ExamCatalog[] = [
  {
    id: 'exam-1',
    name: 'SMLE',
    nameAr: 'الرخصة الطبية السعودية',
    description: 'اختبار الرخصة الطبية السعودية - محاكاة شاملة',
    countryId: 'sa',
    simulationSessionCostPoints: 10,
    practiceSessionCostPoints: 5,
    analysisCostPoints: 5,
    questionsCount: 150,
    durationMinutes: 180,
  },
  {
    id: 'exam-2',
    name: 'SLE',
    nameAr: 'رخصة طب الأسنان',
    description: 'اختبار رخصة طب الأسنان السعودية',
    countryId: 'sa',
    simulationSessionCostPoints: 10,
    practiceSessionCostPoints: 5,
    analysisCostPoints: 5,
    questionsCount: 120,
    durationMinutes: 150,
  },
  {
    id: 'exam-3',
    name: 'SNLE',
    nameAr: 'رخصة التمريض السعودية',
    description: 'اختبار رخصة التمريض السعودية',
    countryId: 'sa',
    simulationSessionCostPoints: 10,
    practiceSessionCostPoints: 5,
    analysisCostPoints: 5,
    questionsCount: 100,
    durationMinutes: 120,
  },
  {
    id: 'exam-4',
    name: 'HAAD',
    nameAr: 'هيئة أبوظبي الصحية',
    description: 'اختبار هيئة أبوظبي للصحة',
    countryId: 'ae',
    simulationSessionCostPoints: 10,
    practiceSessionCostPoints: 5,
    analysisCostPoints: 5,
    questionsCount: 130,
    durationMinutes: 160,
  },
];

export const mockPointsPacks: PointsPack[] = [
  { id: 'pack-1', countryId: 'sa', points: 30, priceUSD: 5, label: 'تجربة' },
  { id: 'pack-2', countryId: 'sa', points: 80, priceUSD: 12, label: 'أساسي', popular: true },
  { id: 'pack-3', countryId: 'sa', points: 200, priceUSD: 25, label: 'متقدم' },
  { id: 'pack-4', countryId: 'sa', points: 500, priceUSD: 50, label: 'احترافي' },
  { id: 'pack-5', countryId: 'ae', points: 30, priceUSD: 6, label: 'تجربة' },
  { id: 'pack-6', countryId: 'ae', points: 80, priceUSD: 14, label: 'أساسي', popular: true },
  { id: 'pack-7', countryId: 'ae', points: 200, priceUSD: 28, label: 'متقدم' },
];

export const mockSettings: PlatformSettings = {
  signupBonusPoints: 20,
  referrerBonusPoints: 30,
  referredBonusPoints: 10,
};

export const diamondYearlyPriceUSD = 99;

export const reasonLabels: Record<string, string> = {
  signup_bonus: 'مكافأة التسجيل',
  referral_bonus: 'مكافأة دعوة صديق',
  purchase_points: 'شراء نقاط',
  exam_attempt_session: 'جلسة محاكاة',
  practice_session: 'جلسة تدريب ذكي',
  exam_analysis: 'تحليل نتيجة',
};
