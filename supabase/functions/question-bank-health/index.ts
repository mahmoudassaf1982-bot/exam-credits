import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: roleData } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Get all active exam templates
    const { data: templates } = await admin
      .from('exam_templates')
      .select('id, name_ar, country_id, target_easy_pct, target_medium_pct, target_hard_pct, health_alert_threshold_pct')
      .eq('is_active', true);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({ exams: [], has_alerts: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const exams = [];

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
      const shortages: { difficulty: string; current_pct: number; target_pct: number; deficit: number }[] = [];

      if (tmpl.target_easy_pct - easyPct > threshold) {
        const deficit = Math.max(Math.ceil((tmpl.target_easy_pct - easyPct) * total / 100), 10);
        alerts.push(`نقص أسئلة سهلة: ${easyPct}% مقابل هدف ${tmpl.target_easy_pct}%`);
        shortages.push({ difficulty: 'easy', current_pct: easyPct, target_pct: tmpl.target_easy_pct, deficit });
      }
      if (tmpl.target_medium_pct - mediumPct > threshold) {
        const deficit = Math.max(Math.ceil((tmpl.target_medium_pct - mediumPct) * total / 100), 10);
        alerts.push(`نقص أسئلة متوسطة: ${mediumPct}% مقابل هدف ${tmpl.target_medium_pct}%`);
        shortages.push({ difficulty: 'medium', current_pct: mediumPct, target_pct: tmpl.target_medium_pct, deficit });
      }
      if (tmpl.target_hard_pct - hardPct > threshold) {
        const deficit = Math.max(Math.ceil((tmpl.target_hard_pct - hardPct) * total / 100), 10);
        alerts.push(`نقص أسئلة صعبة: ${hardPct}% مقابل هدف ${tmpl.target_hard_pct}%`);
        shortages.push({ difficulty: 'hard', current_pct: hardPct, target_pct: tmpl.target_hard_pct, deficit });
      }

      // Per-section breakdown
      const { data: sections } = await admin
        .from('exam_sections')
        .select('id, name_ar')
        .eq('exam_template_id', tmpl.id);

      const sectionHealths = (sections || []).map((sec: any) => {
        const secQs = qs.filter((q: any) => q.section_id === sec.id);
        const sTotal = secQs.length;
        return {
          section_id: sec.id,
          section_name: sec.name_ar,
          total: sTotal,
          easy: secQs.filter((q: any) => q.difficulty === 'easy').length,
          medium: secQs.filter((q: any) => q.difficulty === 'medium').length,
          hard: secQs.filter((q: any) => q.difficulty === 'hard').length,
        };
      });

      exams.push({
        exam_template_id: tmpl.id,
        exam_name: tmpl.name_ar,
        country_id: tmpl.country_id,
        total_approved: total,
        distribution: { easy, medium, hard, easy_pct: easyPct, medium_pct: mediumPct, hard_pct: hardPct },
        targets: { easy_pct: tmpl.target_easy_pct, medium_pct: tmpl.target_medium_pct, hard_pct: tmpl.target_hard_pct },
        health_status: alerts.length > 0 ? 'unhealthy' : 'healthy',
        alerts,
        shortages,
        sections: sectionHealths,
      });
    }

    return new Response(JSON.stringify({
      exams,
      has_alerts: exams.some(e => e.alerts.length > 0),
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('question-bank-health error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
