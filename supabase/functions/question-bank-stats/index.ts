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

    // Use service role for full access
    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch all active questions (not soft-deleted)
    const { data: questions, error: qErr } = await admin
      .from('questions')
      .select('status, difficulty, country_id, exam_template_id, section_id, source, language')
      .is('deleted_at', null);

    if (qErr) throw qErr;

    const all = questions ?? [];

    // --- Counts by status ---
    const byStatus: Record<string, number> = {};
    all.forEach(q => { byStatus[q.status] = (byStatus[q.status] ?? 0) + 1; });

    // --- Counts by difficulty ---
    const byDifficulty: Record<string, number> = {};
    all.forEach(q => { byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1; });

    // --- Counts by source ---
    const bySource: Record<string, number> = {};
    all.forEach(q => { bySource[q.source] = (bySource[q.source] ?? 0) + 1; });

    // --- Counts by country ---
    const byCountry: Record<string, number> = {};
    all.forEach(q => { byCountry[q.country_id] = (byCountry[q.country_id] ?? 0) + 1; });

    // --- Counts by exam_template ---
    const byExam: Record<string, number> = {};
    all.forEach(q => {
      const key = q.exam_template_id ?? 'general';
      byExam[key] = (byExam[key] ?? 0) + 1;
    });

    // --- Counts by section ---
    const bySection: Record<string, number> = {};
    all.forEach(q => {
      const key = q.section_id ?? 'none';
      bySection[key] = (bySection[key] ?? 0) + 1;
    });

    // --- Counts by language ---
    const byLanguage: Record<string, number> = {};
    all.forEach(q => { byLanguage[q.language] = (byLanguage[q.language] ?? 0) + 1; });

    // --- Pending drafts ---
    const { count: pendingDrafts } = await admin
      .from('question_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');

    // --- Active AI jobs ---
    const { count: activeJobs } = await admin
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'running', 'partial']);

    return new Response(JSON.stringify({
      total: all.length,
      by_status: byStatus,
      by_difficulty: byDifficulty,
      by_source: bySource,
      by_country: byCountry,
      by_exam_template: byExam,
      by_section: bySection,
      by_language: byLanguage,
      pending_drafts: pendingDrafts ?? 0,
      active_ai_jobs: activeJobs ?? 0,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('question-bank-stats error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
