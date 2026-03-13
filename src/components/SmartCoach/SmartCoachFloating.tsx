import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Send, X, Lightbulb, MessageCircle, Minimize2, HelpCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSmartCoach } from './SmartCoachContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import SarisCoachAvatar, { type CoachAnimState } from './SarisCoachAvatar';
import { pickRandom, trainingStartMessages, idleGreetings, type CoachMessage } from './coachMessages';

// Walking: full screen width traversal duration (seconds)
const WALK_DURATION = 18;
// Training mode: stationary position  
const TRAINING_POSITION = { bottom: 24, left: 16 };

// Training-specific quick actions (shown during active session or intervention)
const TRAINING_QUICK_ACTIONS = [
  'أعطني تلميحاً',
  'اشرح المفهوم',
  'لماذا إجابتي خاطئة؟',
];

// Generic quick actions (shown outside training)
const GENERIC_QUICK_ACTIONS = [
  'أين أجد التدريب الذكي؟',
  'كيف أحسن درجتي؟',
  'اشرح لي الاختبار',
];

export default function SmartCoachFloating() {
  const {
    visualState, setVisualState,
    chatOpen, setChatOpen,
    messages, addMessage, updateLastCoachMessage,
    currentPage, sessionActive, sessionType, currentQuestion,
    examContext, sessionId,
    intervention, dismissIntervention,
    isInterventionChat,
    visible, showIntro, setShowIntro,
    errorStreak, recentErrors,
  } = useSmartCoach();
  const { user } = useAuth();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [animState, setAnimState] = useState<CoachAnimState>('idle');
  const [hasEntered, setHasEntered] = useState(false);
  const [coachBubble, setCoachBubble] = useState<CoachMessage | null>(null);
  const walkXRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 800);
  const walkRafRef = useRef<number | null>(null);
  const walkControls = useAnimationControls();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Derive animation state from context ──
  useEffect(() => {
    if (!hasEntered) {
      setAnimState('waving');
      return;
    }
    if (loading) {
      setAnimState('thinking');
    } else if (chatOpen) {
      setAnimState('idle');
    } else if (visualState === 'attention' || visualState === 'intervention') {
      setAnimState('pointing');
    } else if (sessionActive) {
      setAnimState('guiding');
    } else {
      setAnimState('walking');
    }
  }, [hasEntered, loading, visualState, sessionActive, chatOpen]);

  // ── Walking entrance animation ──
  useEffect(() => {
    if (!visible || hasEntered) return;
    setAnimState('waving');
    const timer = setTimeout(() => {
      setAnimState('idle');
      setHasEntered(true);
      // Show greeting bubble
      const greeting = pickRandom(idleGreetings);
      setCoachBubble(greeting);
      setTimeout(() => setCoachBubble(null), 5000);
    }, 1500);
    return () => clearTimeout(timer);
  }, [visible, hasEntered]);

  // ── Training start announcement ──
  useEffect(() => {
    if (sessionActive && hasEntered) {
      setAnimState('celebrating');
      const msg = pickRandom(trainingStartMessages);
      setCoachBubble(msg);
      setTimeout(() => {
        setAnimState('guiding');
        setCoachBubble(null);
      }, 3000);
    }
  }, [sessionActive, hasEntered]);

  // Continuous walking animation — right to left, looping via RAF + controls.set
  useEffect(() => {
    if (chatOpen || !visible || sessionActive) {
      if (walkRafRef.current) cancelAnimationFrame(walkRafRef.current);
      return;
    }
    const speed = 1.5;
    let lastTime = 0;
    const step = (time: number) => {
      if (lastTime) {
        const dt = Math.min(time - lastTime, 50);
        walkXRef.current -= speed * (dt / 16.67);
        if (walkXRef.current < -120) {
          walkXRef.current = window.innerWidth;
        }
        walkControls.set({ x: walkXRef.current });
      }
      lastTime = time;
      walkRafRef.current = requestAnimationFrame(step);
    };
    // Init position before first frame
    walkControls.set({ x: walkXRef.current });
    walkRafRef.current = requestAnimationFrame(step);
    return () => { if (walkRafRef.current) cancelAnimationFrame(walkRafRef.current); };
  }, [chatOpen, visible, sessionActive, walkControls]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [chatOpen]);

  if (!user) return null;

  // Build full context payload for edge function
  const buildFullContext = () => {
    return {
      currentPage,
      sessionActive,
      sessionType,
      sessionId,
      exam_template_id: examContext.exam_template_id,
      exam_name: examContext.exam_name,
      country_id: examContext.country_id,
      session_mode: examContext.session_mode || sessionType,
      currentQuestion: currentQuestion ? {
        id: currentQuestion.id,
        text_ar: currentQuestion.text_ar,
        topic: currentQuestion.topic,
        difficulty: currentQuestion.difficulty,
        section_id: currentQuestion.section_id,
        section_name: currentQuestion.section_name,
        options: currentQuestion.options,
        correct_answer: currentQuestion.correct_answer,
        student_answer: currentQuestion.student_answer,
        explanation: currentQuestion.explanation,
      } : null,
      student_error_count: errorStreak,
      recent_error_topics: recentErrors.slice(-5).map(e => ({
        topic: e.topic,
        section: e.sectionName,
      })),
    };
  };

  const sendMessage = async (msg: string) => {
    if (!msg || loading) return;
    
    addMessage({ role: 'user', content: msg });
    setLoading(true);
    setAnimState('speaking');
    addMessage({ role: 'coach', content: 'لحظة واحدة…' });

    try {
      const { data, error } = await supabase.functions.invoke('smart-coach', {
        body: {
          message: msg,
          conversation_history: messages.slice(-10),
          context: buildFullContext(),
        },
      });

      const reply = data?.reply || 'عذراً، لم أتمكن من الإجابة الآن. حاول مرة أخرى.';
      updateLastCoachMessage(reply, data?.mode);

      if (error) {
        console.error('[SmartCoach] Internal error (hidden from user):', error);
      }
    } catch (e) {
      console.error('[SmartCoach] Internal error (hidden from user):', e);
      updateLastCoachMessage('عذراً، لم أتمكن من الإجابة الآن. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    setShowIntro(false);
    if (action === 'train') {
      setChatOpen(false);
    } else {
      setChatOpen(true);
    }
  };

  const handleInterventionAction = (action: 'retry_similar' | 'hint' | 'continue') => {
    if (action === 'continue') {
      dismissIntervention();
      return;
    }

    const interventionData = intervention;
    dismissIntervention();
    
    setChatOpen(true);

    const contextGreeting = interventionData?.detectedSection
      ? `لاحظت أنك تواجه صعوبة في قسم "${interventionData.detectedSection}"${interventionData.detectedTopic ? ` — موضوع "${interventionData.detectedTopic}"` : ''}. كيف أقدر أساعدك؟`
      : `لاحظت أنك أخطأت في عدة أسئلة متتالية. أنا هنا لمساعدتك — اختر أحد الخيارات أدناه أو اكتب سؤالك.`;

    addMessage({ role: 'coach', content: contextGreeting });

    if (action === 'hint') {
      setTimeout(() => sendMessage('أعطني تلميح للسؤال الحالي'), 300);
    } else if (action === 'retry_similar') {
      setTimeout(() => sendMessage('اشرح لي المفهوم الذي أخطأت فيه'), 300);
    }
  };

  const getQuickActions = () => {
    if (sessionActive) return TRAINING_QUICK_ACTIONS;
    return GENERIC_QUICK_ACTIONS;
  };

  return (
    <>
      {/* ─── Intervention Overlay ─── */}
      {intervention && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
          onClick={dismissIntervention}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-card border-t border-x border-border p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <SarisCoachAvatar state="pointing" size={80} />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-[hsl(var(--gold))]" />
                  <h3 className="font-bold text-foreground">SARIS — المدرب الذكي</h3>
                </div>
                {intervention.detectedSection && (
                  <p className="text-xs font-semibold text-primary">
                    {intervention.errorCount
                      ? `لاحظنا أنك أخطأت في ${intervention.errorCount} أسئلة من قسم "${intervention.detectedSection}"`
                      : `لاحظنا صعوبة في قسم "${intervention.detectedSection}"`
                    }
                  </p>
                )}
                <p className="text-sm text-foreground leading-relaxed">
                  {intervention.message}
                </p>
                <div className="flex gap-2 pt-1 flex-wrap">
                  {intervention.suggestedActions?.includes('retry_similar') && (
                    <Button size="sm" variant="outline" onClick={() => handleInterventionAction('retry_similar')}>
                      <RotateCcw className="h-3 w-3 ml-1" />
                      اشرح المفهوم
                    </Button>
                  )}
                  {intervention.suggestedActions?.includes('hint') && (
                    <Button size="sm" onClick={() => handleInterventionAction('hint')} className="gradient-gold text-gold-foreground">
                      <HelpCircle className="h-3 w-3 ml-1" />
                      أعطني تلميح
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleInterventionAction('continue')}>
                    أكمل التدريب
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Welcome Intro Bubble ─── */}
      {showIntro && !chatOpen && (
        <div
          className="fixed bottom-40 left-4 z-[90] w-72 rounded-2xl bg-card border border-border p-4 shadow-xl"
          dir="rtl"
        >
          <button onClick={() => setShowIntro(false)} className="absolute top-2 left-2 p-1 rounded-full hover:bg-muted">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <SarisCoachAvatar state="speaking" size={44} />
            <span className="font-bold text-sm text-foreground">SARIS — المدرب الذكي</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-1">
            مرحباً، أنا SARIS.
            مدربك الذكي في منصة SARIS EXAMS.
            سأساعدك في التدريب، فهم الأسئلة، والتنقل داخل المنصة.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mb-3 italic">
            Hi! I'm SARIS, your smart training coach.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleQuickAction('train')} className="text-xs gradient-gold text-gold-foreground">
              ابدأ التدريب
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleQuickAction('ask')} className="text-xs">
              اسألني أي شيء
            </Button>
          </div>
        </div>
      )}

      {/* ─── Contextual Speech Bubble ─── */}
      {coachBubble && !chatOpen && !showIntro && (
        <div
          className="fixed bottom-44 left-4 z-[89] max-w-[240px] rounded-xl bg-card border border-border px-3 py-2.5 shadow-lg"
          dir="rtl"
        >
          <div className="absolute -bottom-2 left-8 w-4 h-4 bg-card border-b border-r border-border rotate-45" />
          <p className="text-xs font-medium text-foreground leading-relaxed">{coachBubble.ar}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic" dir="ltr">{coachBubble.en}</p>
        </div>
      )}

      {/* ─── Chat Panel ─── */}
      {chatOpen && (
        <div
          className="fixed bottom-40 left-4 z-[90] w-80 sm:w-96 max-h-[70vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
          dir="rtl"
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <SarisCoachAvatar state={loading ? 'speaking' : 'idle'} size={36} />
              <div>
                <h3 className="text-sm font-bold text-foreground">SARIS — المدرب الذكي</h3>
                <p className="text-[10px] text-muted-foreground">
                  {sessionActive && examContext.exam_name
                    ? `${examContext.exam_name} — تدريب ذكي`
                    : 'جاهز لمساعدتك'
                  }
                </p>
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <Minimize2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[50vh]">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="flex justify-center mb-3">
                  <SarisCoachAvatar state="idle" size={56} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {sessionActive
                    ? 'أنا هنا لمساعدتك أثناء التدريب. اسألني عن أي سؤال!'
                    : 'مرحباً! أنا SARIS. كيف يمكنني مساعدتك؟'
                  }
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                  {sessionActive
                    ? "I'm here to help during training. Ask me anything!"
                    : "Hello! I'm SARIS. How can I help?"
                  }
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {getQuickActions().map(q => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-[10px] px-2.5 py-1.5 rounded-full bg-muted hover:bg-accent text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-end">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick actions bar during training */}
          {sessionActive && messages.length > 0 && !loading && (
            <div className="px-3 pb-1 flex flex-wrap gap-1 border-t border-border pt-2">
              {TRAINING_QUICK_ACTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-[10px] px-2 py-1 rounded-full bg-muted hover:bg-accent text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب رسالتك..."
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="h-9 w-9 rounded-xl gradient-gold text-gold-foreground"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Free-Standing Animated Coach Character ─── */}
      {/* Layer 1 (outer): x position via controls.set — NO animate prop */}
      {user && (
        <motion.div
          key="saris-walk-outer"
          animate={walkControls}
          className="fixed z-50"
          style={{ bottom: 60, left: 0 }}
        >
          {/* Layer 2 (inner): body-bob ONLY */}
          <motion.div
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut', repeatType: 'loop' }}
          >
            <motion.button
              onClick={() => {
                if (showIntro) setShowIntro(false);
                if (coachBubble) setCoachBubble(null);
                setChatOpen(!chatOpen);
                if (visualState === 'attention') setVisualState('idle');
              }}
              className="relative group focus:outline-none"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* ── Attention outer glow ── */}
              {(visualState === 'attention' || visualState === 'intervention') && (
                <motion.div
                  className="absolute inset-[-16px] rounded-full pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, hsl(var(--gold) / 0.3) 0%, transparent 70%)',
                  }}
                  animate={{ scale: [1, 1.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* ── Character body ── */}
              <div className="character-body">
                <SarisCoachAvatar state={animState} size={110} />
              </div>

              {/* ── Ground shadow ── */}
              <div className="character-ground-shadow" />

              {/* ── Attention lightbulb badge ── */}
              {(visualState === 'attention' || visualState === 'intervention') && (
                <motion.div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 h-7 w-7 rounded-full bg-[hsl(var(--gold))] flex items-center justify-center shadow-md"
                  animate={{ scale: [1, 1.25, 1], rotate: [0, 8, -8, 0], y: [0, -3, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  <Lightbulb className="h-4 w-4 text-[hsl(var(--gold-foreground))]" />
                </motion.div>
              )}

              {/* ── Chat indicator ── */}
              {chatOpen && (
                <motion.div
                  className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-primary border-2 border-card"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
