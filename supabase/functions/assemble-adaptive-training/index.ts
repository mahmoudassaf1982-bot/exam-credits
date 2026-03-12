import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const POOL_SIZE_PER_DIFFICULTY = 100;
const DEFAULT_MAX_QUESTIONS = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { exam_template_id, max_questions = DEFAULT_MAX_QUESTIONS } = await req.json();

    if (!exam_template_id) {
      return new Response(
        JSON.stringify({ error: "exam_template_id مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch template
    const { data: template, error: tErr } = await admin
      .from("exam_templates")
      .select("*")
      .eq("id", exam_template_id)
      .eq("is_active", true)
      .single();

    if (tErr || !template) {
      return new Response(
        JSON.stringify({ error: "قالب الاختبار غير موجود" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch sections
    const { data: sections } = await admin
      .from("exam_sections")
      .select("*")
      .eq("exam_template_id", exam_template_id)
      .order("order", { ascending: true });

    if (!sections || sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "لا توجد أقسام لهذا الاختبار" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Load student context in parallel: skill_memory, learning_dna, profile
    const [skillMemoryRes, dnaRes, profileRes] = await Promise.all([
      admin
        .from("skill_memory")
        .select("section_id, section_name, skill_score, total_answered")
        .eq("user_id", user.id)
        .eq("exam_template_id", exam_template_id),
      admin
        .from("student_learning_dna")
        .select("confidence_score, history_json")
        .eq("student_id", user.id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("is_diamond")
        .eq("id", user.id)
        .single(),
    ]);

    const skillMemory = (skillMemoryRes.data || []).map((s: any) => ({
      section_id: s.section_id,
      section_name: s.section_name || "",
      skill_score: Number(s.skill_score) || 50,
      total_answered: s.total_answered || 0,
    }));

    // Extract previous ability from DNA history
    let previousAbility = 50;
    if (dnaRes.data) {
      const dna = dnaRes.data as any;
      const history = dna.history_json as any[] || [];
      if (history.length > 0) {
        const lastSnapshot = history[history.length - 1];
        // Estimate ability from accuracy
        previousAbility = lastSnapshot?.metrics?.accuracy || 50;
      } else {
        previousAbility = dna.confidence_score || 50;
      }
    }

    // Exam DNA distribution from template
    const examDNA = {
      easy_pct: template.target_easy_pct || 30,
      medium_pct: template.target_medium_pct || 50,
      hard_pct: template.target_hard_pct || 20,
    };

    // 4. Points cost
    const pointsCost = template.practice_cost_points || 5;
    const isDiamond = profileRes.data?.is_diamond ?? false;

    if (!isDiamond && pointsCost > 0) {
      const { data: wallet } = await admin
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (!wallet || wallet.balance < pointsCost) {
        return new Response(
          JSON.stringify({ error: "رصيد النقاط غير كافٍ", required: pointsCost, current: wallet?.balance ?? 0 }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await admin.from("wallets").update({ balance: wallet.balance - pointsCost }).eq("user_id", user.id);
      await admin.from("transactions").insert({
        user_id: user.id,
        type: "debit",
        amount: pointsCost,
        reason: "smart_training_session",
        meta_json: { exam_template_id, session_type: "smart_training" },
      });
    }

    // 5. Exclude recently used questions
    const { data: recentSessions } = await admin
      .from("exam_sessions")
      .select("questions_json")
      .eq("user_id", user.id)
      .eq("exam_template_id", exam_template_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentIds = new Set<string>();
    if (recentSessions) {
      for (const s of recentSessions) {
        const qJson = s.questions_json as Record<string, { id: string }[]> | null;
        if (qJson && typeof qJson === "object") {
          for (const sectionQs of Object.values(qJson)) {
            if (Array.isArray(sectionQs)) {
              for (const q of sectionQs) {
                if (q?.id) recentIds.add(q.id);
              }
            }
          }
        }
      }
    }

    // 6. Fetch question pool - prioritize weak sections
    const weakSectionIds = skillMemory
      .filter((s: any) => s.skill_score < 60)
      .map((s: any) => s.section_id);

    const pool: any[] = [];
    const existingIds = new Set<string>();

    // First: fetch from weak sections (higher pool)
    if (weakSectionIds.length > 0) {
      for (const diff of ["easy", "medium", "hard"]) {
        const { data } = await admin
          .from("questions")
          .select("id, text_ar, options, difficulty, topic, section_id, correct_option_id, explanation")
          .eq("is_approved", true)
          .eq("status", "approved")
          .eq("country_id", template.country_id)
          .eq("difficulty", diff)
          .eq("exam_template_id", String(exam_template_id))
          .in("section_id", weakSectionIds.map(String))
          .is("deleted_at", null)
          .limit(POOL_SIZE_PER_DIFFICULTY);

        if (data) {
          for (const q of data) {
            if (!recentIds.has(q.id) && !existingIds.has(q.id)) {
              pool.push(q);
              existingIds.add(q.id);
            }
          }
        }
      }
    }

    // Then: fill from all sections (must have a valid section_id)
    const allSectionIds = sections.map((s: any) => String(s.id));
    console.log(`[assemble-smart] template=${exam_template_id}, country=${template.country_id}, sections=${JSON.stringify(allSectionIds)}`);
    
    for (const diff of ["easy", "medium", "hard"]) {
      const { data, error: qErr } = await admin
        .from("questions")
        .select("id, text_ar, options, difficulty, topic, section_id, correct_option_id, explanation")
        .eq("is_approved", true)
        .eq("status", "approved")
        .eq("country_id", template.country_id)
        .eq("difficulty", diff)
        .eq("exam_template_id", String(exam_template_id))
        .in("section_id", allSectionIds)
        .is("deleted_at", null)
        .limit(POOL_SIZE_PER_DIFFICULTY);

      console.log(`[assemble-smart] diff=${diff}: found=${data?.length ?? 0}, err=${qErr?.message || 'none'}`);

      if (data) {
        for (const q of data) {
          if (!recentIds.has(q.id) && !existingIds.has(q.id)) {
            pool.push(q);
            existingIds.add(q.id);
          }
        }
      }
    }

    // NOTE: No fallback without exam_template_id filter.
    // All questions MUST belong to the correct exam template to prevent
    // cross-subject contamination (e.g. verbal questions in math training).
    // Orphan questions (exam_template_id IS NULL) are never served.
    console.log(`[assemble-smart] pool.length=${pool.length}, recentIds.size=${recentIds.size}, existingIds.size=${existingIds.size}`);

    if (pool.length < 5) {
      // Refund
      if (!isDiamond && pointsCost > 0) {
        const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", user.id).single();
        if (wallet) {
          await admin.from("wallets").update({ balance: wallet.balance + pointsCost }).eq("user_id", user.id);
          await admin.from("transactions").insert({
            user_id: user.id, type: "credit", amount: pointsCost,
            reason: "refund_insufficient_questions",
            meta_json: { exam_template_id, session_type: "smart_training" },
          });
        }
      }
      return new Response(
        JSON.stringify({ error: "لا توجد أسئلة كافية للتدريب الذكي" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Build section name map
    const sectionNameMap: Record<string, string> = {};
    for (const s of sections) {
      sectionNameMap[s.id] = s.name_ar;
    }

    // 8. Build answer keys and client pool
    const answerKeys: Record<string, { correct_option_id: string; explanation?: string }> = {};
    const clientPool = shuffle(pool).map((q: any) => {
      answerKeys[q.id] = {
        correct_option_id: q.correct_option_id,
        explanation: q.explanation || undefined,
      };

      let parsedOptions = q.options;
      if (typeof parsedOptions === "string") {
        try { parsedOptions = JSON.parse(parsedOptions); } catch { parsedOptions = []; }
      }

      return {
        id: q.id,
        text_ar: q.text_ar,
        options: parsedOptions,
        difficulty: q.difficulty,
        topic: q.topic,
        sectionId: q.section_id || sections[0].id,
        sectionName: sectionNameMap[q.section_id] || sections[0].name_ar,
      };
    });

    // 9. Build questions_json
    const virtualSectionId = "smart_training";
    const questionsJson: Record<string, unknown[]> = {
      [virtualSectionId]: clientPool.map(q => ({
        id: q.id,
        text_ar: q.text_ar,
        options: q.options,
        difficulty: q.difficulty,
        topic: q.topic,
      })),
    };

    const answersKeyJson = {
      [virtualSectionId]: answerKeys,
    };

    // 10. Create session
    const timeLimitSec = Math.max(1200, max_questions * 90);

    const examSnapshot = {
      template: {
        id: template.id,
        name_ar: template.name_ar,
        slug: template.slug,
        country_id: template.country_id,
        default_time_limit_sec: template.default_time_limit_sec,
      },
      sections: [{
        id: virtualSectionId,
        name_ar: "جلسة التدريب الذكي",
        order: 1,
        question_count: clientPool.length,
        time_limit_sec: timeLimitSec,
      }],
      practice_mode: "smart_training",
      is_diagnostic: false,
    };

    const { data: session, error: sessionErr } = await admin
      .from("exam_sessions")
      .insert({
        user_id: user.id,
        exam_template_id,
        session_type: "smart_training",
        status: "not_started",
        exam_snapshot: examSnapshot,
        questions_json: questionsJson,
        answers_json: {},
        time_limit_sec: timeLimitSec,
        points_cost: isDiamond ? 0 : pointsCost,
        question_order: clientPool.map(q => q.id),
        order_locked: false,
      })
      .select("id")
      .single();

    if (sessionErr) {
      console.error("Session creation error:", sessionErr);
      return new Response(
        JSON.stringify({ error: "فشل في إنشاء جلسة التدريب الذكي" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store answer keys
    await admin.from("exam_answer_keys").insert({
      session_id: session.id,
      answers_key_json: answersKeyJson,
    });

    console.log(
      `[assemble-smart] Session ${session.id}: pool=${pool.length}, max=${max_questions}, ` +
      `prevAbility=${previousAbility}, weakSections=${weakSectionIds.length}, ` +
      `easy=${pool.filter((q: any) => q.difficulty === "easy").length}, ` +
      `medium=${pool.filter((q: any) => q.difficulty === "medium").length}, ` +
      `hard=${pool.filter((q: any) => q.difficulty === "hard").length}`
    );

    return new Response(
      JSON.stringify({
        session_id: session.id,
        question_pool: clientPool,
        answer_keys: answerKeys,
        max_questions,
        pool_size: clientPool.length,
        points_deducted: isDiamond ? 0 : pointsCost,
        // Smart training context for the client engine
        skill_memory: skillMemory,
        exam_dna: examDNA,
        previous_ability: previousAbility,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Assemble smart training error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
