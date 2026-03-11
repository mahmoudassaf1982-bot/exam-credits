import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Lightbulb, MessageCircle, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSmartCoach } from './SmartCoachContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import coachImage from '@/assets/smart-coach.png';

export default function SmartCoachFloating() {
  const {
    visualState, setVisualState,
    chatOpen, setChatOpen,
    messages, addMessage,
    currentPage, sessionActive, sessionType, currentQuestion,
    intervention, dismissIntervention,
    visible, showIntro, setShowIntro,
  } = useSmartCoach();
  const { user } = useAuth();
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      if (error) throw error;
      
      addMessage({
        role: 'coach',
        content: data?.reply || 'عذراً، حدث خطأ.',
        mode: data?.mode,
      });
    } catch (e) {
      console.error('Coach error:', e);
      addMessage({
        role: 'coach',
        content: 'عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.',
      });
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

  // Quick actions for intro
  const handleQuickAction = (action: string) => {
    setShowIntro(false);
    if (action === 'train') {
      setChatOpen(false);
    } else {
      setChatOpen(true);
    }
  };

  return (
    <>
      {/* Intervention Overlay */}
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
                <img src={coachImage} alt="SARIS" className="h-16 w-16 flex-shrink-0" />
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

      {/* Welcome Intro */}
      <AnimatePresence>
        {showIntro && !chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed bottom-24 left-4 z-[90] w-72 rounded-2xl bg-card border border-border p-4 shadow-xl"
            dir="rtl"
          >
            <button onClick={() => setShowIntro(false)} className="absolute top-2 left-2 p-1 rounded-full hover:bg-muted">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <img src={coachImage} alt="SARIS" className="h-10 w-10" />
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

      {/* Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed bottom-24 left-4 z-[90] w-80 sm:w-96 max-h-[70vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
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
                        onClick={() => { setInput(q); }}
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

      {/* Floating Coach Button */}
      <motion.button
        onClick={() => {
          if (showIntro) setShowIntro(false);
          setChatOpen(!chatOpen);
          if (visualState === 'attention') setVisualState('idle');
        }}
        className="fixed bottom-6 left-4 z-[90] group"
        animate={
          visualState === 'attention'
            ? { scale: [1, 1.1, 1], y: [0, -4, 0] }
            : { y: [0, -3, 0] }
        }
        transition={
          visualState === 'attention'
            ? { duration: 1.2, repeat: Infinity }
            : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Attention glow */}
        {visualState === 'attention' && (
          <motion.div
            className="absolute inset-0 rounded-full bg-[hsl(var(--gold))]"
            animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        
        <div className="relative h-14 w-14 rounded-full bg-card border-2 border-[hsl(var(--gold))] shadow-lg overflow-hidden flex items-center justify-center">
          <img src={coachImage} alt="SARIS" className="h-11 w-11 object-contain" />
          
          {/* Attention lightbulb */}
          {visualState === 'attention' && (
            <motion.div
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[hsl(var(--gold))] flex items-center justify-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <Lightbulb className="h-3 w-3 text-[hsl(var(--gold-foreground))]" />
            </motion.div>
          )}
        </div>
        
        {/* Chat indicator */}
        {!chatOpen && messages.length > 0 && (
          <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center">
            <MessageCircle className="h-2.5 w-2.5 text-destructive-foreground" />
          </div>
        )}
      </motion.button>
    </>
  );
}
