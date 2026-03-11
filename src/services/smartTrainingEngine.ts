/**
 * Smart Training Engine (STE)
 * 
 * Replaces the old CAT engine with a multi-factor adaptive question selection system.
 * Combines: weakness-focused training, adaptive difficulty, cumulative ability estimation,
 * and exam DNA alignment.
 * 
 * Core concepts:
 * - Multi-factor scoring for next question selection
 * - Confidence-based difficulty stabilization (prevents oscillation)
 * - Cumulative ability that persists across sessions via student_learning_dna
 */

export interface STEQuestion {
  id: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  sectionId: string;
  sectionName: string;
}

export interface STEAnswerRecord {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  timeSpentMs: number;
  topic: string;
  sectionId: string;
}

export interface SkillMemoryEntry {
  section_id: string;
  section_name: string;
  skill_score: number;
  total_answered: number;
}

export interface ExamDNADistribution {
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
}

export type ConfidencePhase = 'LOW' | 'MEDIUM' | 'HIGH';

export interface STESessionState {
  // Core adaptive state
  currentAbility: number;          // 0–100, loaded from DNA on init
  currentDifficulty: 'easy' | 'medium' | 'hard';
  confidencePhase: ConfidencePhase;
  
  // Question tracking
  questionsServed: STEQuestion[];
  answers: STEAnswerRecord[];
  
  // Live metrics
  accuracyRate: number;
  avgResponseTimeMs: number;
  difficultyProgression: ('easy' | 'medium' | 'hard')[];
  
  // Topic/section performance
  topicPerformance: Record<string, { correct: number; total: number }>;
  sectionPerformance: Record<string, { correct: number; total: number }>;
  
  // Skill context (loaded from DB)
  skillMemory: SkillMemoryEntry[];
  examDNA: ExamDNADistribution;
  previousAbility: number;         // From student_learning_dna
  
  // Difficulty distribution tracking
  difficultyServed: { easy: number; medium: number; hard: number };
  
  isComplete: boolean;
}

// ─── Constants ───

const FAST_THRESHOLD_MS = 30_000;
const SLOW_THRESHOLD_MS = 60_000;

const CONFIDENCE_FACTORS: Record<ConfidencePhase, number> = {
  LOW: 0.4,
  MEDIUM: 0.7,
  HIGH: 1.0,
};

const DIFFICULTY_WEIGHTS: Record<string, number> = {
  easy: 30,
  medium: 50,
  hard: 80,
};

const DIFFICULTY_NUMERIC: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

// Multi-factor scoring weights
const SCORING_WEIGHTS = {
  abilityMatch: 0.35,
  weakSkill: 0.35,
  examDNA: 0.15,
  topicVariety: 0.15,
};

// ─── Session Lifecycle ───

/**
 * Initialize a Smart Training session with cumulative data.
 */
export function createSTESession(
  skillMemory: SkillMemoryEntry[] = [],
  examDNA: ExamDNADistribution = { easy_pct: 30, medium_pct: 50, hard_pct: 20 },
  previousAbility: number = 50,
): STESessionState {
  // Determine starting difficulty from previous ability
  const startDifficulty: 'easy' | 'medium' | 'hard' =
    previousAbility >= 70 ? 'hard' :
    previousAbility >= 40 ? 'medium' : 'easy';

  return {
    currentAbility: previousAbility,
    currentDifficulty: startDifficulty,
    confidencePhase: 'LOW',
    questionsServed: [],
    answers: [],
    accuracyRate: 0,
    avgResponseTimeMs: 0,
    difficultyProgression: [startDifficulty],
    topicPerformance: {},
    sectionPerformance: {},
    skillMemory,
    examDNA,
    previousAbility,
    difficultyServed: { easy: 0, medium: 0, hard: 0 },
    isComplete: false,
  };
}

// ─── Multi-Factor Question Selection ───

/**
 * Select the next question using multi-factor scoring.
 * NextQuestionScore = AbilityMatch + WeakSkillWeight + ExamDNAPriority + TopicVariety
 */
