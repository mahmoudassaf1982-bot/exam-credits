import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Loader2, AlertTriangle, CheckCircle, BarChart3,
  Target, TrendingDown, Sparkles, RefreshCw, Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SectionHealth {
  section_id: string;
  section_name: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
  target_easy_pct: number;
  target_medium_pct: number;
  target_hard_pct: number;
  shortages: { difficulty: string; deficit: number; recommended_generate: number }[];
}

interface ExamHealth {
  exam_template_id: string;
  exam_name: string;
  country_id: string;
  total_approved: number;
  easy: number;
  medium: number;
  hard: number;
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
  target_easy_pct: number;
  target_medium_pct: number;
  target_hard_pct: number;
  health_alert_threshold_pct: number;
  alerts: string[];
  sections: SectionHealth[];
  recommendations: string[];
}

interface CalibrationStat {
  id: string;
  question_id: string;
  old_difficulty: string;
  new_difficulty: string;
  accuracy: number;
  attempts_count: number;
  calibrated_at: string;
}

const difficultyLabels: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
const difficultyColors: Record<string, string> = {
  easy: 'text-emerald-600 bg-emerald-500/10',
  medium: 'text-amber-600 bg-amber-500/10',
  hard: 'text-destructive bg-destructive/10',
};

function DifficultyBar({ label, actual, target, count }: { label: string; actual: number; target: number; count: number }) {
  const isShort = target - actual > 5;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={isShort ? 'text-destructive font-bold' : 'text-muted-foreground'}>
          {actual}% / {target}% ({count})
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 right-0 rounded-full bg-primary/30"
          style={{ width: `${target}%` }}
        />
        <div
          className={`absolute inset-y-0 right-0 rounded-full transition-all ${isShort ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${actual}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminBankHealth() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ExamHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);
  const [calibrationLogs, setCalibrationLogs] = useState<CalibrationStat[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('all');

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bank-health-report', {
        body: {},
      });
      if (error) throw error;
      if (data?.reports) setReports(data.reports);
    } catch (e: any) {
      toast({ title: 'خطأ في تحميل تقرير الصحة', description: e?.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  const fetchCalibrationLogs = useCallback(async () => {
    const { data } = await supabase
      .from('calibration_log')
      .select('*')
      .order('calibrated_at', { ascending: false })
      .limit(50);
    if (data) setCalibrationLogs(data as unknown as CalibrationStat[]);
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchCalibrationLogs();
  }, []);

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('bank-health-report', {
        body: {},
      });
      if (error) throw error;
      toast({
        title: data?.email_sent ? '📧 تم إرسال التقرير بالبريد' : '📊 تم إنشاء التقرير (لم يُرسل بريد)',
        description: data?.has_alerts ? `${reports.filter(r => r.alerts.length > 0).length} اختبار به تنبيهات` : 'جميع الاختبارات بحالة جيدة',
      });
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message, variant: 'destructive' });
    }
    setSendingReport(false);
  };

  const filteredReports = selectedExam === 'all' ? reports : reports.filter(r => r.exam_template_id === selectedExam);
  const totalAlerts = reports.reduce((s, r) => s + r.alerts.length, 0);
  const totalQuestions = reports.reduce((s, r) => s + r.total_approved, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground flex items-center gap-3">
            <Activity className="h-7 w-7 text-primary" />
            صحة بنك الأسئلة
          </h1>
          <p className="mt-1 text-muted-foreground">التوزيع الفعلي مقابل الأهداف • المعايرة التلقائية • التنبيهات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
          <Button onClick={handleSendReport} disabled={sendingReport} className="gradient-primary text-primary-foreground">
            {sendingReport ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Mail className="h-4 w-4 ml-2" />}
            إرسال تقرير بالبريد
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{totalQuestions}</p>
              <p className="text-xs text-muted-foreground">إجمالي الأسئلة المعتمدة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${totalAlerts > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
              {totalAlerts > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle className="h-5 w-5 text-emerald-600" />}
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{totalAlerts}</p>
              <p className="text-xs text-muted-foreground">تنبيهات نقص</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">{calibrationLogs.length}</p>
              <p className="text-xs text-muted-foreground">عمليات معايرة (آخر 50)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exam filter */}
      {reports.length > 1 && (
        <Select value={selectedExam} onValueChange={setSelectedExam}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="جميع الاختبارات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الاختبارات</SelectItem>
            {reports.map(r => (
              <SelectItem key={r.exam_template_id} value={r.exam_template_id}>
                {r.exam_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا توجد اختبارات نشطة
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredReports.map(report => (
            <Card key={report.exam_template_id} className={report.alerts.length > 0 ? 'border-destructive/30' : 'border-emerald-500/30'}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {report.alerts.length > 0 ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    )}
                    {report.exam_name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{report.total_approved} سؤال</Badge>
                    {report.alerts.length > 0 && (
                      <Badge variant="destructive">{report.alerts.length} تنبيه</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Overall difficulty distribution */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold">التوزيع الإجمالي</p>
                  <DifficultyBar label="سهل" actual={report.easy_pct} target={report.target_easy_pct} count={report.easy} />
                  <DifficultyBar label="متوسط" actual={report.medium_pct} target={report.target_medium_pct} count={report.medium} />
                  <DifficultyBar label="صعب" actual={report.hard_pct} target={report.target_hard_pct} count={report.hard} />
                </div>

                {/* Alerts */}
                {report.alerts.length > 0 && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    {report.alerts.map((a, i) => (
                      <p key={i} className="text-sm text-destructive flex items-center gap-2">
                        <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" /> {a}
                      </p>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {report.recommendations.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                    <p className="text-xs font-bold text-amber-700 mb-1">💡 توصيات التوليد:</p>
                    {report.recommendations.map((r, i) => (
                      <p key={i} className="text-sm text-amber-700 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" /> {r}
                      </p>
                    ))}
                  </div>
                )}

                {/* Per-section breakdown */}
                {report.sections.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">التوزيع حسب القسم</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {report.sections.map(sec => (
                        <div key={sec.section_id} className={`rounded-lg border p-3 space-y-2 ${sec.shortages.length > 0 ? 'border-destructive/20 bg-destructive/5' : 'bg-muted/30'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{sec.section_name}</span>
                            <Badge variant="outline" className="text-[10px]">{sec.total} سؤال</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className={`rounded p-1.5 ${difficultyColors.easy}`}>
                              <p className="font-bold">{sec.easy}</p>
                              <p>سهل {sec.easy_pct}%</p>
                            </div>
                            <div className={`rounded p-1.5 ${difficultyColors.medium}`}>
                              <p className="font-bold">{sec.medium}</p>
                              <p>متوسط {sec.medium_pct}%</p>
                            </div>
                            <div className={`rounded p-1.5 ${difficultyColors.hard}`}>
                              <p className="font-bold">{sec.hard}</p>
                              <p>صعب {sec.hard_pct}%</p>
                            </div>
                          </div>
                          {sec.shortages.length > 0 && (
                            <div className="text-[11px] text-destructive space-y-0.5">
                              {sec.shortages.map((s, si) => (
                                <p key={si}>⚠️ نقص {difficultyLabels[s.difficulty]}: ولّد {s.recommended_generate} سؤال</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Calibration Log */}
      {calibrationLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-600" />
              سجل المعايرة التلقائية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">السؤال</th>
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">من</th>
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">إلى</th>
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">الدقة</th>
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">المحاولات</th>
                    <th className="p-2 text-right text-xs font-semibold text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {calibrationLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-2 text-xs font-mono">{log.question_id.slice(0, 8)}…</td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[10px] ${difficultyColors[log.old_difficulty]}`}>
                          {difficultyLabels[log.old_difficulty]}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[10px] ${difficultyColors[log.new_difficulty]}`}>
                          {difficultyLabels[log.new_difficulty]}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{Math.round(Number(log.accuracy) * 100)}%</td>
                      <td className="p-2 text-xs">{log.attempts_count}</td>
                      <td className="p-2 text-xs text-muted-foreground">{new Date(log.calibrated_at).toLocaleDateString('ar-SA')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
