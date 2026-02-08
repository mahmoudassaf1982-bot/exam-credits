import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Coins } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

interface SessionCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: ExamTemplate | null;
  sessionType: SessionType;
  onConfirm: () => void;
}

const sessionLabels: Record<SessionType, string> = {
  simulation: 'جلسة محاكاة رسمية',
  practice: 'جلسة تدريب ذكي (AI)',
  analysis: 'تحليل النتيجة',
};

function getCost(exam: ExamTemplate, type: SessionType): number {
  switch (type) {
    case 'simulation':
      return exam.simulationSessionCostPoints;
    case 'practice':
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
  const { wallet, user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!exam) return null;

  const cost = getCost(exam, sessionType);
  const balance = wallet?.balance ?? 0;
  const isDiamond = user?.isDiamond ?? false;
  const canAfford = isDiamond || balance >= cost;

  const handleConfirm = () => {
    setLoading(true);
    if (!isDiamond) {
      updateBalance(-cost);
    }
    setTimeout(() => {
      setLoading(false);
      onConfirm();
      onOpenChange(false);
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              >
                إلغاء
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 gradient-gold text-gold-foreground font-bold hover:opacity-90"
              >
                {loading ? 'جارٍ الخصم...' : isDiamond ? 'ابدأ الآن' : `ابدأ (${cost} نقطة)`}
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
