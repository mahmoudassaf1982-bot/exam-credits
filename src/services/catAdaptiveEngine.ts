/**
 * CAT (Computer Adaptive Testing) Engine
 * 
 * Manages real-time adaptive question selection during a training session.
 * Questions are pre-loaded in a pool grouped by difficulty, and the engine
 * dynamically selects the next question based on student performance.
 */

export interface CATQuestion {
  id: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  sectionId: string;
  sectionName: string;
}

export interface CATAnswerRecord {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  timeSpentMs: number;
  topic: string;
}

export interface CATSessionState {
  currentDifficulty: 'easy' | 'medium' | 'hard';
  abilityEstimate: number; // 0–100
  questionsServed: CATQuestion[];
  answers: CATAnswerRecord[];
  difficultyProgression: ('easy' | 'medium' | 'hard')[];
  accuracyRate: number;
  avgResponseTimeMs: number;
  topicPerformance: Record<string, { correct: number; total: number }>;
  isComplete: boolean;
}

const FAST_THRESHOLD_MS = 30_000;   // < 30s = fast
const SLOW_THRESHOLD_MS = 60_000;   // > 60s = slow

const DIFFICULTY_WEIGHTS: Record<string, number> = {
  easy: 30,
  medium: 50,
  hard: 80,
};

/**
 * Initialize a new CAT session from a question pool.
 */
export function createCATSession(): CATSessionState {
  return {
    currentDifficulty: 'medium',
    abilityEstimate: 50,
    questionsServed: [],
    answers: [],
    difficultyProgression: ['medium'],
    accuracyRate: 0,
    avgResponseTimeMs: 0,
    topicPerformance: {},
    isComplete: false,
  };
}

/**
 * Select the next question from the pool based on current adaptive state.
 */
export function selectNextQuestion(
  state: CATSessionState,
  pool: CATQuestion[],
  maxQuestions: number = 20
): CATQuestion | null {
  if (state.questionsServed.length >= maxQuestions) {
    return null;
  }

  const servedIds = new Set(state.questionsServed.map(q => q.id));
  const available = pool.filter(q => !servedIds.has(q.id));

  if (available.length === 0) return null;

  // Prefer questions matching current difficulty
  const targetDiff = state.currentDifficulty;
  const matchingDiff = available.filter(q => q.difficulty === targetDiff);

  // If we have matching difficulty questions, pick from those
  // Prefer topics where the student has fewer attempts for variety
  if (matchingDiff.length > 0) {
    return pickByTopicVariety(matchingDiff, state);
  }

  // Fallback: pick closest difficulty
  const diffOrder: ('easy' | 'medium' | 'hard')[] =
    targetDiff === 'easy' ? ['easy', 'medium', 'hard'] :
    targetDiff === 'hard' ? ['hard', 'medium', 'easy'] :
    ['medium', 'easy', 'hard'];

  for (const diff of diffOrder) {
    const candidates = available.filter(q => q.difficulty === diff);
    if (candidates.length > 0) {
      return pickByTopicVariety(candidates, state);
    }
  }

  return available[0] || null;
}

function pickByTopicVariety(candidates: CATQuestion[], state: CATSessionState): CATQuestion {
  // Sort by least-attempted topic first
  const sorted = [...candidates].sort((a, b) => {
    const aCount = state.topicPerformance[a.topic]?.total || 0;
    const bCount = state.topicPerformance[b.topic]?.total || 0;
    return aCount - bCount;
  });
  return sorted[0];
}

/**
 * Process a student's answer and update the adaptive state.
 */
export function processAnswer(
  state: CATSessionState,
  answer: CATAnswerRecord
): CATSessionState {
  const newAnswers = [...state.answers, answer];
  const totalCorrect = newAnswers.filter(a => a.isCorrect).length;
  const accuracyRate = (totalCorrect / newAnswers.length) * 100;
  const avgTime = newAnswers.reduce((s, a) => s + a.timeSpentMs, 0) / newAnswers.length;

  // Update topic performance
  const topicPerf = { ...state.topicPerformance };
  if (!topicPerf[answer.topic]) {
    topicPerf[answer.topic] = { correct: 0, total: 0 };
  }
  topicPerf[answer.topic] = {
    correct: topicPerf[answer.topic].correct + (answer.isCorrect ? 1 : 0),
    total: topicPerf[answer.topic].total + 1,
  };

  // Determine next difficulty
  const nextDifficulty = calculateNextDifficulty(
    state.currentDifficulty,
    answer.isCorrect,
    answer.timeSpentMs
  );

  // Update ability estimate using weighted scoring
  const abilityEstimate = calculateAbilityEstimate(newAnswers);

  const difficultyProgression = [...state.difficultyProgression, nextDifficulty];

  return {
    ...state,
    currentDifficulty: nextDifficulty,
    abilityEstimate,
    answers: newAnswers,
    accuracyRate: Math.round(accuracyRate),
    avgResponseTimeMs: Math.round(avgTime),
    topicPerformance: topicPerf,
    difficultyProgression,
  };
}

