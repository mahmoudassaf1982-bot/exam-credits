import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ExamTemplate, ExamSection, DifficultyMix } from '@/types';

export function useExamTemplates(countryId?: string) {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      let query = supabase
        .from('exam_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (countryId) {
        query = query.eq('country_id', countryId);
      }

      const { data: templatesData } = await query;
      if (!templatesData || templatesData.length === 0) {
        setTemplates([]);
        setLoading(false);
        return;
      }

      const templateIds = templatesData.map((t) => t.id);

      const { data: sectionsData } = await supabase
        .from('exam_sections')
        .select('*')
        .in('exam_template_id', templateIds)
        .order('order', { ascending: true });

      const sectionsByTemplate = new Map<string, ExamSection[]>();
      (sectionsData ?? []).forEach((s) => {
        const section: ExamSection = {
          id: s.id,
          examTemplateId: s.exam_template_id,
          order: s.order,
          nameAr: s.name_ar,
          timeLimitSec: s.time_limit_sec,
          questionCount: s.question_count,
          topicFilterJson: s.topic_filter_json as string[] | null,
          difficultyMixJson: s.difficulty_mix_json as unknown as DifficultyMix | null,
          scoringRuleJson: null,
          createdAt: s.created_at,
        };
        const list = sectionsByTemplate.get(s.exam_template_id) ?? [];
        list.push(section);
        sectionsByTemplate.set(s.exam_template_id, list);
      });

      const result: ExamTemplate[] = templatesData.map((t) => ({
        id: t.id,
        countryId: t.country_id,
        slug: t.slug,
        nameAr: t.name_ar,
        descriptionAr: t.description_ar,
        isActive: t.is_active,
        defaultTimeLimitSec: t.default_time_limit_sec,
        defaultQuestionCount: t.default_question_count,
        simulationSessionCostPoints: t.simulation_cost_points,
        practiceSessionCostPoints: t.practice_cost_points,
        analysisCostPoints: t.analysis_cost_points,
        sections: sectionsByTemplate.get(t.id) ?? [],
        createdAt: t.created_at,
      }));

      setTemplates(result);
      setLoading(false);
    };

    load();
  }, [countryId]);

  return { templates, loading };
}
