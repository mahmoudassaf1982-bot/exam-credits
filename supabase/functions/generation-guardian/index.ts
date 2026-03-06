import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-saris-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ─── Auth: accepts either Bearer token (admin UI) or x-saris-key (n8n) ─── */
function normalizeSecret(v: string | null): string {
  return (v ?? '').trim();
}

interface AuthResult {
  ok: boolean;
  triggeredBy: string;
  userId?: string;
}

async function authenticate(req: Request, admin: any): Promise<AuthResult> {
  // n8n path
  const sarisKey = normalizeSecret(req.headers.get('x-saris-key'));
  const expectedKey = normalizeSecret(Deno.env.get('N8N_SARIS_KEY'));
  if (sarisKey.length > 0 && expectedKey.length > 0 && sarisKey === expectedKey) {
    return { ok: true, triggeredBy: 'n8n' };
  }

  // Admin UI path
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    if (data?.user) {
      const { data: isAdmin } = await admin.rpc('has_role', {
        _user_id: data.user.id,
        _role: 'admin',
      });
      if (isAdmin) return { ok: true, triggeredBy: 'admin', userId: data.user.id };
    }
  }

  return { ok: false, triggeredBy: 'unknown' };
}

/* ─── Validation helpers ─── */
interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

function diffCheck(mix: any): Check {
  if (!mix || typeof mix !== 'object') {
    return { name: 'difficulty_distribution', passed: false, detail: 'difficulty_mix_json is null or invalid' };
  }
  const easy = Number(mix.easy ?? 0);
  const medium = Number(mix.medium ?? 0);
  const hard = Number(mix.hard ?? 0);
  const total = easy + medium + hard;
  if (total < 95 || total > 105) {
    return {
      name: 'difficulty_distribution',
      passed: false,
      detail: `easy+medium+hard = ${total}% (must be ≈100%)`,
    };
  }
  return { name: 'difficulty_distribution', passed: true };
}

