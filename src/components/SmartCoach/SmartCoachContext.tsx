import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type CoachVisualState = 'idle' | 'attention' | 'intervention' | 'conversation';
export type CoachMode = 'training_coach' | 'learning_tutor' | 'platform_guide';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  mode?: CoachMode;
  timestamp: number;
}

interface InterventionData {
  message: string;
  type: 'weakness_streak' | 'slow_speed' | 'improvement' | 'ability_shift';
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
  currentQuestion: any;
  setCurrentQuestion: (q: any) => void;
  
  // Interventions
  intervention: InterventionData | null;
  triggerIntervention: (data: InterventionData) => void;
  dismissIntervention: () => void;
  interventionCount: number;
  
  // Visibility
  visible: boolean;
  setVisible: (v: boolean) => void;
  
  // Welcome intro
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
}

const SmartCoachContext = createContext<SmartCoachContextType | null>(null);

export function SmartCoachProvider({ children }: { children: ReactNode }) {
  const [visualState, setVisualState] = useState<CoachVisualState>('idle');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentPage, setCurrentPage] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionType, setSessionType] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [intervention, setIntervention] = useState<InterventionData | null>(null);
  const [interventionCount, setInterventionCount] = useState(0);
  const [visible, setVisible] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  
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
  
  return (
    <SmartCoachContext.Provider value={{
      visualState, setVisualState,
      chatOpen, setChatOpen,
      messages, addMessage, updateLastCoachMessage, clearMessages,
      currentPage, setCurrentPage,
      sessionActive, setSessionActive,
      sessionType, setSessionType,
      currentQuestion, setCurrentQuestion,
      intervention, triggerIntervention, dismissIntervention, interventionCount,
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