export function selectNextSmartQuestion(
  state: STESessionState,
  pool: STEQuestion[],
  maxQuestions: number = 15,
): STEQuestion | null {
  if (state.questionsServed.length >= maxQuestions) return null;

  const servedIds = new Set(state.questionsServed.map(q => q.id));
  const available = pool.filter(q => !servedIds.has(q.id));
  if (available.length === 0) return null;

  // Build weak sections set
  const weakSections = new Set(
    state.skillMemory
      .filter(s => s.skill_score < 60)
      .map(s => s.section_id)
  );

  // Current difficulty distribution ratios
  const totalServed = state.questionsServed.length || 1;
  const currentEasyPct = (state.difficultyServed.easy / totalServed) * 100;
  const currentMedPct = (state.difficultyServed.medium / totalServed) * 100;
  const currentHardPct = (state.difficultyServed.hard / totalServed) * 100;

  // Score each candidate
  let bestScore = -Infinity;
  let bestQuestion: STEQuestion | null = null;

  for (const q of available) {
    let score = 0;

    // 1. Ability Match: How close is this question's difficulty to current ability?
    const abilityDiffLevel = abilityToDifficulty(state.currentAbility);
    const qDiffNum = DIFFICULTY_NUMERIC[q.difficulty] || 2;
    const targetDiffNum = DIFFICULTY_NUMERIC[abilityDiffLevel] || 2;
    const abilityMatchScore = 1 - Math.abs(qDiffNum - targetDiffNum) / 2;
    score += abilityMatchScore * SCORING_WEIGHTS.abilityMatch * 100;

    // 2. Weak Skill Weight: Prioritize sections where skill_score < 60
    if (weakSections.has(q.sectionId)) {
      const skillEntry = state.skillMemory.find(s => s.section_id === q.sectionId);
      const skillScore = skillEntry?.skill_score ?? 50;
      // Lower skill = higher priority (normalize: 0→1 where 0 skill = 1.0 priority)
      const weaknessScore = Math.max(0, (60 - skillScore) / 60);
      score += weaknessScore * SCORING_WEIGHTS.weakSkill * 100;
    }

    // 3. Exam DNA Distribution: Prefer difficulty that's underrepresented
    const dnaScore = calculateDNAAlignmentScore(
      q.difficulty,
      state.examDNA,
      currentEasyPct,
      currentMedPct,
      currentHardPct
    );
    score += dnaScore * SCORING_WEIGHTS.examDNA * 100;

    // 4. Topic Variety: Prefer topics with fewer attempts
    const topicAttempts = state.topicPerformance[q.topic]?.total || 0;
    const varietyScore = 1 / (1 + topicAttempts);
    score += varietyScore * SCORING_WEIGHTS.topicVariety * 100;

    if (score > bestScore) {
      bestScore = score;
      bestQuestion = q;
    }
  }

  return bestQuestion || available[0];
}

function abilityToDifficulty(ability: number): 'easy' | 'medium' | 'hard' {
  if (ability >= 70) return 'hard';
  if (ability >= 40) return 'medium';
  return 'easy';
}

function calculateDNAAlignmentScore(
  difficulty: 'easy' | 'medium' | 'hard',
  dna: ExamDNADistribution,
  currentEasyPct: number,
  currentMedPct: number,
  currentHardPct: number,
): number {
  // How much is this difficulty underrepresented vs DNA target?
  const targets: Record<string, number> = {
    easy: dna.easy_pct,
    medium: dna.medium_pct,
    hard: dna.hard_pct,
  };
  const current: Record<string, number> = {
    easy: currentEasyPct,
    medium: currentMedPct,
    hard: currentHardPct,
  };

  const target = targets[difficulty] || 33;
  const actual = current[difficulty] || 0;
  const deficit = Math.max(0, target - actual);

  // Normalize: higher deficit = higher score (0–1)
  return Math.min(1, deficit / 50);
}

// ─── Answer Processing with Confidence Stabilization ───

/**
 * Process a student's answer and update the adaptive state.
 * Uses confidence-based difficulty stabilization to prevent oscillation.
 */