/* ─── Main handler ─── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const auth = await authenticate(req, admin);
    if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { exam_template_id, section_id, difficulty, count } = body;

    if (!exam_template_id) return json({ error: 'exam_template_id is required' }, 400);

    const checks: Check[] = [];
    let blocked = false;
    let blockReason = '';

    // ─── 1. Exam Profile Validation ────────────────────────────────
    const { data: profile } = await admin
      .from('exam_profiles')
      .select('status, profile_json')
      .eq('exam_template_id', exam_template_id)
      .single();

    if (!profile || profile.status !== 'approved') {
      checks.push({ name: 'exam_profile', passed: false, detail: 'Exam profile missing or not approved' });
      blocked = true;
      blockReason = 'Exam profile not approved';
    } else {
      checks.push({ name: 'exam_profile', passed: true });
    }

    // ─── 2. Section Structure Validation ───────────────────────────
    const { data: sections } = await admin
      .from('exam_sections')
      .select('id, name_ar, question_count, topic_filter_json, difficulty_mix_json')
      .eq('exam_template_id', exam_template_id);

    if (!sections || sections.length === 0) {
      checks.push({ name: 'section_structure', passed: false, detail: 'No sections found' });
      blocked = true;
      blockReason = blockReason || 'No sections defined';
    } else {
      const badSections = sections.filter(
        (s) => !s.question_count || s.question_count <= 0
      );
      if (badSections.length > 0) {
        checks.push({
          name: 'section_structure',
          passed: false,
          detail: `Sections with question_count=0: ${badSections.map((s) => s.name_ar).join(', ')}`,
        });
        blocked = true;
        blockReason = blockReason || 'Section with zero question_count';
      } else {
        checks.push({ name: 'section_structure', passed: true });
      }
    }

    // ─── 3. Difficulty Distribution Validation ─────────────────────
    if (sections && sections.length > 0) {
      const targetSections = section_id
        ? sections.filter((s) => s.id === section_id)
        : sections;

      for (const sec of targetSections) {
        const dc = diffCheck(sec.difficulty_mix_json);
        if (!dc.passed) {
          checks.push({
            name: 'difficulty_distribution',
            passed: false,
            detail: `Section "${sec.name_ar}": ${dc.detail}`,
          });
          blocked = true;
          blockReason = blockReason || `Invalid difficulty distribution in ${sec.name_ar}`;
        }
      }
      if (!checks.some((c) => c.name === 'difficulty_distribution' && !c.passed)) {
        checks.push({ name: 'difficulty_distribution', passed: true });
      }
    }

    // ─── 4. Topic Filter Validation ────────────────────────────────
    if (sections && sections.length > 0) {
      const targetSections = section_id
        ? sections.filter((s) => s.id === section_id)
        : sections;

      const emptyTopicSections = targetSections.filter((s) => {
        const topics = s.topic_filter_json;
        return !topics || !Array.isArray(topics) || topics.length === 0;
      });

      if (emptyTopicSections.length > 0) {
        checks.push({
          name: 'topic_filter',
          passed: false,
          detail: `Empty topic_filter_json: ${emptyTopicSections.map((s) => s.name_ar).join(', ')}`,
        });
        blocked = true;
        blockReason = blockReason || 'Section(s) missing topic filters';
      } else {
        checks.push({ name: 'topic_filter', passed: true });
      }
    }

    // ─── 5. Bank Size Protection ───────────────────────────────────
    const { data: template } = await admin
      .from('exam_templates')
      .select('bank_multiplier')
      .eq('id', exam_template_id)
      .single();

    const multiplier = template?.bank_multiplier ?? 7;

    if (sections && sections.length > 0) {
      const targetSections = section_id
        ? sections.filter((s) => s.id === section_id)
        : sections;

      for (const sec of targetSections) {
        const bankLimit = sec.question_count * multiplier;

        const { count: currentCount } = await admin
          .from('questions')
          .select('id', { count: 'exact', head: true })
          .eq('exam_template_id', exam_template_id)
          .eq('section_id', sec.id)
          .is('deleted_at', null);

        const current = currentCount ?? 0;

        if (current >= bankLimit) {
          checks.push({
            name: 'bank_size',
            passed: false,
            detail: `Section "${sec.name_ar}": ${current}/${bankLimit} (limit reached)`,
          });
          blocked = true;
          blockReason = blockReason || `Bank size limit reached for ${sec.name_ar}`;
        }
      }
      if (!checks.some((c) => c.name === 'bank_size' && !c.passed)) {
        checks.push({ name: 'bank_size', passed: true });
      }
    }

    // ─── 6. Context Preparation (sample existing questions) ────────
    let existingContext: any[] = [];
    if (!blocked && section_id) {
      const { data: existing } = await admin
        .from('questions')
        .select('text_ar, topic, difficulty')
        .eq('exam_template_id', exam_template_id)
        .eq('section_id', section_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30);

      existingContext = (existing ?? []).map((q) => ({
        text: q.text_ar?.substring(0, 80),
        topic: q.topic,
        difficulty: q.difficulty,
      }));
    }

    // ─── Log result ────────────────────────────────────────────────
    await admin.from('generation_guardian_logs').insert({
      exam_template_id,
      triggered_by: auth.triggeredBy,
      validation_results: { checks },
      status: blocked ? 'blocked' : 'allowed',
      reason_if_blocked: blocked ? blockReason : null,
      context_json: blocked ? null : { existing_sample_count: existingContext.length },
    });

    if (blocked) {
      console.warn(`[generation-guardian] ❌ BLOCKED exam=${exam_template_id} reason="${blockReason}"`);
      return json(
        {
          guardian_status: 'blocked',
          reason: blockReason,
          checks,
        },
        400
      );
    }

    console.log(`[generation-guardian] ✅ ALLOWED exam=${exam_template_id}`);
    return json({
      guardian_status: 'allowed',
      checks,
      existing_context: existingContext,
      bank_multiplier: multiplier,
    });
  } catch (e) {
    console.error('[generation-guardian] Error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
