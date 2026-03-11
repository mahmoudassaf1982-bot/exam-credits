import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Coins, Loader2, Globe, Layers } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ExamTemplate, SessionType } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SessionCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: ExamTemplate | null;
  sessionType: SessionType;
  onConfirm: () => void;
}

const sessionLabels: Record<SessionType, string> = {
  simulation: 'جلسة محاكاة رسمية',
  practice: 'جلسة تدريب ذكي',
  analysis: 'تحليل النتيجة',
  adaptive_training: 'جلسة التدريب الذكي',
  smart_training: 'جلسة التدريب الذكي',
};

function getCost(exam: ExamTemplate, type: SessionType): number {
  switch (type) {
    case 'simulation':
      return exam.simulationSessionCostPoints;
    case 'practice':
    case 'adaptive_training':
    case 'smart_training':
      return exam.practiceSessionCostPoints;
    case 'analysis':
      return exam.analysisCostPoints;
  }
}

export function SessionCostDialog({
  open,
  onOpenChange,
  exam,
  sessionType,
  onConfirm,
}: SessionCostDialogProps) {
  const { wallet, user, refreshWallet } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  if (!exam) return null;

  const cost = getCost(exam, sessionType);
  const balance = wallet?.balance ?? 0;
  const isDiamond = user?.isDiamond ?? false;
  const canAfford = isDiamond || balance >= cost;

  const availableLanguages: string[] = exam.availableLanguages || ['ar'];
  const isBilingual = availableLanguages.length > 1;
  const needsLanguageSelection = isBilingual && !selectedLanguage;

  const handleConfirm = async () => {
    if (needsLanguageSelection) return;

    setLoading(true);
    try {
      if (sessionType === 'adaptive_training' || sessionType === 'smart_training') {
        // Use smart training edge function
        const { data, error } = await supabase.functions.invoke('assemble-adaptive-training', {
          body: { exam_template_id: exam.id, max_questions: 15 },
        });

        if (error || data?.error) {
          toast.error(data?.error || 'فشل في بدء الجلسة');
          setLoading(false);
          return;
        }

        // Store pool data + smart context in sessionStorage
        sessionStorage.setItem(`cat-pool-${data.session_id}`, JSON.stringify({
          question_pool: data.question_pool,
          answer_keys: data.answer_keys,
          max_questions: data.max_questions,
          skill_memory: data.skill_memory,
          exam_dna: data.exam_dna,
          previous_ability: data.previous_ability,
        }));

        await refreshWallet();
        onConfirm();
        onOpenChange(false);
        navigate(`/app/adaptive-training/${data.session_id}`);
      } else {
        const body: Record<string, unknown> = {
          exam_template_id: exam.id,
          session_type: sessionType,
        };
        if (isBilingual && selectedLanguage) {
          body.exam_language = selectedLanguage;
        }
        if (sessionType === 'practice' && selectedSectionId) {
          body.target_section_id = selectedSectionId;
        }

        const { data, error } = await supabase.functions.invoke('assemble-exam', { body });

        if (error || data?.error) {
          toast.error(data?.error || 'فشل في بدء الجلسة');
          setLoading(false);
          return;
        }

        await refreshWallet();
        onConfirm();
        onOpenChange(false);
        navigate(`/app/exam-session/${data.session_id}`);
      }
    } catch {
      toast.error('حدث خطأ أثناء بدء الجلسة');
    } finally {
      setLoading(false);
    }
  };

  const langLabels: Record<string, { label: string; flag: string }> = {
    ar: { label: 'العربية', flag: '🇸🇦' },
    en: { label: 'English', flag: '🇬🇧' },
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelectedLanguage(null); setSelectedSectionId(null); } }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {sessionLabels[sessionType]}
          </DialogTitle>
          <DialogDescription className="text-right">
            {exam.nameAr}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Section Selection for practice mode */}
          {sessionType === 'practice' && exam.sections.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Layers className="h-4 w-4 text-info" />
                <span>اختر قسمًا للتدريب عليه (اختياري)</span>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                <button
                  onClick={() => setSelectedSectionId(null)}
                  className={`rounded-xl border-2 p-3 text-right transition-all text-sm ${
                    selectedSectionId === null
                      ? 'border-info bg-info/10 shadow-md'
                      : 'border-border bg-card hover:border-info/50 hover:bg-muted/50'
                  }`}
                >
                  <span className={`font-bold ${selectedSectionId === null ? 'text-info' : 'text-foreground'}`}>
                    🎯 تدريب ذكي شامل
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">يركز على نقاط ضعفك تلقائيًا</p>
                </button>
                {exam.sections
                  .sort((a, b) => a.order - b.order)
                  .map((section) => {
                    const isSelected = selectedSectionId === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setSelectedSectionId(section.id)}
                        className={`rounded-xl border-2 p-3 text-right transition-all text-sm ${
                          isSelected
                            ? 'border-info bg-info/10 shadow-md'
                            : 'border-border bg-card hover:border-info/50 hover:bg-muted/50'
                        }`}
                      >
                        <span className={`font-bold ${isSelected ? 'text-info' : 'text-foreground'}`}>
                          {section.nameAr}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">{section.questionCount} سؤال</p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Language Selection for bilingual exams */}
          {isBilingual && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Globe className="h-4 w-4 text-primary" />
                <span>اختر لغة الاختبار</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {availableLanguages.map((lang) => {
                  const info = langLabels[lang] || { label: lang, flag: '🌐' };
                  const isSelected = selectedLanguage === lang;
                  return (
                    <button
                      key={lang}
                      onClick={() => setSelectedLanguage(lang)}
                      className={`rounded-xl border-2 p-4 text-center transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-md'
                          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-3xl block mb-2">{info.flag}</span>
                      <span className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {info.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!selectedLanguage && (
                <p className="text-xs text-muted-foreground text-center">يرجى اختيار لغة الاختبار للمتابعة</p>
              )}
            </div>
          )}

          {isDiamond ? (
            <div className="flex items-center gap-3 rounded-xl gradient-diamond p-4 text-diamond-foreground">
              <span className="text-2xl">💎</span>
              <div>
                <p className="font-bold">اشتراك Diamond فعّال</p>
                <p className="text-sm opacity-90">لن يتم خصم أي نقاط</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-muted p-4">
                <span className="text-sm text-muted-foreground">التكلفة</span>
                <div className="flex items-center gap-2 font-bold">
                  <Coins className="h-4 w-4 text-gold" />
                  <span>{cost} نقطة</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted p-4">
                <span className="text-sm text-muted-foreground">رصيدك الحالي</span>
                <div className="flex items-center gap-2 font-bold">
                  <Coins className="h-4 w-4 text-gold" />
                  <span>{balance} نقطة</span>
                </div>
              </div>
              {!canAfford && (
                <div className="flex items-center gap-3 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">رصيدك غير كافٍ</p>
                    <p className="text-xs mt-1">
                      تحتاج {cost - balance} نقطة إضافية
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {canAfford ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                disabled={loading}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading || needsLanguageSelection}
                className="flex-1 gradient-gold text-gold-foreground font-bold hover:opacity-90"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    جارٍ تجميع الاختبار...
                  </>
                ) : isDiamond ? (
                  'ابدأ الآن'
                ) : (
                  `ابدأ (${cost} نقطة)`
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  navigate('/app/topup');
                }}
                className="flex-1 gradient-gold text-gold-foreground font-bold hover:opacity-90"
              >
                شراء نقاط
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
