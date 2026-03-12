import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export type CoachVisualState = 'idle' | 'attention' | 'intervention' | 'conversation';
export type CoachMode = 'training_coach' | 'learning_tutor' | 'platform_guide';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  mode?: CoachMode;
  timestamp: number;
}

export interface InterventionData {
  message: string;
  type: 'weakness_streak' | 'slow_speed' | 'improvement' | 'ability_shift';
  detectedConcept?: string;
  detectedSection?: string;
  detectedTopic?: string;
  errorCount?: number;
  suggestedActions?: ('retry_similar' | 'hint' | 'continue')[];
}

export interface ExamSessionContext {
  exam_template_id?: string;
  exam_name?: string;
  country_id?: string;
  session_mode?: 'smart_training' | 'practice' | 'simulation';
}

export interface QuestionContext {
  id?: string;
  text_ar?: string;
  topic?: string;
  difficulty?: string;
  section_id?: string;
  section_name?: string;
  options?: { id: string; text: string }[];
  correct_answer?: string;
  student_answer?: string;
  explanation?: string;
}

interface SmartCoachContextType {
  // Visual state
  visualState: CoachVisualState;
  setVisualState: (state: CoachVisualState) => void;
  
  // Chat
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastCoachMessage: (content: string, mode?: CoachMode) => void;
  clearMessages: () => void;
  
  // Mode context
  currentPage: string;
  setCurrentPage: (page: string) => void;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  sessionType: string;
  setSessionType: (type: string) => void;
  currentQuestion: QuestionContext | null;
  setCurrentQuestion: (q: QuestionContext | null) => void;
  
  // Exam session context
  examContext: ExamSessionContext;
  setExamContext: (ctx: ExamSessionContext) => void;
  
  // Interventions
  intervention: InterventionData | null;
  triggerIntervention: (data: InterventionData) => void;
  dismissIntervention: () => void;
  interventionCount: number;
  
  // Error streak tracking
  errorStreak: number;
  recentErrors: { topic?: string; sectionId?: string; sectionName?: string; concept?: string }[];
  recordAnswerResult: (isCorrect: boolean, meta?: { topic?: string; sectionId?: string; sectionName?: string }) => void;
  resetErrorStreak: () => void;
  
  // Visibility
  visible: boolean;
  setVisible: (v: boolean) => void;
  
  // Welcome intro
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
}

const SmartCoachContext = createContext<SmartCoachContextType | null>(null);

/** Detect the dominant concept/topic from recent errors */
function detectErrorPattern(errors: { topic?: string; sectionId?: string; sectionName?: string }[]): {
  concept?: string; section?: string; topic?: string;
} {
  if (errors.length === 0) return {};
  
  // Count topic frequency
  const topicCounts: Record<string, number> = {};
  const sectionCounts: Record<string, { count: number; name?: string }> = {};
  
  for (const e of errors) {
    if (e.topic) topicCounts[e.topic] = (topicCounts[e.topic] || 0) + 1;
    if (e.sectionId) {
      if (!sectionCounts[e.sectionId]) sectionCounts[e.sectionId] = { count: 0, name: e.sectionName };
      sectionCounts[e.sectionId].count++;
    }
  }
  
  // Find most frequent
  let topTopic: string | undefined;
  let topTopicCount = 0;
  for (const [t, c] of Object.entries(topicCounts)) {
    if (c > topTopicCount) { topTopic = t; topTopicCount = c; }
  }
  
  let topSection: string | undefined;
  let topSectionName: string | undefined;
  let topSectionCount = 0;
  for (const [s, info] of Object.entries(sectionCounts)) {
    if (info.count > topSectionCount) { topSection = s; topSectionName = info.name; topSectionCount = info.count; }
  }
  
  return {
    concept: topTopic,
    section: topSectionName || topSection,
    topic: topTopic,
  };
}

