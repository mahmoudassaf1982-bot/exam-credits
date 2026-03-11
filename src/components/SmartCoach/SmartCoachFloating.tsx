import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Lightbulb, MessageCircle, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSmartCoach } from './SmartCoachContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import coachImage from '@/assets/smart-coach.png';

// Horizontal drift positions for non-training mode
const WANDER_POSITIONS = [
  { bottom: 24, left: 16 },
  { bottom: 28, left: 50 },
  { bottom: 20, left: 80 },
  { bottom: 26, left: 40 },
  { bottom: 24, left: 16 },
] as const;

// Training mode: stationary position
const TRAINING_POSITION = { bottom: 24, left: 16 };

const WANDER_INTERVAL = 12_000;

export default function SmartCoachFloating() {
  const {
    visualState, setVisualState,
    chatOpen, setChatOpen,
    messages, addMessage, updateLastCoachMessage,
    currentPage, sessionActive, sessionType, currentQuestion,
    intervention, dismissIntervention,
    visible, showIntro, setShowIntro,
  } = useSmartCoach();
  const { user } = useAuth();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [wanderIdx, setWanderIdx] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wandering movement cycle — only when not in training
  useEffect(() => {
    if (chatOpen || !visible || sessionActive) return;
    const timer = setInterval(() => {
      setWanderIdx(prev => (prev + 1) % WANDER_POSITIONS.length);
    }, WANDER_INTERVAL);
    return () => clearInterval(timer);
  }, [chatOpen, visible, sessionActive]);
  // Reset to home when chat opens
  useEffect(() => {
    if (chatOpen) setWanderIdx(0);
  }, [chatOpen]);

  // Blink cycle
  useEffect(() => {
    if (!visible) return;
    const scheduleNextBlink = () => {
      const delay = 3000 + Math.random() * 4000; // 3-7s between blinks
      return setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 200);
        blinkTimer = scheduleNextBlink();
      }, delay);
    };
    let blinkTimer = scheduleNextBlink();
    return () => clearTimeout(blinkTimer);
  }, [visible]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [chatOpen]);

  if (!visible || !user) return null;

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    addMessage({ role: 'user', content: msg });
    setLoading(true);

    // Show a seamless waiting message (never technical errors)
    const waitingMsgId = Date.now();
    addMessage({ role: 'coach', content: 'لحظة واحدة…' });

    try {
      const { data, error } = await supabase.functions.invoke('smart-coach', {
        body: {
          message: msg,
          conversation_history: messages.slice(-10),
          context: {
            currentPage,
            sessionActive,
            sessionType,
            currentQuestion: currentQuestion ? {
              topic: currentQuestion.topic,
              difficulty: currentQuestion.difficulty,
              section: currentQuestion.section_name,
            } : null,
          },
        },
      });

      // Replace the waiting message with actual reply
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

  // Idle: gentle horizontal sway + float
  const idleFloat = {
    y: [0, -6, 0, -3, 0],
    x: [0, 3, 0, -2, 0],
    rotate: [0, 1, 0, -0.5, 0],
  };

  // Training: very calm, minimal breathing only
  const trainingFloat = {
    y: [0, -2, 0],
    scale: [1, 1.01, 1],
  };

  const attentionFloat = {
    y: [0, -10, 0, -6, 0],
    x: [0, 20, 0],
    scale: [1, 1.06, 1, 1.04, 1],
  };

  return (
    <>
      {/* ─── Intervention Overlay ─── */}
      <AnimatePresence>
        {intervention && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
            onClick={dismissIntervention}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-lg rounded-t-3xl bg-card border-t border-x border-border p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-start gap-4">
                <motion.img
                  src={coachImage}
                  alt="SARIS"
                  className="h-20 w-20 flex-shrink-0 drop-shadow-lg"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-[hsl(var(--gold))]" />
                    <h3 className="font-bold text-foreground">SARIS — المدرب الذكي</h3>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {intervention.message}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={dismissIntervention} className="gradient-gold text-gold-foreground">
                      فهمت
                    </Button>
                    <Button size="sm" variant="outline" onClick={dismissIntervention}>
                      أكمل التدريب
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Welcome Intro Bubble ─── */}
      <AnimatePresence>
        {showIntro && !chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed bottom-28 left-4 z-[90] w-72 rounded-2xl bg-card border border-border p-4 shadow-xl"
            dir="rtl"
          >
            <button onClick={() => setShowIntro(false)} className="absolute top-2 left-2 p-1 rounded-full hover:bg-muted">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <img src={coachImage} alt="SARIS" className="h-10 w-10 drop-shadow" />
              <span className="font-bold text-sm text-foreground">SARIS — المدرب الذكي</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              مرحباً، أنا SARIS.
              مدربك الذكي في منصة SARIS EXAMS.
              سأساعدك في التدريب، فهم الأسئلة، والتنقل داخل المنصة.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleQuickAction('train')} className="text-xs gradient-gold text-gold-foreground">
                ابدأ التدريب
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleQuickAction('ask')} className="text-xs">
                اسألني أي شيء
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Chat Panel ─── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed bottom-28 left-4 z-[90] w-80 sm:w-96 max-h-[70vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
            dir="rtl"
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <img src={coachImage} alt="SARIS" className="h-8 w-8" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">SARIS — المدرب الذكي</h3>
                  <p className="text-[10px] text-muted-foreground">جاهز لمساعدتك</p>
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
                  <img src={coachImage} alt="SARIS" className="h-14 w-14 mx-auto mb-3 opacity-60" />
                  <p className="text-xs text-muted-foreground">
                    مرحباً! أنا SARIS. كيف يمكنني مساعدتك؟
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {['أين أجد التدريب الذكي؟', 'كيف أحسن درجتي؟', 'اشرح لي الاختبار'].map(q => (
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Free-Standing Coach Character ─── */}
      <motion.div
        className="fixed z-[90]"
        animate={{
          bottom: chatOpen ? 24
            : visualState === 'intervention' ? 80
            : sessionActive ? TRAINING_POSITION.bottom : WANDER_POSITIONS[wanderIdx].bottom,
          left: chatOpen ? 16
            : visualState === 'intervention' ? '50%'
            : sessionActive ? TRAINING_POSITION.left : WANDER_POSITIONS[wanderIdx].left,
          x: visualState === 'intervention' && !chatOpen ? '-50%' : '0%',
        }}
        transition={{ type: 'spring', stiffness: 25, damping: 18 }}
      >
        <motion.button
          onClick={() => {
            if (showIntro) setShowIntro(false);
            setChatOpen(!chatOpen);
            if (visualState === 'attention') setVisualState('idle');
          }}
          className="relative group focus:outline-none"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {/* ── Attention outer glow ── */}
          {visualState === 'attention' && (
            <motion.div
              className="absolute inset-[-12px] rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, hsl(var(--gold) / 0.3) 0%, transparent 70%)',
              }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          {/* ── Ambient ground glow ── */}
          <motion.div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-14 h-3 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse, hsl(var(--gold) / 0.15) 0%, transparent 80%)',
            }}
            animate={{ opacity: [0.3, 0.6, 0.3], scaleX: [0.9, 1.1, 0.9] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* ── Free character (no circle container) ── */}
          <motion.div
            className="relative"
            animate={
              visualState === 'attention' || visualState === 'intervention'
                ? attentionFloat
                : sessionActive
                  ? trainingFloat
                  : idleFloat
            }
            transition={{
              duration: visualState === 'attention' || visualState === 'intervention' ? 2 : sessionActive ? 4 : 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {/* Character image — free silhouette, no clipping */}
            <motion.img
              src={coachImage}
              alt="SARIS — المدرب الذكي"
              className="h-20 w-20 object-contain drop-shadow-lg"
              animate={{
                scale: [1, 1.02, 1],
              }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ filter: 'drop-shadow(0 4px 12px hsl(var(--gold) / 0.2))' }}
            />

            {/* Blink overlay */}
            <AnimatePresence>
              {blinking && (
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  exit={{ scaleY: 0 }}
                  transition={{ duration: 0.1 }}
                  className="absolute top-[28%] left-[28%] w-[44%] h-[10%] bg-card rounded-full origin-top"
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Attention lightbulb badge ── */}
          {visualState === 'attention' && (
            <motion.div
              className="absolute -top-3 left-1/2 -translate-x-1/2 h-7 w-7 rounded-full bg-[hsl(var(--gold))] flex items-center justify-center shadow-md"
              animate={{ scale: [1, 1.25, 1], rotate: [0, 8, -8, 0], y: [0, -3, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <Lightbulb className="h-4 w-4 text-[hsl(var(--gold-foreground))]" />
            </motion.div>
          )}

          {/* ── Unread messages badge ── */}
          {!chatOpen && messages.length > 0 && (
            <motion.div
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <MessageCircle className="h-2.5 w-2.5 text-destructive-foreground" />
            </motion.div>
          )}
        </motion.button>
      </motion.div>
    </>
  );
}