export function processSmartAnswer(
  state: STESessionState,
  answer: STEAnswerRecord,
): STESessionState {
  const newAnswers = [...state.answers, answer];
  const totalCorrect = newAnswers.filter(a => a.isCorrect).length;
  const accuracyRate = Math.round((totalCorrect / newAnswers.length) * 100);
  const avgTime = Math.round(
    newAnswers.reduce((s, a) => s + a.timeSpentMs, 0) / newAnswers.length
  );

  // Update topic performance
  const topicPerf = { ...state.topicPerformance };
  if (!topicPerf[answer.topic]) topicPerf[answer.topic] = { correct: 0, total: 0 };
  topicPerf[answer.topic] = {
    correct: topicPerf[answer.topic].correct + (answer.isCorrect ? 1 : 0),
    total: topicPerf[answer.topic].total + 1,
  };

  // Update section performance
  const sectionPerf = { ...state.sectionPerformance };
  if (!sectionPerf[answer.sectionId]) sectionPerf[answer.sectionId] = { correct: 0, total: 0 };
  sectionPerf[answer.sectionId] = {
    correct: sectionPerf[answer.sectionId].correct + (answer.isCorrect ? 1 : 0),
    total: sectionPerf[answer.sectionId].total + 1,
  };

  // Update difficulty distribution
  const diffServed = { ...state.difficultyServed };
  diffServed[answer.difficulty]++;

  // Determine confidence phase based on question count
  const questionCount = newAnswers.length;
  const confidencePhase: ConfidencePhase =
    questionCount <= 4 ? 'LOW' :
    questionCount <= 10 ? 'MEDIUM' : 'HIGH';

  // Calculate base difficulty shift
  const baseShift = calculateBaseShift(answer.isCorrect, answer.timeSpentMs);

  // Apply confidence factor to stabilize difficulty changes
  const confidenceFactor = CONFIDENCE_FACTORS[confidencePhase];
  const difficultyChange = baseShift * confidenceFactor;

  // Apply difficulty change
  const nextDifficulty = applyDifficultyChange(
    state.currentDifficulty,
    difficultyChange
  );

  // Update ability estimate (cumulative, not reset)
  const abilityEstimate = calculateCumulativeAbility(
    newAnswers,
    state.previousAbility
  );

  const difficultyProgression = [...state.difficultyProgression, nextDifficulty];

  return {
    ...state,
    currentAbility: abilityEstimate,
    currentDifficulty: nextDifficulty,
    confidencePhase,
    answers: newAnswers,
    accuracyRate,
    avgResponseTimeMs: avgTime,
    topicPerformance: topicPerf,
    sectionPerformance: sectionPerf,
    difficultyProgression,
    difficultyServed: diffServed,
  };
}

function calculateBaseShift(isCorrect: boolean, timeSpentMs: number): number {
  if (!isCorrect) return -1;
  if (timeSpentMs < FAST_THRESHOLD_MS) return 1;    // Correct + fast
  if (timeSpentMs > SLOW_THRESHOLD_MS) return 0;    // Correct + slow
  return 0.5;                                         // Correct + normal
}

function applyDifficultyChange(
  current: 'easy' | 'medium' | 'hard',
  change: number,
): 'easy' | 'medium' | 'hard' {
  const levels: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
  const currentIdx = levels.indexOf(current);
  
  // Round the change to determine if we actually move
  if (Math.abs(change) < 0.3) return current; // Too small a change, stay put
  
  const direction = change > 0 ? 1 : -1;
  const newIdx = Math.max(0, Math.min(2, currentIdx + direction));
  return levels[newIdx];
}

/**
 * Calculate cumulative ability score.
 * Blends session performance with previous ability for stability.
 */