function buildInterventionMessage(pattern: { concept?: string; section?: string; topic?: string }, errorCount: number): string {
  if (pattern.section && pattern.topic) {
    return `لاحظنا أنك أخطأت في ${errorCount} أسئلة من قسم "${pattern.section}" في موضوع "${pattern.topic}". دعني أساعدك في فهم المفهوم 💡`;
  }
  if (pattern.section) {
    return `لاحظنا أنك تواجه صعوبة في قسم "${pattern.section}" — ${errorCount} أخطاء متتالية. اضغط عليّ لمساعدتك في فهم الأنماط 💡`;
  }
  if (pattern.topic) {
    return `لاحظنا أنك أخطأت في عدة أسئلة حول "${pattern.topic}". يمكنني مساعدتك في فهم المفهوم 💡`;
  }
  return `لاحظنا أنك أخطأت في ${errorCount} أسئلة متتالية. اضغط عليّ وسأساعدك في التفكير بطريقة مختلفة 💡`;
}

export function SmartCoachProvider({ children }: { children: ReactNode }) {
  const [visualState, setVisualState] = useState<CoachVisualState>('idle');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentPage, setCurrentPage] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionType, setSessionType] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionContext | null>(null);
  const [examContext, setExamContext] = useState<ExamSessionContext>({});
  const [intervention, setIntervention] = useState<InterventionData | null>(null);
  const [interventionCount, setInterventionCount] = useState(0);
  const [visible, setVisible] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [errorStreak, setErrorStreak] = useState(0);
  const [recentErrors, setRecentErrors] = useState<{ topic?: string; sectionId?: string; sectionName?: string }[]>([]);
  
  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }]);
  }, []);
  
  const updateLastCoachMessage = useCallback((content: string, mode?: CoachMode) => {
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'coach') {
          updated[i] = { ...updated[i], content, mode };
          break;
        }
      }
      return updated;
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);
  
  const triggerIntervention = useCallback((data: InterventionData) => {
    if (interventionCount >= 3) return; // max 3 per session
    setIntervention(data);
    setInterventionCount(c => c + 1);
    setVisualState('intervention');
  }, [interventionCount]);
  
  const dismissIntervention = useCallback(() => {
    setIntervention(null);
    setVisualState('idle');
  }, []);

  const resetErrorStreak = useCallback(() => {
    setErrorStreak(0);
    setRecentErrors([]);
  }, []);

  const recordAnswerResult = useCallback((isCorrect: boolean, meta?: { topic?: string; sectionId?: string; sectionName?: string }) => {
    if (isCorrect) {
      setErrorStreak(0);
      setRecentErrors([]);
      return;
    }

    setRecentErrors(prev => [...prev.slice(-9), meta || {}]);

    setErrorStreak(prev => {
      const newStreak = prev + 1;

      if (newStreak === 2) {
        setVisualState('attention');
      } else if (newStreak >= 3) {
        if (interventionCount < 3) {
          // Detect error pattern from recent errors
          setRecentErrors(currentErrors => {
            const allErrors = [...currentErrors];
            const pattern = detectErrorPattern(allErrors);
            const msg = buildInterventionMessage(pattern, newStreak);
            
            setIntervention({
              message: msg,
              type: 'weakness_streak',
              detectedConcept: pattern.concept,
              detectedSection: pattern.section,
              detectedTopic: pattern.topic,
              errorCount: newStreak,
              suggestedActions: ['retry_similar', 'hint', 'continue'],
            });
            setInterventionCount(c => c + 1);
            setVisualState('intervention');
            return allErrors;
          });
        }
      }

      return newStreak;
    });
  }, [interventionCount]);
  
  return (
    <SmartCoachContext.Provider value={{
      visualState, setVisualState,
      chatOpen, setChatOpen,
      messages, addMessage, updateLastCoachMessage, clearMessages,
      currentPage, setCurrentPage,
      sessionActive, setSessionActive,
      sessionType, setSessionType,
      currentQuestion, setCurrentQuestion,
      examContext, setExamContext,
      intervention, triggerIntervention, dismissIntervention, interventionCount,
      errorStreak, recentErrors, recordAnswerResult, resetErrorStreak,
      visible, setVisible,
      showIntro, setShowIntro,
    }}>
      {children}
    </SmartCoachContext.Provider>
  );
}

export function useSmartCoach() {
  const ctx = useContext(SmartCoachContext);
  if (!ctx) throw new Error('useSmartCoach must be used within SmartCoachProvider');
  return ctx;
}
