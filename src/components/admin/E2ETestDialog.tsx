import { useState } from 'react';
import { FlaskConical, Loader2, CheckCircle, XCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CheckResult {
  label: string;
  passed: boolean;
  detail?: string;
}

export default function E2ETestDialog({ onComplete }: { onComplete?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [checks, setChecks] = useState<CheckResult[]>([]);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runTest = async () => {
    setRunning(true);
    setChecks([]);
    const results: CheckResult[] = [];

    try {
      // ── 1. Create test job ──────────────────────────────────
      setPhase('إنشاء مهمة اختبار…');

      const idempotencyKey = `e2e_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const { data: jobData, error: jobErr } = await supabase
        .from('ai_jobs')
        .insert({
          type: 'generate_draft',
          status: 'queued',
          priority: 1,
          idempotency_key: idempotencyKey,
          created_by: (await supabase.auth.getUser()).data.user!.id,
          params_json: { e2e_test: true, country_id: 'SA', difficulty: 'medium', count: 10 },
          progress_total: 1,
          progress_done: 0,
          progress_failed: 0,
          next_run_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (jobErr || !jobData) throw new Error(jobErr?.message || 'فشل إنشاء المهمة');
      const jobId = jobData.id;

      // Create 1 test item
      await supabase.from('ai_job_items').insert({
        job_id: jobId,
        item_index: 0,
        status: 'pending',
        input_json: { count: 10, e2e_test: true },
      } as any);

      results.push({ label: 'إنشاء المهمة', passed: true, detail: jobId.slice(0, 8) });

      // ── 2. Trigger worker ───────────────────────────────────
      setPhase('تشغيل العامل…');
      const { error: workerErr } = await supabase.functions.invoke('ai-worker');

      if (workerErr) {
        results.push({ label: 'تشغيل العامل', passed: false, detail: workerErr.message });
      } else {
        results.push({ label: 'تشغيل العامل', passed: true });
      }

      // ── 3. Poll for completion (max 3 min) ──────────────────
      setPhase('انتظار الانتهاء…');
      const maxWait = 180_000;
      const start = Date.now();
      let finalJob: any = null;

      while (Date.now() - start < maxWait) {
        const { data: j } = await supabase
          .from('ai_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (j && ['succeeded', 'failed', 'canceled'].includes(j.status)) {
          finalJob = j;
          break;
        }

        // If still running/partial, trigger worker again
        if (j && (j.status === 'running' || j.status === 'partial')) {
          await sleep(10_000);
          await supabase.functions.invoke('ai-worker');
          continue;
        }

        await sleep(5_000);
      }

      if (!finalJob) {
        // Force-fetch one more time
        const { data: j } = await supabase.from('ai_jobs').select('*').eq('id', jobId).single();
        finalJob = j;
      }

      const pipelineOk = finalJob?.status === 'succeeded' || finalJob?.status === 'failed';
      results.push({
        label: 'اكتمال الأنبوب',
        passed: !!pipelineOk,
        detail: finalJob?.status || 'timeout',
      });

      // ── 4. Verify locks released ────────────────────────────
      setPhase('التحقق من تحرير الأقفال…');
      const locksReleased = finalJob?.locked_by === null && finalJob?.locked_at === null;
      results.push({
        label: 'تحرير الأقفال',
        passed: locksReleased,
        detail: locksReleased
          ? 'locked_by=NULL, locked_at=NULL'
          : `locked_by=${finalJob?.locked_by}, locked_at=${finalJob?.locked_at}`,
      });

      // ── 5. Verify progress consistency ──────────────────────
      setPhase('التحقق من تناسق التقدم…');
      const total = finalJob?.progress_total || 0;
      const done = finalJob?.progress_done || 0;
      const failed = finalJob?.progress_failed || 0;
      const progressConsistent = (done + failed) === total;
      results.push({
        label: 'تناسق التقدم',
        passed: progressConsistent,
        detail: `done(${done}) + failed(${failed}) = ${done + failed} / total(${total})`,
      });

      // ── 6. Verify no duplicate items ────────────────────────
      setPhase('التحقق من عدم تكرار العناصر…');
      const { data: items } = await supabase
        .from('ai_job_items')
        .select('item_index')
        .eq('job_id', jobId);

      const indices = (items || []).map((i: any) => i.item_index);
      const uniqueIndices = new Set(indices);
      const noDuplicates = indices.length === uniqueIndices.size;
      results.push({
        label: 'عدم تكرار العناصر',
        passed: noDuplicates,
        detail: `${indices.length} عنصر، ${uniqueIndices.size} فريد`,
      });

      // ── 7. Cleanup: delete test job & items ─────────────────
      setPhase('تنظيف بيانات الاختبار…');
      await supabase.from('ai_job_items').delete().eq('job_id', jobId);
      await supabase.from('ai_jobs').delete().eq('id', jobId);
      // Also cleanup any draft created by this test
      if (finalJob?.target_draft_id) {
        await supabase.from('question_drafts').delete().eq('id', finalJob.target_draft_id);
      }

    } catch (err: any) {
      results.push({ label: 'خطأ غير متوقع', passed: false, detail: err.message });
    }

    setChecks(results);
    setPhase('');
    setRunning(false);
    onComplete?.();

    const allPassed = results.every(r => r.passed);
    toast({
      title: allPassed ? '✅ جميع الاختبارات نجحت' : '⚠️ بعض الاختبارات فشلت',
      variant: allPassed ? 'default' : 'destructive',
    });
  };

  const allPassed = checks.length > 0 && checks.every(r => r.passed);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FlaskConical className="h-4 w-4 ml-2" />
          اختبار E2E
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            اختبار شامل لأنبوب الذكاء الاصطناعي
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ينشئ مهمة توليد تجريبية ويتحقق من سلامة الأنبوب بالكامل: الأقفال، التقدم، وعدم التكرار.
          </p>

          {!running && checks.length === 0 && (
            <Button onClick={runTest} className="w-full">
              <Play className="h-4 w-4 ml-2" />
              بدء الاختبار
            </Button>
          )}

          {running && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0" />
                <span className="text-sm font-medium">{phase}</span>
              </CardContent>
            </Card>
          )}

          {checks.length > 0 && (
            <div className="space-y-2">
              {/* Summary */}
              <Card className={allPassed
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-destructive/30 bg-destructive/5'
              }>
                <CardContent className="p-3 flex items-center gap-2">
                  {allPassed
                    ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                    : <XCircle className="h-5 w-5 text-destructive" />
                  }
                  <span className="text-sm font-bold">
                    {allPassed ? 'الأنبوب يعمل بشكل سليم ✅' : 'يوجد خلل في الأنبوب ❌'}
                  </span>
                </CardContent>
              </Card>

              {/* Individual checks */}
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/30">
                  {c.passed
                    ? <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    {c.detail && (
                      <p className="text-xs text-muted-foreground break-all">{c.detail}</p>
                    )}
                  </div>
                </div>
              ))}

              {!running && (
                <Button onClick={runTest} variant="outline" size="sm" className="w-full mt-2">
                  إعادة الاختبار
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
