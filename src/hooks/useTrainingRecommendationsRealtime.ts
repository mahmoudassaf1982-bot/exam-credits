import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TrainingRecommendation } from '@/services/trainingRecommendationEngine';

const motivationalMessages = [
  'أحسنت! 🎉',
  'عمل رائع! 💪',
  'ممتاز! 🌟',
  'استمر على هذا المستوى! 🚀',
];

export interface RecommendationRow {
  id: string;
  student_id: string;
  weakness_key: string;
  recommendation_json: TrainingRecommendation;
  recommendation_type: string;
  recommended_mode: string;
  target_section: string | null;
  difficulty: string;
  reason_text: string;
  is_completed: boolean;
  started_at: string | null;
  completed_at: string | null;
  training_session_id: string | null;
  source_exam_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useTrainingRecommendationsRealtime(studentId: string | undefined) {
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist previous recs across page navigations via sessionStorage
  const prevRecsRef = useRef<RecommendationRow[]>(
    (() => {
      try {
        const stored = sessionStorage.getItem(`prev_recs_${studentId}`);
        return stored ? JSON.parse(stored) : [];
      } catch { return []; }
    })()
  );

  const fetchRecommendations = useCallback(async () => {
    if (!studentId) return;
    const { data, error } = await supabase
      .from('student_training_recommendations')
      .select('*')
      .eq('student_id', studentId)
      .eq('is_completed', false)
      .order('created_at', { ascending: false })
      .limit(4);

    
    if (!error && data) {
      const newRecs = data as unknown as RecommendationRow[];
      
      // Detect removed weaknesses (were in old list but not in new)
      const prev = prevRecsRef.current;
      if (prev.length > 0 && newRecs.length > 0) {
        const newKeys = new Set(newRecs.map(r => r.weakness_key));
        const removed = prev.filter(r => !newKeys.has(r.weakness_key));
        for (const r of removed) {
          const sectionName = (r.recommendation_json as any)?.sectionName || r.target_section || r.weakness_key;
          const msg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
          toast.success(`${msg} لقد أتقنت قسم "${sectionName}"`, { duration: 6000 });
        }
      }
      
      prevRecsRef.current = newRecs;
      try { sessionStorage.setItem(`prev_recs_${studentId}`, JSON.stringify(newRecs)); } catch {}
      setRecommendations(newRecs);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    fetchRecommendations();

    // Realtime subscription
    const channel = supabase
      .channel(`recs-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_training_recommendations',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          console.log('[Recommendations Realtime]', payload.eventType);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            toast.info('تم تحديث توصيات التدريب بناءً على اختبارك الأخير', { duration: 4000 });
          }
          fetchRecommendations();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Realtime working, clear fallback
          if (fallbackRef.current) {
            clearInterval(fallbackRef.current);
            fallbackRef.current = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Fallback to polling every 25s
          if (!fallbackRef.current) {
            fallbackRef.current = setInterval(fetchRecommendations, 25000);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current);
        fallbackRef.current = null;
      }
    };
  }, [studentId, fetchRecommendations]);

  const markStarted = useCallback(async (recId: string, sessionId: string) => {
    await supabase
      .from('student_training_recommendations')
      .update({ started_at: new Date().toISOString(), training_session_id: sessionId } as any)
      .eq('id', recId);
  }, []);

  return { recommendations, loading, refetch: fetchRecommendations, markStarted };
}
