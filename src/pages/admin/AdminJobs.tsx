import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cog, Loader2, CheckCircle, XCircle, Clock, Play, Pause,
  RefreshCw, Zap, Ban, Eye, RotateCcw, Wifi, WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import E2ETestDialog from '@/components/admin/E2ETestDialog';
import JobDetailDialog from '@/components/admin/JobDetailDialog';
import { useAiJobsRealtime, type AiJob } from '@/hooks/useAiJobsRealtime';

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

type QuickFilter = 'all' | 'active' | 'completed';

export default function AdminJobs() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedJob, setSelectedJob] = useState<AiJob | null>(null);
  const [workerRunning, setWorkerRunning] = useState(false);

  const { jobs, loading, connectionStatus, activeCount, refetch } = useAiJobsRealtime(
    filterStatus !== 'all' ? filterStatus : undefined,
    filterType !== 'all' ? filterType : undefined
  );

  // Apply quick filter on top
  const filteredJobs = jobs.filter(j => {
    if (quickFilter === 'active') return ['queued', 'running', 'partial'].includes(j.status);
    if (quickFilter === 'completed') return ['succeeded', 'failed', 'canceled'].includes(j.status);
    return true;
  });

  const handleTriggerWorker = async () => {
    setWorkerRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-worker');
      if (error) throw error;
      toast({ title: `✅ تم تشغيل العامل — ${data?.processed || 0} مهام` });
    } catch (e: any) {
      toast({ title: 'خطأ في تشغيل العامل', description: e?.message, variant: 'destructive' });
    } finally {
      setWorkerRunning(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
              <Cog className="h-7 w-7 text-primary" />
              مهام الذكاء الاصطناعي
            </h1>
            <p className="mt-1 text-muted-foreground flex items-center gap-2">
              إدارة ومتابعة مهام التوليد والمراجعة والنشر
              {/* Live indicator */}
              {connectionStatus === 'connected' ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  مباشر
                </span>
              ) : connectionStatus === 'disconnected' ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <WifiOff className="h-3 w-3" />
                  تحديث دوري
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جاري الاتصال
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <E2ETestDialog onComplete={refetch} />
            <Button onClick={handleTriggerWorker} disabled={workerRunning} variant="outline" size="sm">
              {workerRunning ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Zap className="h-4 w-4 ml-2" />}
              تشغيل العامل
            </Button>
            <Button onClick={refetch} variant="ghost" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'نشطة', value: activeCount, color: 'text-blue-600' },
          { label: 'مكتملة', value: jobs.filter(j => j.status === 'succeeded').length, color: 'text-emerald-600' },
          { label: 'فاشلة', value: jobs.filter(j => j.status === 'failed').length, color: 'text-destructive' },
          { label: 'الكل', value: jobs.length, color: 'text-foreground' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick filter pills + advanced filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
          {([
            { key: 'all', label: 'الكل' },
            { key: 'active', label: 'نشطة' },
            { key: 'completed', label: 'مكتملة' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                quickFilter === f.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Disconnected notice */}
      {connectionStatus === 'disconnected' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <WifiOff className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-700">الاتصال المباشر غير متاح — يتم التحديث كل 8 ثوانٍ</span>
          </CardContent>
        </Card>
      )}

      {/* Jobs Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">لا توجد مهام</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>التقدم</TableHead>
                  <TableHead>المحاولات</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map(job => {
                  const progress = job.progress_total > 0
                    ? Math.round(((job.progress_done + job.progress_failed) / job.progress_total) * 100)
                    : 0;
                  return (
                    <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedJob(job)}>
                      <TableCell>
                        <span className="text-sm font-medium">{TYPE_LABELS[job.type] || job.type}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={progress} className="h-2 flex-1 transition-all duration-500" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {job.progress_done}/{job.progress_total}
                          </span>
                        </div>
                        {job.progress_failed > 0 && (
                          <span className="text-[10px] text-destructive">{job.progress_failed} فشل</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{job.attempt_count}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatDate(job.created_at)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedJob(job)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Active jobs safe-to-close */}
      {activeCount > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-semibold">يمكنك إغلاق الصفحة بأمان</p>
              <p className="text-xs text-muted-foreground">{activeCount} مهمة نشطة تعمل في الخلفية</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Detail Dialog */}
      {selectedJob && (
        <JobDetailDialog
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}
