import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ExamTemplate } from '@/types';

/**
 * Checks if an exam template has enough approved questions per section.
 * Uses the 10% flex rule: available >= required * 0.9
 */
export function useExamReadiness(templates: ExamTemplate[]) {
  const [readiness, setReadiness] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (templates.length === 0) {
      setReadiness({});
      setLoading(false);
      return;
    }

    const check = async () => {
      setLoading(true);
      const result: Record<string, boolean> = {};

      for (const exam of templates) {
        if (exam.sections.length === 0) {
          result[exam.id] = false;
          continue;
        }

        let isReady = true;
        for (const section of exam.sections) {
          const { count, error } = await supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('section_id', section.id)
            .eq('status', 'approved')
            .is('deleted_at', null);

          const available = count ?? 0;
          const required = Math.ceil(section.questionCount * 0.9);
          if (error || available < required) {
            isReady = false;
            break;
          }
        }
        result[exam.id] = isReady;
      }

      setReadiness(result);
      setLoading(false);
    };

    check();
  }, [templates]);

  return { readiness, loading };
}