function calculateCumulativeAbility(
  answers: STEAnswerRecord[],
  previousAbility: number,
): number {
  if (answers.length === 0) return previousAbility;

  // Weighted accuracy from this session
  let weightedCorrect = 0;
  let totalWeight = 0;
  for (const a of answers) {
    const weight = DIFFICULTY_WEIGHTS[a.difficulty] || 50;
    totalWeight += weight;
    if (a.isCorrect) weightedCorrect += weight;
  }
  const sessionAccuracy = totalWeight > 0 ? (weightedCorrect / totalWeight) * 100 : 50;

  // Speed bonus
  const fastCorrect = answers.filter(a => a.isCorrect && a.timeSpentMs < FAST_THRESHOLD_MS).length;
  const speedBonus = Math.min(10, answers.length > 0 ? (fastCorrect / answers.length) * 15 : 0);

  // Hard question bonus
  const hardCorrect = answers.filter(a => a.isCorrect && a.difficulty === 'hard').length;
  const diffBonus = Math.min(8, hardCorrect * 3);

  const sessionAbility = Math.min(100, Math.max(0, Math.round(sessionAccuracy + speedBonus + diffBonus)));

  // Blend: weight session more as more questions are answered
  // At 1 question: 80% previous, 20% session
  // At 15 questions: 30% previous, 70% session
  const sessionWeight = Math.min(0.7, 0.2 + (answers.length / 15) * 0.5);
  const blended = Math.round(
    previousAbility * (1 - sessionWeight) + sessionAbility * sessionWeight
  );

  return Math.min(100, Math.max(0, blended));
}

// ─── Session Summary ───

export interface STESessionSummary {
  abilityScore: number;
  previousAbility: number;
  abilityDelta: number;
  accuracyRate: number;
  speedRating: string;
  accuracyRating: string;
  weakTopics: { topic: string; accuracy: number; attempted: number }[];
  strongTopics: { topic: string; accuracy: number; attempted: number }[];
  weakSections: { sectionId: string; sectionName: string; accuracy: number }[];
  strongSections: { sectionId: string; sectionName: string; accuracy: number }[];
  difficultyProgression: ('easy' | 'medium' | 'hard')[];
  totalQuestions: number;
  correctCount: number;
  confidencePhase: ConfidencePhase;
}

export function generateSTESummary(state: STESessionState): STESessionSummary {
  const weakTopics = Object.entries(state.topicPerformance)
    .filter(([, p]) => p.total >= 2 && (p.correct / p.total) < 0.5)
    .map(([topic, p]) => ({
      topic,
      accuracy: Math.round((p.correct / p.total) * 100),
      attempted: p.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const strongTopics = Object.entries(state.topicPerformance)
    .filter(([, p]) => p.total >= 2 && (p.correct / p.total) >= 0.7)
    .map(([topic, p]) => ({
      topic,
      accuracy: Math.round((p.correct / p.total) * 100),
      attempted: p.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Section-level analysis
  const sectionNameMap = new Map(state.skillMemory.map(s => [s.section_id, s.section_name]));
  
  const weakSections = Object.entries(state.sectionPerformance)
    .filter(([, p]) => p.total >= 2 && (p.correct / p.total) < 0.5)
    .map(([sectionId, p]) => ({
      sectionId,
      sectionName: sectionNameMap.get(sectionId) || sectionId,
      accuracy: Math.round((p.correct / p.total) * 100),
    }));

  const strongSections = Object.entries(state.sectionPerformance)
    .filter(([, p]) => p.total >= 2 && (p.correct / p.total) >= 0.7)
    .map(([sectionId, p]) => ({
      sectionId,
      sectionName: sectionNameMap.get(sectionId) || sectionId,
      accuracy: Math.round((p.correct / p.total) * 100),
    }));

  const speedRating =
    state.avgResponseTimeMs < 25_000 ? 'سريع' :
    state.avgResponseTimeMs < 45_000 ? 'متوسط' : 'بطيء';

  const accuracyRating =
    state.accuracyRate >= 80 ? 'ممتاز' :
    state.accuracyRate >= 60 ? 'جيد' :
    state.accuracyRate >= 40 ? 'متوسط' : 'يحتاج تحسين';

  return {
    abilityScore: state.currentAbility,
    previousAbility: state.previousAbility,
    abilityDelta: state.currentAbility - state.previousAbility,
    accuracyRate: state.accuracyRate,
    speedRating,
    accuracyRating,
    weakTopics,
    strongTopics,
    weakSections,
    strongSections,
    difficultyProgression: state.difficultyProgression,
    totalQuestions: state.answers.length,
    correctCount: state.answers.filter(a => a.isCorrect).length,
    confidencePhase: state.confidencePhase,
  };
}
