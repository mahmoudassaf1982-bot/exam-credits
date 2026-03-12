import { useState, useRef, useCallback, useEffect } from 'react';
import { useSmartCoach } from '@/components/SmartCoach/SmartCoachContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Zap,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  ChevronLeft,
  Brain,
  Shield,
} from 'lucide-react';
import {
  createSTESession,
  selectNextSmartQuestion,
  processSmartAnswer,
  generateSTESummary,
  type STEQuestion,
  type STESessionState,
  type SkillMemoryEntry,
  type ExamDNADistribution,
  type ConfidencePhase,
} from '@/services/smartTrainingEngine';

interface Props {
  questionPool: STEQuestion[];
  answerKeys: Record<string, { correct_option_id: string; explanation?: string }>;
  maxQuestions?: number;
  skillMemory?: SkillMemoryEntry[];
  examDNA?: ExamDNADistribution;
  previousAbility?: number;
  onComplete: (
    summary: ReturnType<typeof generateSTESummary>,
    answers: Record<string, string>,
    steState: STESessionState,
  ) => void;
  onExit: () => void;
}

const difficultyLabels: Record<string, { label: string; color: string }> = {
  easy: { label: 'سهل', color: 'text-success' },
  medium: { label: 'متوسط', color: 'text-gold' },
  hard: { label: 'صعب', color: 'text-destructive' },
};

const confidenceLabels: Record<ConfidencePhase, { label: string; icon: typeof Shield }> = {
  LOW: { label: 'تقييم أولي', icon: Target },
  MEDIUM: { label: 'تعلّم تكيّفي', icon: Brain },
  HIGH: { label: 'تثبيت المستوى', icon: Shield },
};