function calculateNextDifficulty(
  current: 'easy' | 'medium' | 'hard',
  isCorrect: boolean,
  timeSpentMs: number
): 'easy' | 'medium' | 'hard' {
  if (!isCorrect) {
    // Incorrect → decrease difficulty
    return current === 'hard' ? 'medium' : current === 'medium' ? 'easy' : 'easy';
  }

  if (timeSpentMs < FAST_THRESHOLD_MS) {
    // Correct + fast → increase difficulty
    return current === 'easy' ? 'medium' : current === 'medium' ? 'hard' : 'hard';
  }

  if (timeSpentMs > SLOW_THRESHOLD_MS) {
    // Correct + slow → keep same difficulty
    return current;
  }

  // Correct + normal speed → slight increase
  return current === 'easy' ? 'medium' : current;
}

/**
 * Calculate ability estimate (0-100) using weighted scoring.
 * Harder questions contribute more to the score.
 */
function calculateAbilityEstimate(answers: CATAnswerRecord[]): number {
  if (answers.length === 0) return 50;

  let weightedCorrect = 0;
  let totalWeight = 0;

  for (const a of answers) {
    const weight = DIFFICULTY_WEIGHTS[a.difficulty] || 50;
    totalWeight += weight;
    if (a.isCorrect) {
      weightedCorrect += weight;
    }
  }

  // Base score from weighted accuracy
  const weightedAccuracy = (weightedCorrect / totalWeight) * 100;

  // Speed bonus: fast correct answers get a small boost
  const fastCorrect = answers.filter(a => a.isCorrect && a.timeSpentMs < FAST_THRESHOLD_MS).length;
  const speedBonus = Math.min(10, (fastCorrect / answers.length) * 15);

  // Difficulty progression bonus: reaching harder questions is good
  const hardCorrect = answers.filter(a => a.isCorrect && a.difficulty === 'hard').length;
  const difficultyBonus = Math.min(8, hardCorrect * 3);

  return Math.min(100, Math.max(0, Math.round(weightedAccuracy + speedBonus + difficultyBonus)));
}

/**
 * Generate a final summary for the CAT session.
 */
export function generateCATSummary(state: CATSessionState) {
  const weakTopics = Object.entries(state.topicPerformance)
    .filter(([, perf]) => perf.total >= 2 && (perf.correct / perf.total) < 0.5)
    .map(([topic, perf]) => ({
      topic,
      accuracy: Math.round((perf.correct / perf.total) * 100),
      attempted: perf.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const strongTopics = Object.entries(state.topicPerformance)
    .filter(([, perf]) => perf.total >= 2 && (perf.correct / perf.total) >= 0.7)
    .map(([topic, perf]) => ({
      topic,
      accuracy: Math.round((perf.correct / perf.total) * 100),
      attempted: perf.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const speedRating =
    state.avgResponseTimeMs < 25_000 ? 'سريع' :
    state.avgResponseTimeMs < 45_000 ? 'متوسط' : 'بطيء';

  const accuracyRating =
    state.accuracyRate >= 80 ? 'ممتاز' :
    state.accuracyRate >= 60 ? 'جيد' :
    state.accuracyRate >= 40 ? 'متوسط' : 'يحتاج تحسين';

  return {
    abilityScore: state.abilityEstimate,
    accuracyRate: state.accuracyRate,
    speedRating,
    accuracyRating,
    weakTopics,
    strongTopics,
    difficultyProgression: state.difficultyProgression,
    totalQuestions: state.answers.length,
    correctCount: state.answers.filter(a => a.isCorrect).length,
  };
}
