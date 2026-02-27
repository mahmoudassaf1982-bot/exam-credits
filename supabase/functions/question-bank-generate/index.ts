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

    // Parse request body
    const body = await req.json();
    const {
      exam_template_id,
      section_id,
      country_id = 'kw',
      difficulty = 'medium',
      count = 10,
      topic,
    } = body;

    if (!exam_template_id) {
      return new Response(JSON.stringify({ error: 'exam_template_id is required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Get exam template info
    const { data: tmpl } = await admin
      .from('exam_templates')
      .select('name_ar')
      .eq('id', exam_template_id)
      .single();

    // Get section info if provided
    let sectionName = '';
    if (section_id) {
      const { data: sec } = await admin
        .from('exam_sections')
        .select('name_ar')
        .eq('id', section_id)
        .single();
      sectionName = sec?.name_ar || '';
    }

    // Enqueue an AI job for generation
    const idempotencyKey = `n8n-generate-${exam_template_id}-${section_id || 'all'}-${difficulty}-${Date.now()}`;

    const { data: job, error: jobErr } = await admin
      .from('ai_jobs')
      .insert({
        type: 'generate_questions_draft',
        created_by: user.id,
        idempotency_key: idempotencyKey,
        priority: 3,
        progress_total: count,
        params_json: {
          country_id,
          exam_template_id,
          section_id: section_id || null,
          difficulty,
          count,
          topic: topic || null,
          generator_model: 'google/gemini-2.5-flash',
          reviewer_model: 'google/gemini-2.5-pro',
        },
      })
      .select()
      .single();

    if (jobErr) throw jobErr;

    // Trigger the worker
    try {
      await fetch(`${supabaseUrl}/functions/v1/ai-worker`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } catch {
      // Worker trigger is best-effort
    }

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      message: `تم إنشاء مهمة توليد ${count} سؤال (${difficulty}) للاختبار "${tmpl?.name_ar || exam_template_id}"${sectionName ? ` - قسم "${sectionName}"` : ''}`,
      params: {
        exam_template_id,
        section_id,
        country_id,
        difficulty,
        count,
        topic,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('question-bank-generate error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
