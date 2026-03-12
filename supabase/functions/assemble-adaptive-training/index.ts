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
    const {
      exam_template_id,
      max_questions = DEFAULT_MAX_QUESTIONS,
      target_difficulty,
      target_section_id,
      time_limit_override_sec,
      recommendation_type,
    } = await req.json();

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

    // 3. Load student context in parallel
    const [skillMemoryRes, dnaRes, profileRes, cycleRes] = await Promise.all([
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
      // Get active (latest incomplete) cycle for this user+template
      admin
        .from("student_training_cycles")
        .select("*")
        .eq("user_id", user.id)
        .eq("exam_template_id", exam_template_id)
        .is("cycle_completed_at", null)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const skillMemory = (skillMemoryRes.data || []).map((s: any) => ({
      section_id: s.section_id,
      section_name: s.section_name || "",
      skill_score: Number(s.skill_score) || 50,
      total_answered: s.total_answered || 0,
    }));

    let previousAbility = 50;
    if (dnaRes.data) {
      const dna = dnaRes.data as any;
      const history = dna.history_json as any[] || [];
      if (history.length > 0) {
        const lastSnapshot = history[history.length - 1];
        previousAbility = lastSnapshot?.metrics?.accuracy || 50;
      } else {
        previousAbility = dna.confidence_score || 50;
      }
    }

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

    // 5. Cycle-based question tracking
    // Get the set of question IDs already used in the current cycle
    const activeCycle = cycleRes.data as any | null;
    const cycleUsedIds = new Set<string>(
      activeCycle ? (activeCycle.used_question_ids as string[] || []) : []
    );
    const currentCycleNumber = activeCycle ? activeCycle.cycle_number : 0;

    console.log(`[assemble-smart] Cycle #${currentCycleNumber}, used_in_cycle=${cycleUsedIds.size}`);

    // 6. Fetch full question pool (no recency exclusion - cycle handles reuse)
    const targetDifficulties: string[] = (target_difficulty && target_difficulty !== 'mixed')
      ? [target_difficulty]
      : ["easy", "medium", "hard"];

    const weakSectionIds = skillMemory
      .filter((s: any) => s.skill_score < 60)
      .map((s: any) => s.section_id);

    const allSectionIds = target_section_id
      ? [String(target_section_id)]
      : sections.map((s: any) => String(s.id));

    console.log(`[assemble-smart] target_difficulty=${target_difficulty || 'mixed'}, target_section_id=${target_section_id || 'all'}, recommendation_type=${recommendation_type || 'none'}`);

    async function fetchAllEligible(): Promise<any[]> {
      const p: any[] = [];
      const seen = new Set<string>();
      const shouldPrioritizeWeak = !target_section_id && weakSectionIds.length > 0;

      // Weak sections first
      if (shouldPrioritizeWeak) {
        for (const diff of targetDifficulties) {
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
              if (!seen.has(q.id)) { p.push(q); seen.add(q.id); }
            }
          }
        }
      }

      // All target sections
      for (const diff of targetDifficulties) {
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
            if (!seen.has(q.id)) { p.push(q); seen.add(q.id); }
          }
        }
      }
      return p;
    }

    const fullPool = await fetchAllEligible();
    console.log(`[assemble-smart] fullPool.length=${fullPool.length}`);

    if (fullPool.length < 5) {
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

    // 7. Cycle-based selection: prioritize unused questions in current cycle
    const unusedInCycle = fullPool.filter(q => !cycleUsedIds.has(q.id));
    let needNewCycle = false;

    let selectedPool: any[];
    if (unusedInCycle.length >= 5) {
      // Enough unused questions - pick from them
      selectedPool = shuffle(unusedInCycle);
      console.log(`[assemble-smart] Using ${unusedInCycle.length} unused questions from cycle #${currentCycleNumber}`);
    } else {
      // Pool exhausted - start new cycle with full pool reshuffled
      needNewCycle = true;
      selectedPool = shuffle([...fullPool]);
      console.log(`[assemble-smart] Cycle #${currentCycleNumber} exhausted (only ${unusedInCycle.length} unused). Starting new cycle.`);
    }

    // 8. Build section name map
    const sectionNameMap: Record<string, string> = {};
    for (const s of sections) {
      sectionNameMap[s.id] = s.name_ar;
    }

    // 9. Build answer keys and client pool
    const answerKeys: Record<string, { correct_option_id: string; explanation?: string }> = {};
    const clientPool = selectedPool.map((q: any) => {
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

    // 10. Build questions_json
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

    // 11. Create session
    const timeLimitSec = time_limit_override_sec
      ? Math.max(300, time_limit_override_sec)
      : Math.max(1200, max_questions * 90);

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

    // 12. Update cycle tracking
    const sessionQuestionIds = clientPool.map((q: any) => q.id);

    if (needNewCycle) {
      // Complete old cycle if exists
      if (activeCycle) {
        await admin
          .from("student_training_cycles")
          .update({ cycle_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", activeCycle.id);
      }
      // Create new cycle with these questions as first usage
      const newCycleNumber = currentCycleNumber + 1;
      await admin.from("student_training_cycles").insert({
        user_id: user.id,
        exam_template_id,
        cycle_number: newCycleNumber,
        used_question_ids: sessionQuestionIds,
        cycle_started_at: new Date().toISOString(),
      });
      console.log(`[assemble-smart] Created new cycle #${newCycleNumber} with ${sessionQuestionIds.length} questions`);
    } else if (activeCycle) {
      // Append to existing cycle
      const updatedUsed = [...cycleUsedIds, ...sessionQuestionIds];
      const uniqueUsed = [...new Set(updatedUsed)];
      await admin
        .from("student_training_cycles")
        .update({ used_question_ids: uniqueUsed, updated_at: new Date().toISOString() })
        .eq("id", activeCycle.id);
      console.log(`[assemble-smart] Updated cycle #${currentCycleNumber}: ${uniqueUsed.length} total used`);
    } else {
      // First ever cycle for this user+template
      await admin.from("student_training_cycles").insert({
        user_id: user.id,
        exam_template_id,
        cycle_number: 1,
        used_question_ids: sessionQuestionIds,
        cycle_started_at: new Date().toISOString(),
      });
      console.log(`[assemble-smart] Created first cycle #1 with ${sessionQuestionIds.length} questions`);
    }

    console.log(
      `[assemble-smart] Session ${session.id}: pool=${fullPool.length}, selected=${selectedPool.length}, max=${max_questions}, ` +
      `prevAbility=${previousAbility}, weakSections=${weakSectionIds.length}, newCycle=${needNewCycle}`
    );

    return new Response(
      JSON.stringify({
        session_id: session.id,
        question_pool: clientPool,
        answer_keys: answerKeys,
        max_questions,
        pool_size: clientPool.length,
        points_deducted: isDiamond ? 0 : pointsCost,
        time_limit_sec: timeLimitSec,
        applied_filters: {
          target_difficulty: target_difficulty || 'mixed',
          target_section_id: target_section_id || null,
          recommendation_type: recommendation_type || null,
        },
        cycle_info: {
          cycle_number: needNewCycle ? currentCycleNumber + 1 : (currentCycleNumber || 1),
          new_cycle_started: needNewCycle,
          unused_before_selection: unusedInCycle.length,
          total_pool: fullPool.length,
        },
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
