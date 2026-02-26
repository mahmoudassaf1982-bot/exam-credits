import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Cog, Loader2, CheckCircle, XCircle, Clock, Play, Pause,
  RefreshCw, Trash2, AlertTriangle, ChevronDown, ChevronUp,
  Zap, RotateCcw, Ban, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Job {
  id: string;
  type: string;
  status: string;
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  target_draft_id: string | null;
  params_json: any;
  progress_total: number;
  progress_done: number;
  progress_failed: number;
  last_error: string | null;
  attempt_count: number;
  locked_by: string | null;
}

interface JobItem {
  id: string;
  job_id: string;
  item_index: number;
  status: string;
  error: string | null;
  attempt_count: number;
  started_at: string | null;
  finished_at: string | null;
}

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

export default function AdminJobs() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobItems, setJobItems] = useState<JobItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [workerRunning, setWorkerRunning] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('ai_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterType !== 'all') query = query.eq('type', filterType);

    const { data, error } = await query;
    if (error) {
      toast({ title: 'خطأ في تحميل المهام', variant: 'destructive' });
    } else {
      setJobs((data || []) as unknown as Job[]);
    }
    setLoading(false);
  }, [filterStatus, filterType, toast]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const fetchJobItems = async (jobId: string) => {
    setItemsLoading(true);
    const { data } = await supabase
      .from('ai_job_items')
      .select('id, job_id, item_index, status, error, attempt_count, started_at, finished_at')
      .eq('job_id', jobId)
      .order('item_index', { ascending: true });
    setJobItems((data || []) as unknown as JobItem[]);
    setItemsLoading(false);
  };

  const handleViewDetails = async (job: Job) => {
    setSelectedJob(job);
    await fetchJobItems(job.id);
  };

  const handleRetryJob = async (jobId: string) => {
    const { error } = await supabase
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
      .eq('id', jobId);

    if (error) {
      toast({ title: 'خطأ في إعادة المحاولة', variant: 'destructive' });
    } else {
      toast({ title: 'تم إعادة المهمة للطابور' });
      fetchJobs();
    }
  };

  const handleCancelJob = async (jobId: string) => {
    const { error } = await supabase
      .from('ai_jobs')
      .update({
        status: 'canceled',
        locked_by: null,
        locked_at: null,
        finished_at: new Date().toISOString(),
      } as any)
      .eq('id', jobId);

    if (error) {
      toast({ title: 'خطأ في الإلغاء', variant: 'destructive' });
    } else {
      toast({ title: 'تم إلغاء المهمة' });
      fetchJobs();
      if (selectedJob?.id === jobId) setSelectedJob(null);
    }
  };

  const handleTriggerWorker = async () => {
    setWorkerRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-worker');
      if (error) throw error;
      toast({ title: `✅ تم تشغيل العامل — ${data?.processed || 0} مهام` });
      fetchJobs();
    } catch (e: any) {
      toast({ title: 'خطأ في تشغيل العامل', description: e?.message, variant: 'destructive' });
    } finally {
      setWorkerRunning(false);
    }
  };

  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'queued' || j.status === 'partial');

  return (
    <div className="space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
              <Cog className="h-7 w-7 text-primary" />
              مهام الذكاء الاصطناعي
            </h1>
            <p className="mt-1 text-muted-foreground">
              إدارة ومتابعة مهام التوليد والمراجعة والنشر
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleTriggerWorker} disabled={workerRunning} variant="outline" size="sm">
              {workerRunning ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Zap className="h-4 w-4 ml-2" />}
              تشغيل العامل
            </Button>
            <Button onClick={fetchJobs} variant="ghost" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'نشطة', value: activeJobs.length, color: 'text-blue-600' },
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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {/* Jobs Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
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
                {jobs.map(job => {
                  const progress = job.progress_total > 0 ? Math.round(((job.progress_done + job.progress_failed) / job.progress_total) * 100) : 0;
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <span className="text-sm font-medium">{TYPE_LABELS[job.type] || job.type}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={progress} className="h-2 flex-1" />
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
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleViewDetails(job)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {(job.status === 'failed' || job.status === 'partial') && (
                            <Button size="sm" variant="ghost" onClick={() => handleRetryJob(job.id)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(job.status === 'queued' || job.status === 'running' || job.status === 'partial') && (
                            <Button size="sm" variant="ghost" onClick={() => handleCancelJob(job.id)}>
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
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

      {/* Active jobs notice */}
      {activeJobs.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-semibold">يمكنك إغلاق الصفحة بأمان</p>
              <p className="text-xs text-muted-foreground">{activeJobs.length} مهمة نشطة تعمل في الخلفية</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Detail Dialog */}
      {selectedJob && (
        <Dialog open onOpenChange={() => setSelectedJob(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Cog className="h-5 w-5" />
                تفاصيل المهمة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">النوع:</span> <strong>{TYPE_LABELS[selectedJob.type]}</strong></div>
                <div><span className="text-muted-foreground">الحالة:</span> <StatusBadge status={selectedJob.status} /></div>
                <div><span className="text-muted-foreground">المحاولات:</span> <strong>{selectedJob.attempt_count}</strong></div>
                <div><span className="text-muted-foreground">الأولوية:</span> <strong>{selectedJob.priority}</strong></div>
                <div><span className="text-muted-foreground">الإنشاء:</span> {formatDate(selectedJob.created_at)}</div>
                <div><span className="text-muted-foreground">الانتهاء:</span> {formatDate(selectedJob.finished_at)}</div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>التقدم</span>
                  <span>{selectedJob.progress_done}/{selectedJob.progress_total}</span>
                </div>
                <Progress
                  value={selectedJob.progress_total > 0 ? ((selectedJob.progress_done + selectedJob.progress_failed) / selectedJob.progress_total) * 100 : 0}
                  className="h-3"
                />
                {selectedJob.progress_failed > 0 && (
                  <p className="text-xs text-destructive mt-1">{selectedJob.progress_failed} عنصر فاشل</p>
                )}
              </div>

              {/* Error */}
              {selectedJob.last_error && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="p-3">
                    <p className="text-xs font-mono text-destructive">{selectedJob.last_error}</p>
                  </CardContent>
                </Card>
              )}

              {/* Items */}
              <div>
                <h3 className="text-sm font-bold mb-2">العناصر ({jobItems.length})</h3>
                {itemsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : jobItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد عناصر</p>
                ) : (
                  <div className="space-y-2">
                    {jobItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">#{item.item_index + 1}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {item.attempt_count > 0 && <span>محاولة {item.attempt_count}</span>}
                          {item.error && (
                            <span className="text-destructive max-w-[200px] truncate" title={item.error}>
                              {item.error}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {(selectedJob.status === 'failed' || selectedJob.status === 'partial') && (
                  <Button size="sm" onClick={() => { handleRetryJob(selectedJob.id); setSelectedJob(null); }}>
                    <RotateCcw className="h-4 w-4 ml-2" />
                    إعادة المحاولة
                  </Button>
                )}
                {(selectedJob.status === 'queued' || selectedJob.status === 'running') && (
                  <Button size="sm" variant="destructive" onClick={() => { handleCancelJob(selectedJob.id); }}>
                    <Ban className="h-4 w-4 ml-2" />
                    إلغاء
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
