import { AlertTriangle, Coins, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface InsufficientBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredPoints: number;
  currentBalance: number;
}

export function InsufficientBalanceDialog({
  open,
  onOpenChange,
  requiredPoints,
  currentBalance,
}: InsufficientBalanceDialogProps) {
  const navigate = useNavigate();
  const missing = requiredPoints - currentBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            رصيد غير كافٍ
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-muted p-4">
            <span className="text-sm text-muted-foreground">رصيدك الحالي</span>
            <div className="flex items-center gap-2 font-bold">
              <Coins className="h-4 w-4 text-gold" />
              <span>{currentBalance} نقطة</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted p-4">
            <span className="text-sm text-muted-foreground">المطلوب</span>
            <div className="flex items-center gap-2 font-bold">
              <Coins className="h-4 w-4 text-gold" />
              <span>{requiredPoints} نقطة</span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-destructive">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">النقاط الناقصة: {missing} نقطة</p>
              <p className="text-xs mt-1">تحتاج إلى {requiredPoints} نقطة لبدء هذا التدريب</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            لاحقًا
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate('/app/topup');
            }}
            className="flex-1 gradient-gold text-gold-foreground font-bold hover:opacity-90"
          >
            <ShoppingCart className="h-4 w-4 ml-2" />
            احصل على نقاط
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