export default function SmartQuestionFlow({
  questionPool,
  answerKeys,
  maxQuestions = 15,
  skillMemory = [],
  examDNA = { easy_pct: 30, medium_pct: 50, hard_pct: 20 },
  previousAbility = 50,
  onComplete,
  onExit,
}: Props) {
  const { recordAnswerResult, resetErrorStreak, sessionActive, setCurrentQuestion: setCoachQuestion } = useSmartCoach();

  // Reset error streak when component mounts (new session)
  useEffect(() => {
    resetErrorStreak();
    return () => {
      resetErrorStreak();
      setCoachQuestion(null);
    };
  }, [resetErrorStreak, setCoachQuestion]);

  const [steState, setSteState] = useState<STESessionState>(() =>
    createSTESession(skillMemory, examDNA, previousAbility)
  );
  const [currentQuestion, setCurrentQuestion] = useState<STEQuestion | null>(() =>
    selectNextSmartQuestion(
      createSTESession(skillMemory, examDNA, previousAbility),
      questionPool,
      maxQuestions,
    )
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const questionStartRef = useRef<number>(Date.now());
  const answersMapRef = useRef<Record<string, string>>({});

  // Sync current question to SmartCoach context
  useEffect(() => {
    if (!currentQuestion) return;
    const key = answerKeys[currentQuestion.id];
    setCoachQuestion({
      id: currentQuestion.id,
      text_ar: currentQuestion.text_ar,
      topic: currentQuestion.topic,
      difficulty: currentQuestion.difficulty,
      section_id: currentQuestion.sectionId,
      section_name: currentQuestion.sectionName,
      options: currentQuestion.options.map(o => ({ id: o.id, text: o.textAr })),
      correct_answer: key?.correct_option_id,
      explanation: key?.explanation,
    });
  }, [currentQuestion, answerKeys, setCoachQuestion]);

  const handleSelectOption = useCallback((optionId: string) => {
    if (showFeedback) return;
    setSelectedOption(optionId);
  }, [showFeedback]);

  const handleConfirmAnswer = useCallback(() => {
    if (!selectedOption || !currentQuestion || showFeedback) return;

    const timeSpent = Date.now() - questionStartRef.current;
    answersMapRef.current[currentQuestion.id] = selectedOption;

    const key = answerKeys[currentQuestion.id];
    const isCorrect = key ? selectedOption === key.correct_option_id : false;

    setFeedbackCorrect(isCorrect);
    setShowFeedback(true);

    // Track streak for SARIS coach interventions (smart training only)
    if (sessionActive) {
      recordAnswerResult(isCorrect, {
        topic: currentQuestion.topic,
        sectionId: currentQuestion.sectionId,
        sectionName: currentQuestion.sectionName,
      });
    }

    // Update coach with student's answer
    // Update coach with student's answer - no callback form needed
    if (currentQuestion) {
      const key = answerKeys[currentQuestion.id];
      setCoachQuestion({
        id: currentQuestion.id,
        text_ar: currentQuestion.text_ar,
        topic: currentQuestion.topic,
        difficulty: currentQuestion.difficulty,
        section_id: currentQuestion.sectionId,
        section_name: currentQuestion.sectionName,
        options: currentQuestion.options.map(o => ({ id: o.id, text: o.textAr })),
        correct_answer: key?.correct_option_id,
        student_answer: selectedOption || undefined,
        explanation: key?.explanation,
      });
    }
    setTimeout(() => {
      const answer = {
        questionId: currentQuestion.id,
        selectedOptionId: selectedOption,
        isCorrect,
        difficulty: currentQuestion.difficulty,
        timeSpentMs: timeSpent,
        topic: currentQuestion.topic,
        sectionId: currentQuestion.sectionId,
      };

      const newState = processSmartAnswer(steState, answer);
      newState.questionsServed = [...steState.questionsServed, currentQuestion];

      const nextQ = selectNextSmartQuestion(newState, questionPool, maxQuestions);

      if (!nextQ || newState.answers.length >= maxQuestions) {
        const finalState = { ...newState, isComplete: true };
        const summary = generateSTESummary(finalState);
        onComplete(summary, answersMapRef.current, finalState);
        return;
      }

      setSteState(newState);
      setCurrentQuestion(nextQ);
      setSelectedOption(null);
      setShowFeedback(false);
      setFeedbackCorrect(false);
      questionStartRef.current = Date.now();
    }, 1200);
  }, [selectedOption, currentQuestion, steState, questionPool, maxQuestions, onComplete, showFeedback, answerKeys, sessionActive, recordAnswerResult]);

  if (!currentQuestion) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <p className="text-muted-foreground">لا توجد أسئلة متاحة</p>
      </div>
    );
  }

  const questionNum = steState.answers.length + 1;
  const progressPct = (steState.answers.length / maxQuestions) * 100;
  const diff = difficultyLabels[steState.currentDifficulty] || difficultyLabels.medium;
  const phase = confidenceLabels[steState.confidencePhase];
  const PhaseIcon = phase.icon;
  const correctKey = answerKeys[currentQuestion.id]?.correct_option_id;
  const abilityDelta = steState.currentAbility - steState.previousAbility;

  return (
    <div className="space-y-4">
      {/* Smart adaptive header */}
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">تدريب ذكي</span>
            </div>
            <div className={`flex items-center gap-1 text-xs font-medium ${diff.color}`}>
              <Target className="h-3 w-3" />
              {diff.label}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <PhaseIcon className="h-3 w-3" />
              {phase.label}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{steState.answers.length}/{maxQuestions} سؤال</span>
            <span className="font-mono font-bold text-primary">
              {steState.currentAbility}%
              {abilityDelta !== 0 && (
                <span className={abilityDelta > 0 ? 'text-success' : 'text-destructive'}>
                  {' '}{abilityDelta > 0 ? '+' : ''}{abilityDelta}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Difficulty progression bar */}
      <div className="flex items-center gap-0.5">
        {steState.difficultyProgression.map((d, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              d === 'easy' ? 'bg-success' : d === 'medium' ? 'bg-gold' : 'bg-destructive'
            } ${i === steState.difficultyProgression.length - 1 ? 'opacity-100' : 'opacity-40'}`}
          />
        ))}
        {Array.from({ length: Math.max(0, maxQuestions - steState.difficultyProgression.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="h-1.5 flex-1 rounded-full bg-muted" />
        ))}
      </div>

      <Progress value={progressPct} className="h-1.5" />

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                {questionNum}
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold leading-relaxed">
                  {currentQuestion.text_ar}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {currentQuestion.sectionName} · {currentQuestion.topic}
                </p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {currentQuestion.options.map((opt, idx) => {
              const isSelected = selectedOption === opt.id;
              const optionLetters = ['أ', 'ب', 'ج', 'د'];
              const isCorrectOption = showFeedback && opt.id === correctKey;
              const isWrongSelected = showFeedback && isSelected && !feedbackCorrect;

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  disabled={showFeedback}
                  className={`w-full flex items-center gap-4 rounded-xl border p-4 text-right transition-all
                    ${showFeedback && isCorrectOption
                      ? 'border-success bg-success/10 ring-2 ring-success/20'
                      : isWrongSelected
                      ? 'border-destructive bg-destructive/10 ring-2 ring-destructive/20'
                      : isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
                    }
                    ${showFeedback ? 'cursor-not-allowed' : ''}`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold flex-shrink-0
                    ${showFeedback && isCorrectOption ? 'bg-success text-success-foreground'
                      : isWrongSelected ? 'bg-destructive text-destructive-foreground'
                      : isSelected ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'}`}>
                    {optionLetters[idx] || idx + 1}
                  </div>
                  <span className="font-medium">{opt.textAr}</span>
                  {showFeedback && isCorrectOption && (
                    <CheckCircle2 className="h-5 w-5 text-success mr-auto flex-shrink-0" />
                  )}
                  {isWrongSelected && (
                    <XCircle className="h-5 w-5 text-destructive mr-auto flex-shrink-0" />
                  )}
                  {isSelected && !showFeedback && (
                    <CheckCircle2 className="h-5 w-5 text-primary mr-auto flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl p-3 text-center text-sm font-semibold ${
                feedbackCorrect
                  ? 'bg-success/10 text-success border border-success/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {feedbackCorrect ? '✅ إجابة صحيحة!' : '❌ إجابة خاطئة'}
            </motion.div>
          )}

          {/* Confirm button */}
          {selectedOption && !showFeedback && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Button onClick={handleConfirmAnswer} className="w-full gradient-primary text-primary-foreground">
                تأكيد الإجابة
                <ChevronLeft className="mr-1 h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Live stats footer */}
      {steState.answers.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            الدقة: {steState.accuracyRate}%
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            متوسط: {Math.round(steState.avgResponseTimeMs / 1000)}ث
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            القدرة: {steState.currentAbility}
          </span>
        </div>
      )}
    </div>
  );
}
