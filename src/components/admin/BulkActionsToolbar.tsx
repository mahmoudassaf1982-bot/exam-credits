import { useState } from 'react';
import { CheckSquare, Trash2, ArrowUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  pending_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  archived: 'مؤرشف',
};

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalFiltered: number;
  isAllFilterSelected: boolean;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  onBulkStatusChange: (status: string) => void;
  onBulkDelete: () => void;
  loading: boolean;
}

export default function BulkActionsToolbar({
  selectedCount, totalFiltered, isAllFilterSelected,
  onClearSelection, onSelectAllFiltered,
  onBulkStatusChange, onBulkDelete, loading,
}: BulkActionsToolbarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [targetStatus, setTargetStatus] = useState('');

  const requireTyping = selectedCount > 50;

  const handleDeleteConfirm = () => {
    onBulkDelete();
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
  };

  const handleStatusConfirm = () => {
    if (targetStatus) {
      onBulkStatusChange(targetStatus);
      setShowStatusDialog(false);
      setTargetStatus('');
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-primary">
            {selectedCount} محدد
          </span>
          {!isAllFilterSelected && selectedCount < totalFiltered && (
            <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={onSelectAllFiltered}>
              تحديد الكل ({totalFiltered})
            </Button>
          )}
          {isAllFilterSelected && (
            <span className="text-xs text-muted-foreground">(كل {totalFiltered} المطابقة للفلتر)</span>
          )}
        </div>

        <div className="flex items-center gap-2 mr-auto">
          <Button
            size="sm" variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => setShowStatusDialog(true)}
            disabled={loading}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            تغيير الحالة
          </Button>
          <Button
            size="sm" variant="outline"
            className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClearSelection}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Status change dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">تغيير حالة {selectedCount} سؤال</DialogTitle>
            <DialogDescription className="text-right">اختر الحالة الجديدة للأسئلة المحددة</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={targetStatus} onValueChange={setTargetStatus}>
              <SelectTrigger><SelectValue placeholder="اختر الحالة الجديدة" /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowStatusDialog(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleStatusConfirm} disabled={!targetStatus || loading} className="flex-1 gradient-primary text-primary-foreground font-bold">
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) setDeleteConfirmText(''); }}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right text-destructive">حذف {selectedCount} سؤال</DialogTitle>
            <DialogDescription className="text-right">
              سيتم أرشفة الأسئلة المحددة (حذف ناعم). هذا الإجراء قابل للتراجع.
            </DialogDescription>
          </DialogHeader>
          {requireTyping && (
            <div className="space-y-2 py-2">
              <Label className="text-sm">اكتب <span className="font-mono font-bold text-destructive">DELETE</span> للتأكيد:</Label>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="font-mono" />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1">إلغاء</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={loading || (requireTyping && deleteConfirmText !== 'DELETE')}
              className="flex-1"
            >
              حذف {selectedCount} سؤال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
