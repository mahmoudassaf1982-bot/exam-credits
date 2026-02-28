import { createClient } from 'npm:@supabase/supabase-js@2';

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const {
      exam_template_id,
      section_id = null,
      country_id = 'kw',
      difficulty = 'medium',
      count = 10,
      language = 'ar',
    } = body;

    if (!exam_template_id) {
      return new Response(JSON.stringify({ error: 'exam_template_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return new Response(JSON.stringify({ error: 'difficulty must be easy, medium, or hard' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (count < 1 || count > 100) {
      return new Response(JSON.stringify({ error: 'count must be between 1 and 100' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Verify exam template exists
    const { data: tmpl } = await admin
      .from('exam_templates')
      .select('id, name_ar')
      .eq('id', exam_template_id)
      .single();

    if (!tmpl) {
      return new Response(JSON.stringify({ error: 'exam_template_id not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a system admin user for created_by
    const { data: adminRole } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'No admin user found for job creation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const idempotencyKey = `n8n-gen-${exam_template_id}-${section_id || 'all'}-${difficulty}-${count}-${Date.now()}`;

    const { data: job, error: jobErr } = await admin
      .from('ai_jobs')
      .insert({
        type: 'generate_questions_draft',
        status: 'queued',
        created_by: adminRole.user_id,
        idempotency_key: idempotencyKey,
        priority: 3,
        progress_total: count,
        params_json: {
          country_id,
          exam_template_id,
          section_id,
          difficulty,
          count,
          language,
          generator_model: 'google/gemini-2.5-flash',
          reviewer_model: 'google/gemini-2.5-pro',
        },
      })
      .select('id, status, created_at')
      .single();

    if (jobErr) throw jobErr;

    // Trigger the worker (best-effort)
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
      job_status: job.status,
      created_at: job.created_at,
      message: `تم إنشاء مهمة توليد ${count} سؤال ${difficulty} للاختبار "${tmpl.name_ar}"`,
      params: { exam_template_id, section_id, country_id, difficulty, count, language },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('question-bank-generate error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
