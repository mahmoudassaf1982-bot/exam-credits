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

const POOL_SIZE_PER_DIFFICULTY = 25; // 25 easy + 25 medium + 25 hard = 75 pool

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
    const { exam_template_id, max_questions = 20 } = await req.json();

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

    // 3. Points cost
    const pointsCost = template.practice_cost_points || 5;
    const { data: profile } = await admin
      .from("profiles")
      .select("is_diamond")
      .eq("id", user.id)
      .single();
    const isDiamond = profile?.is_diamond ?? false;

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
        reason: "adaptive_training_session",
        meta_json: { exam_template_id, session_type: "adaptive_training" },
      });
    }

    // 4. Exclude recently used questions
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

    // 5. Fetch question pool grouped by difficulty (with answer keys!)
    // For adaptive training, we include correct_option_id so the client can check correctness in real-time
    const pool: {
      id: string;
      text_ar: string;
      options: unknown;
      difficulty: string;
      topic: string;
      section_id: string;
      correct_option_id: string;
      explanation: string | null;
    }[] = [];

    for (const diff of ["easy", "medium", "hard"]) {
      let query = admin
        .from("questions")
        .select("id, text_ar, options, difficulty, topic, section_id, correct_option_id, explanation")
        .eq("is_approved", true)
        .eq("country_id", template.country_id)
        .eq("difficulty", diff)
        .is("deleted_at", null);

      // Prefer exam-template specific questions
      query = query.eq("exam_template_id", String(exam_template_id));

      const { data } = await query.limit(POOL_SIZE_PER_DIFFICULTY);
      if (data) {
        for (const q of data) {
          if (!recentIds.has(q.id)) {
            pool.push(q as any);
          }
        }
      }
    }

    // Fallback: if pool is too small, fetch without template filter
    if (pool.length < max_questions) {
      const existingIds = new Set(pool.map(q => q.id));
      for (const diff of ["easy", "medium", "hard"]) {
        const { data } = await admin
          .from("questions")
          .select("id, text_ar, options, difficulty, topic, section_id, correct_option_id, explanation")
          .eq("is_approved", true)
          .eq("country_id", template.country_id)
          .eq("difficulty", diff)
          .is("deleted_at", null)
          .limit(POOL_SIZE_PER_DIFFICULTY);

        if (data) {
          for (const q of data) {
            if (!recentIds.has(q.id) && !existingIds.has(q.id)) {
              pool.push(q as any);
              existingIds.add(q.id);
            }
          }
        }
      }
    }

    if (pool.length < 5) {
      // Refund
      if (!isDiamond && pointsCost > 0) {
        const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", user.id).single();
        if (wallet) {
          await admin.from("wallets").update({ balance: wallet.balance + pointsCost }).eq("user_id", user.id);
          await admin.from("transactions").insert({
            user_id: user.id, type: "credit", amount: pointsCost,
            reason: "refund_insufficient_questions",
            meta_json: { exam_template_id, session_type: "adaptive_training" },
          });
        }
      }
      return new Response(
        JSON.stringify({ error: "لا توجد أسئلة كافية للتدريب التكيّفي" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Build section name map
    const sectionNameMap: Record<string, string> = {};
    for (const s of sections) {
      sectionNameMap[s.id] = s.name_ar;
    }

    // 7. Build answer keys and stripped pool for client
    const answerKeys: Record<string, { correct_option_id: string; explanation?: string }> = {};
    const clientPool = shuffle(pool).map((q) => {
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

    // 8. Build questions_json (grouped by a single virtual section for compatibility)
    const virtualSectionId = "adaptive";
    const questionsJson: Record<string, unknown[]> = {
      [virtualSectionId]: clientPool.map(q => ({
        id: q.id,
        text_ar: q.text_ar,
        options: q.options,
        difficulty: q.difficulty,
        topic: q.topic,
      })),
    };

    const answersKeyJson: Record<string, Record<string, { correct_option_id: string; explanation?: string }>> = {
      [virtualSectionId]: answerKeys,
    };

    // 9. Create session
    const timeLimitSec = Math.max(1200, max_questions * 90); // 1.5 min per question

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
        name_ar: "تدريب تكيّفي",
        order: 1,
        question_count: clientPool.length,
        time_limit_sec: timeLimitSec,
      }],
      practice_mode: "cat_adaptive",
      is_diagnostic: false,
    };

    const { data: session, error: sessionErr } = await admin
      .from("exam_sessions")
      .insert({
        user_id: user.id,
        exam_template_id,
        session_type: "adaptive_training",
        status: "not_started",
        exam_snapshot: examSnapshot,
        questions_json: questionsJson,
        answers_json: {},
        time_limit_sec: timeLimitSec,
        points_cost: isDiamond ? 0 : pointsCost,
        question_order: clientPool.map(q => q.id),
        order_locked: false, // CAT chooses order dynamically
      })
      .select("id")
      .single();

    if (sessionErr) {
      console.error("Session creation error:", sessionErr);
      return new Response(
        JSON.stringify({ error: "فشل في إنشاء جلسة التدريب التكيّفي" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store answer keys
    await admin.from("exam_answer_keys").insert({
      session_id: session.id,
      answers_key_json: answersKeyJson,
    });

    console.log(
      `[assemble-adaptive] Session ${session.id}: pool=${pool.length}, max=${max_questions}, ` +
      `easy=${pool.filter(q => q.difficulty === "easy").length}, ` +
      `medium=${pool.filter(q => q.difficulty === "medium").length}, ` +
      `hard=${pool.filter(q => q.difficulty === "hard").length}`
    );

    return new Response(
      JSON.stringify({
        session_id: session.id,
        question_pool: clientPool,
        answer_keys: answerKeys, // Client needs this for real-time CAT correctness
        max_questions: max_questions,
        pool_size: clientPool.length,
        points_deducted: isDiamond ? 0 : pointsCost,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Assemble adaptive training error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
