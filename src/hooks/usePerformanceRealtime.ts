import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LearningDNA } from '@/services/learningDNAEngine';
import type { RecommendationRow } from '@/hooks/useTrainingRecommendationsRealtime';

interface MemoryProfile {
  strength_map: Record<string, number>;
  weakness_map: Record<string, number>;
  speed_profile: string;
  accuracy_profile: number;
}

interface SessionHistoryItem {
  id: string;
  session_type: string;
  status: string;
  score_json: {
    total_correct: number;
    total_questions: number;
    percentage: number;
    section_scores?: Record<string, { correct: number; total: number; name: string }>;
  } | null;
  completed_at: string | null;
  started_at: string;
  time_limit_sec: number;
  exam_snapshot: {
    template: { name_ar: string };
    practice_mode?: string;
    is_diagnostic?: boolean;
    target_section_name?: string;
  } | null;
}

export interface PerformanceData {
  dna: LearningDNA | null;
  memory: MemoryProfile | null;
  recommendations: RecommendationRow[];
  sessions: SessionHistoryItem[];
  loading: boolean;
  realtimeConnected: boolean;
}

export function usePerformanceRealtime(studentId: string | undefined): PerformanceData {
  const [dna, setDna] = useState<LearningDNA | null>(null);
  const [memory, setMemory] = useState<MemoryProfile | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDna = useCallback(async () => {
    if (!studentId) return;
    const { data } = await supabase
      .from('student_learning_dna' as any)
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();
    if (data) setDna(data as any);
  }, [studentId]);

  const fetchMemory = useCallback(async () => {
    if (!studentId) return;
    const { data } = await supabase
      .from('student_memory_profile' as any)
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();
    if (data) {
      setMemory({
        strength_map: (data as any).strength_map || {},
        weakness_map: (data as any).weakness_map || {},
        speed_profile: (data as any).speed_profile || 'normal',
        accuracy_profile: Number((data as any).accuracy_profile) || 0,
      });
    }
  }, [studentId]);

  const fetchRecs = useCallback(async () => {
    if (!studentId) return;
    const { data } = await supabase
      .from('student_training_recommendations')
      .select('*')
      .eq('student_id', studentId)
      .eq('is_completed', false)
      .order('created_at', { ascending: false })
      .limit(6);
    if (data) setRecommendations(data as unknown as RecommendationRow[]);
  }, [studentId]);

  const fetchSessions = useCallback(async () => {
    if (!studentId) return;
    const { data } = await supabase
      .from('exam_sessions')
      .select('id, session_type, status, score_json, completed_at, started_at, time_limit_sec, exam_snapshot, exam_template_id')
      .eq('user_id', studentId)
      .in('status', ['completed', 'submitted'])
      .not('score_json', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(30);
    if (data) setSessions(data as unknown as SessionHistoryItem[]);
  }, [studentId]);

  const fetchAll = useCallback(async () => {
    if (!studentId) return;
    await Promise.all([fetchDna(), fetchMemory(), fetchRecs(), fetchSessions()]);
    setLoading(false);
  }, [fetchDna, fetchMemory, fetchRecs, fetchSessions, studentId]);

  useEffect(() => {
    if (!studentId) return;
    fetchAll();

    const channels = [
      supabase.channel(`perf-dna-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_learning_dna', filter: `student_id=eq.${studentId}` }, () => fetchDna())
        .subscribe(s => { if (s === 'SUBSCRIBED') setRealtimeConnected(true); }),
      supabase.channel(`perf-mem-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_memory_profile', filter: `student_id=eq.${studentId}` }, () => fetchMemory())
        .subscribe(),
      supabase.channel(`perf-recs-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_training_recommendations', filter: `student_id=eq.${studentId}` }, () => fetchRecs())
        .subscribe(),
      supabase.channel(`perf-sess-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions', filter: `user_id=eq.${studentId}` }, () => fetchSessions())
        .subscribe(),
    ];

    // Fallback polling if realtime fails
    const timeout = setTimeout(() => {
      if (!realtimeConnected && !pollRef.current) {
        pollRef.current = setInterval(fetchAll, 10000);
      }
    }, 5000);

    return () => {
      clearTimeout(timeout);
      channels.forEach(ch => supabase.removeChannel(ch));
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [studentId, fetchAll, fetchDna, fetchMemory, fetchRecs, fetchSessions]);

  return { dna, memory, recommendations, sessions, loading, realtimeConnected };
}
