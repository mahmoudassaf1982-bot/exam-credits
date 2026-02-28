import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-saris-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function verifyKey(req: Request): boolean {
  const key = req.headers.get('x-saris-key');
  const expected = Deno.env.get('N8N_SARIS_KEY');
  return !!key && !!expected && key === expected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!verifyKey(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden: invalid x-saris-key' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Get all active exam templates (including bank_multiplier)
    const { data: templates } = await admin
      .from('exam_templates')
      .select('id, name_ar, country_id, target_easy_pct, target_medium_pct, target_hard_pct, health_alert_threshold_pct, bank_multiplier')
      .eq('is_active', true);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({
        need_generation: false,
        suggested_jobs: [],
        pending_review_count: 0,
        exams: [],
        generated_at: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pending review count
    const { count: pendingReviewCount } = await admin
      .from('question_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');

    const suggestedJobs: {
      exam_template_id: string;
      exam_name: string;
      section_id: string;
      section_name: string;
      difficulty: string;
      target: number;
      current: number;
      deficit: number;
      country_id: string;
      reason: string;
    }[] = [];

    const exams: any[] = [];

    for (const tmpl of templates) {
      const multiplier = tmpl.bank_multiplier ?? 7;

      // Get sections for this template
      const { data: sections } = await admin
        .from('exam_sections')
        .select('id, name_ar, question_count, difficulty_mix_json')
        .eq('exam_template_id', tmpl.id);

      if (!sections || sections.length === 0) continue;

      // Get all approved, non-deleted questions for this template
      const { data: questions } = await admin
        .from('questions')
        .select('id, difficulty, section_id')
        .eq('is_approved', true)
        .eq('exam_template_id', String(tmpl.id))
        .is('deleted_at', null);

      const qs = questions || [];

      const sectionResults: any[] = [];

      for (const sec of sections) {
        // Use section-level difficulty mix if available, otherwise template-level
        const mix = sec.difficulty_mix_json as { easy?: number; medium?: number; hard?: number } | null;
        const easyPct = (mix?.easy ?? tmpl.target_easy_pct) / 100;
        const mediumPct = (mix?.medium ?? tmpl.target_medium_pct) / 100;
        const hardPct = (mix?.hard ?? tmpl.target_hard_pct) / 100;

        const secQs = qs.filter((q: any) => q.section_id === sec.id);

        const difficulties = [
          { key: 'easy', label: 'سهلة', pct: easyPct },
          { key: 'medium', label: 'متوسطة', pct: mediumPct },
          { key: 'hard', label: 'صعبة', pct: hardPct },
        ];

        const sectionDiffs: any[] = [];

        for (const d of difficulties) {
          const target = Math.ceil(sec.question_count * d.pct * multiplier);
          const current = secQs.filter((q: any) => q.difficulty === d.key).length;
          const deficit = Math.max(target - current, 0);

          sectionDiffs.push({ difficulty: d.key, target, current, deficit });

          if (deficit > 0) {
            suggestedJobs.push({
              exam_template_id: String(tmpl.id),
              exam_name: tmpl.name_ar,
              section_id: sec.id,
              section_name: sec.name_ar,
              difficulty: d.key,
              target,
              current,
              deficit,
              country_id: tmpl.country_id,
              reason: `قسم "${sec.name_ar}": نقص ${d.label} — ${current}/${target} (عجز ${deficit})`,
            });
          }
        }

        sectionResults.push({
          section_id: sec.id,
          section_name: sec.name_ar,
          question_count: sec.question_count,
          total_approved: secQs.length,
          difficulties: sectionDiffs,
        });
      }

      exams.push({
        exam_template_id: String(tmpl.id),
        exam_name: tmpl.name_ar,
        country_id: tmpl.country_id,
        bank_multiplier: multiplier,
        sections: sectionResults,
        health_status: suggestedJobs.some(j => j.exam_template_id === String(tmpl.id)) ? 'unhealthy' : 'healthy',
      });
    }

    return new Response(JSON.stringify({
      need_generation: suggestedJobs.length > 0,
      suggested_jobs: suggestedJobs,
      pending_review_count: pendingReviewCount ?? 0,
      exams,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('question-bank-health error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
