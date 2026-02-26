import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AiJob {
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

export interface AiJobItem {
  id: string;
  job_id: string;
  item_index: number;
  status: string;
  error: string | null;
  attempt_count: number;
  started_at: string | null;
  finished_at: string | null;
}

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export function useAiJobsRealtime(filterStatus?: string, filterType?: string) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<Record<string, string>>({});

  const fetchJobs = useCallback(async () => {
    let query = supabase
      .from('ai_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterStatus && filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterType && filterType !== 'all') query = query.eq('type', filterType);

    const { data, error } = await query;
    if (!error && data) {
      setJobs(data as unknown as AiJob[]);
      // Track status for toast notifications
      const statusMap: Record<string, string> = {};
      (data as any[]).forEach(j => { statusMap[j.id] = j.status; });
      prevStatusRef.current = statusMap;
    }
    setLoading(false);
  }, [filterStatus, filterType]);

  // Initial fetch
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('ai_jobs_realtime')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'ai_jobs' },
        (payload: any) => {
          const newRow = payload.new as AiJob;
          if (!newRow?.id) return;

          setJobs(prev => {
            const idx = prev.findIndex(j => j.id === newRow.id);
            if (payload.eventType === 'DELETE') {
              return prev.filter(j => j.id !== (payload.old as any)?.id);
            }
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = newRow;
              return updated;
            }
            // INSERT — prepend
            return [newRow, ...prev];
          });

          // Toast on terminal status change
          const prevStatus = prevStatusRef.current[newRow.id];
          if (prevStatus && prevStatus !== newRow.status) {
            if (newRow.status === 'succeeded') {
              toast({ title: '✅ اكتملت المهمة بنجاح' });
            } else if (newRow.status === 'failed') {
              toast({ title: '❌ فشلت المهمة — راجع الأخطاء', variant: 'destructive' });
            }
          }
          prevStatusRef.current[newRow.id] = newRow.status;
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          // Clear polling fallback
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
          // Start polling fallback
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(fetchJobs, 8000);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [fetchJobs, toast]);

  const activeCount = jobs.filter(j => ['queued', 'running', 'partial'].includes(j.status)).length;

  return { jobs, loading, connectionStatus, activeCount, refetch: fetchJobs };
}

export function useAiJobItemsRealtime(jobId: string | null) {
  const [items, setItems] = useState<AiJobItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const { data } = await supabase
      .from('ai_job_items')
      .select('id, job_id, item_index, status, error, attempt_count, started_at, finished_at')
      .eq('job_id', jobId)
      .order('item_index', { ascending: true });
    setItems((data || []) as unknown as AiJobItem[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Realtime for this job's items
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`ai_job_items_${jobId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'ai_job_items', filter: `job_id=eq.${jobId}` },
        (payload: any) => {
          const newRow = payload.new as AiJobItem;
          if (!newRow?.id) return;
          setItems(prev => {
            const idx = prev.findIndex(i => i.id === newRow.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = newRow;
              return updated;
            }
            return [...prev, newRow].sort((a, b) => a.item_index - b.item_index);
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  return { items, loading, refetch: fetchItems };
}

// Lightweight hook just for active count (used on generator/review pages)
export function useActiveJobsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const { count: c } = await supabase
        .from('ai_jobs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'running', 'partial']);
      setCount(c || 0);
    };
    fetch();

    const channel = supabase
      .channel('active_jobs_count')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'ai_jobs' },
        () => { fetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
