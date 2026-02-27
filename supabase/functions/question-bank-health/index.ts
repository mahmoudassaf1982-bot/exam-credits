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

    // Get all active exam templates
    const { data: templates } = await admin
      .from('exam_templates')
      .select('id, name_ar, country_id, target_easy_pct, target_medium_pct, target_hard_pct, health_alert_threshold_pct')
      .eq('is_active', true);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({
        need_generation: false,
        suggested_jobs: [],
        thresholds: {},
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
      section_id: string | null;
      section_name: string | null;
      difficulty: string;
      count: number;
      country_id: string;
      reason: string;
    }[] = [];

    const exams: any[] = [];

    for (const tmpl of templates) {
      const { data: questions } = await admin
        .from('questions')
        .select('id, difficulty, section_id')
        .eq('is_approved', true)
        .eq('exam_template_id', String(tmpl.id))
        .is('deleted_at', null);

      const qs = questions || [];
      const total = qs.length;
      const easy = qs.filter((q: any) => q.difficulty === 'easy').length;
      const medium = qs.filter((q: any) => q.difficulty === 'medium').length;
      const hard = qs.filter((q: any) => q.difficulty === 'hard').length;

      const easyPct = total > 0 ? Math.round((easy / total) * 100) : 0;
      const mediumPct = total > 0 ? Math.round((medium / total) * 100) : 0;
      const hardPct = total > 0 ? Math.round((hard / total) * 100) : 0;

      const threshold = tmpl.health_alert_threshold_pct || 10;
      const alerts: string[] = [];

      // Check shortages and build suggested jobs
      const checkShortage = (diff: string, currentPct: number, targetPct: number, label: string) => {
        if (targetPct - currentPct > threshold) {
          const deficit = Math.max(Math.ceil((targetPct - currentPct) * total / 100), 10);
          alerts.push(`نقص أسئلة ${label}: ${currentPct}% مقابل هدف ${targetPct}%`);
          suggestedJobs.push({
            exam_template_id: String(tmpl.id),
            exam_name: tmpl.name_ar,
            section_id: null,
            section_name: null,
            difficulty: diff,
            count: deficit,
            country_id: tmpl.country_id,
            reason: `نقص ${label}: ${currentPct}% مقابل هدف ${targetPct}%`,
          });
        }
      };

      checkShortage('easy', easyPct, tmpl.target_easy_pct, 'سهلة');
      checkShortage('medium', mediumPct, tmpl.target_medium_pct, 'متوسطة');
      checkShortage('hard', hardPct, tmpl.target_hard_pct, 'صعبة');

      // Per-section analysis
      const { data: sections } = await admin
        .from('exam_sections')
        .select('id, name_ar')
        .eq('exam_template_id', tmpl.id);

      for (const sec of (sections || [])) {
        const secQs = qs.filter((q: any) => q.section_id === sec.id);
        const sTotal = secQs.length;
        const sEasy = secQs.filter((q: any) => q.difficulty === 'easy').length;
        const sMedium = secQs.filter((q: any) => q.difficulty === 'medium').length;
        const sHard = secQs.filter((q: any) => q.difficulty === 'hard').length;

        const sEasyPct = sTotal > 0 ? Math.round((sEasy / sTotal) * 100) : 0;
        const sMediumPct = sTotal > 0 ? Math.round((sMedium / sTotal) * 100) : 0;
        const sHardPct = sTotal > 0 ? Math.round((sHard / sTotal) * 100) : 0;

        const checkSectionShortage = (diff: string, currentPct: number, targetPct: number, label: string) => {
          if (targetPct - currentPct > threshold) {
            const deficit = Math.max(Math.ceil((targetPct - currentPct) * sTotal / 100), 5);
            suggestedJobs.push({
              exam_template_id: String(tmpl.id),
              exam_name: tmpl.name_ar,
              section_id: sec.id,
              section_name: sec.name_ar,
              difficulty: diff,
              count: deficit,
              country_id: tmpl.country_id,
              reason: `قسم "${sec.name_ar}": نقص ${label} (${currentPct}% مقابل ${targetPct}%)`,
            });
          }
        };

        checkSectionShortage('easy', sEasyPct, tmpl.target_easy_pct, 'سهلة');
        checkSectionShortage('medium', sMediumPct, tmpl.target_medium_pct, 'متوسطة');
        checkSectionShortage('hard', sHardPct, tmpl.target_hard_pct, 'صعبة');
      }

      exams.push({
        exam_template_id: String(tmpl.id),
        exam_name: tmpl.name_ar,
        country_id: tmpl.country_id,
        total_approved: total,
        distribution: { easy, medium, hard, easy_pct: easyPct, medium_pct: mediumPct, hard_pct: hardPct },
        targets: { easy_pct: tmpl.target_easy_pct, medium_pct: tmpl.target_medium_pct, hard_pct: tmpl.target_hard_pct },
        threshold,
        health_status: alerts.length > 0 ? 'unhealthy' : 'healthy',
        alerts,
      });
    }

    return new Response(JSON.stringify({
      need_generation: suggestedJobs.length > 0,
      suggested_jobs: suggestedJobs,
      thresholds: {
        default_easy_pct: 30,
        default_medium_pct: 50,
        default_hard_pct: 20,
        alert_threshold_pct: 10,
      },
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
