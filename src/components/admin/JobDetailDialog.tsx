import { useState } from 'react';
import {
  Cog, Loader2, CheckCircle, XCircle, Clock, Play, Pause,
  RotateCcw, Ban, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAiJobItemsRealtime, type AiJob, type AiJobItem } from '@/hooks/useAiJobsRealtime';

const TYPE_LABELS: Record<string, string> = {
  generate_draft: 'توليد مسودة',
  review_draft: 'مراجعة مسودة',
  quality_gate: 'بوابة الجودة',
  publish_draft: 'نشر مسودة',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  queued: { label: 'في الانتظار', color: 'bg-muted text-muted-foreground', icon: Clock },
  running: { label: 'قيد التنفيذ', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Play },
  partial: { label: 'جزئي', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Pause },
  succeeded: { label: 'مكتمل', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
  failed: { label: 'فشل', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  canceled: { label: 'ملغي', color: 'bg-muted text-muted-foreground', icon: Ban },
  pending: { label: 'معلق', color: 'bg-muted text-muted-foreground', icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  job: AiJob;
  onClose: () => void;
  onRefresh: () => void;
}

export default function JobDetailDialog({ job, onClose, onRefresh }: Props) {
  const { toast } = useToast();
  const { items, loading: itemsLoading } = useAiJobItemsRealtime(job.id);
  const [retrying, setRetrying] = useState<string | null>(null);

  const progress = job.progress_total > 0
    ? ((job.progress_done + job.progress_failed) / job.progress_total) * 100
    : 0;

  const failedItems = items.filter(i => i.status === 'failed');

  const handleRetryItem = async (item: AiJobItem) => {
    setRetrying(item.id);
    await supabase
      .from('ai_job_items')
      .update({ status: 'pending', error: null, attempt_count: 0, started_at: null, finished_at: null } as any)
      .eq('id', item.id);

    // Reset job to partial so worker picks it up
    if (job.status === 'failed' || job.status === 'succeeded') {
      await supabase
        .from('ai_jobs')
        .update({
          status: 'partial',
          next_run_at: new Date().toISOString(),
          locked_by: null,
          locked_at: null,
          finished_at: null,
          progress_failed: Math.max(0, job.progress_failed - 1),
        } as any)
        .eq('id', job.id);
    }

    toast({ title: 'تم إعادة العنصر للطابور' });
    setRetrying(null);
    onRefresh();
  };

  const handleCancelJob = async () => {
    await supabase
      .from('ai_jobs')
      .update({
        status: 'canceled',
        locked_by: null,
        locked_at: null,
        finished_at: new Date().toISOString(),
      } as any)
      .eq('id', job.id);
    toast({ title: 'تم إلغاء المهمة' });
    onRefresh();
    onClose();
  };

  const handleRetryJob = async () => {
    await supabase
      .from('ai_jobs')
      .update({
        status: 'queued',
        attempt_count: 0,
        locked_by: null,
        locked_at: null,
        last_error: null,
        next_run_at: new Date().toISOString(),
        finished_at: null,
      } as any)
      .eq('id', job.id);
    toast({ title: 'تم إعادة المهمة للطابور' });
    onRefresh();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            تفاصيل المهمة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">النوع:</span> <strong>{TYPE_LABELS[job.type] || job.type}</strong></div>
            <div><span className="text-muted-foreground">الحالة:</span> <StatusBadge status={job.status} /></div>
            <div><span className="text-muted-foreground">المحاولات:</span> <strong>{job.attempt_count}</strong></div>
            <div><span className="text-muted-foreground">الأولوية:</span> <strong>{job.priority}</strong></div>
            <div><span className="text-muted-foreground">الإنشاء:</span> {formatDate(job.created_at)}</div>
            <div><span className="text-muted-foreground">البدء:</span> {formatDate(job.started_at)}</div>
            <div className="col-span-2"><span className="text-muted-foreground">الانتهاء:</span> {formatDate(job.finished_at)}</div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>التقدم</span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-600">{job.progress_done} ✓</span>
                {job.progress_failed > 0 && <span className="text-destructive">{job.progress_failed} ✗</span>}
                <span className="text-muted-foreground">/ {job.progress_total}</span>
              </span>
            </div>
            <div className="relative">
              <Progress value={progress} className="h-3" />
            </div>
          </div>

          {/* Error */}
          {job.last_error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs font-mono text-destructive break-all">{job.last_error}</p>
              </CardContent>
            </Card>
          )}

          {/* Failed Items */}
          {failedItems.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-2 text-destructive">العناصر الفاشلة ({failedItems.length})</h3>
              <div className="space-y-2">
                {failedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono shrink-0">#{item.item_index + 1}</span>
                      <span className="text-xs text-destructive truncate" title={item.error || ''}>
                        {item.error || 'خطأ غير معروف'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={retrying === item.id}
                      onClick={() => handleRetryItem(item)}
                      className="shrink-0"
                    >
                      {retrying === item.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RotateCcw className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Items */}
          <div>
            <h3 className="text-sm font-bold mb-2">كل العناصر ({items.length})</h3>
            {itemsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد عناصر</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-1.5 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">#{item.item_index + 1}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.attempt_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">محاولة {item.attempt_count}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            {(job.status === 'failed' || job.status === 'partial') && (
              <Button size="sm" onClick={handleRetryJob}>
                <RotateCcw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
            )}
            {['queued', 'running', 'partial'].includes(job.status) && (
              <Button size="sm" variant="destructive" onClick={handleCancelJob}>
                <Ban className="h-4 w-4 ml-2" />
                إلغاء
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
