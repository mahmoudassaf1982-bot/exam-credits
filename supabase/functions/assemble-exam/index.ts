import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

interface Section {
  id: string;
  name_ar: string;
  order: number;
  question_count: number;
  time_limit_sec: number | null;
  difficulty_mix_json: { easy: number; medium: number; hard: number } | null;
  topic_filter_json: string[] | null;
  exam_template_id: string;
}

function computeDifficultyCounts(
  questionCount: number,
  mix: { easy: number; medium: number; hard: number }
) {
  const total = mix.easy + mix.medium + mix.hard;
  if (total <= 0) return { easy: questionCount, medium: 0, hard: 0 };
  const easy = Math.round((mix.easy / total) * questionCount);
  const hard = Math.round((mix.hard / total) * questionCount);
  const medium = questionCount - easy - hard;
  return { easy, medium, hard };
}

function autoWeightSections(sections: Section[], totalQuestions: number): Map<string, number> {
  const sectionWeights = new Map<string, number>();
  const declaredTotal = sections.reduce((s, sec) => s + sec.question_count, 0);

  if (declaredTotal <= 0) {
    // Equal distribution
    const perSection = Math.floor(totalQuestions / sections.length);
    let remainder = totalQuestions - perSection * sections.length;
    for (const sec of sections) {
      sectionWeights.set(sec.id, perSection + (remainder-- > 0 ? 1 : 0));
    }
  } else {
    // Proportional distribution based on each section's declared question_count
    let assigned = 0;
    for (let i = 0; i < sections.length; i++) {
      if (i === sections.length - 1) {
        sectionWeights.set(sections[i].id, totalQuestions - assigned);
      } else {
        const count = Math.round((sections[i].question_count / declaredTotal) * totalQuestions);
        sectionWeights.set(sections[i].id, count);
        assigned += count;
      }
    }
  }
  return sectionWeights;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Main Handler ──

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
    const { exam_template_id, session_type } = await req.json();

    if (!exam_template_id || !session_type) {
      return new Response(
        JSON.stringify({ error: "exam_template_id و session_type مطلوبان" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Fetch template ──
    const { data: template, error: tErr } = await admin
      .from("exam_templates")
      .select("*")
      .eq("id", exam_template_id)
      .eq("is_active", true)
      .single();

    if (tErr || !template) {
      return new Response(
        JSON.stringify({ error: "قالب الاختبار غير موجود أو غير مفعّل" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Fetch sections (the STRUCTURE that drives everything) ──
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

    // ── 3. Points cost & deduction ──
    let pointsCost = 0;
    if (session_type === "simulation") pointsCost = template.simulation_cost_points;
    else if (session_type === "practice") pointsCost = template.practice_cost_points;
    else if (session_type === "analysis") pointsCost = template.analysis_cost_points;

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
          JSON.stringify({
            error: "رصيد النقاط غير كافٍ",
            required: pointsCost,
            current: wallet?.balance ?? 0,
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await admin
        .from("wallets")
        .update({ balance: wallet.balance - pointsCost })
        .eq("user_id", user.id);

      await admin.from("transactions").insert({
        user_id: user.id,
        type: "debit",
        amount: pointsCost,
        reason:
          session_type === "simulation"
            ? "exam_attempt_session"
            : session_type === "practice"
            ? "practice_session"
            : "exam_analysis",
        meta_json: { exam_template_id, session_type },
      });
    }

    // ── 4. Structure-driven question assembly ──
    const totalQuestions = template.default_question_count;
    const weightedCounts = autoWeightSections(sections as Section[], totalQuestions);

    const assembledQuestions: Record<string, unknown[]> = {};
    let totalQuestionCount = 0;

    for (const section of sections as Section[]) {
      const sectionTargetCount = weightedCounts.get(section.id) ?? section.question_count;
      const mix = section.difficulty_mix_json ?? { easy: 30, medium: 50, hard: 20 };
      const { easy, medium, hard } = computeDifficultyCounts(sectionTargetCount, mix);
      const topicFilters = section.topic_filter_json ?? [];

      const difficulties = [
        { level: "easy", count: easy },
        { level: "medium", count: medium },
        { level: "hard", count: hard },
      ];

      const sectionQuestions: unknown[] = [];

      for (const { level, count } of difficulties) {
        if (count <= 0) continue;

        // Priority 1: questions linked to this exact section
        let baseQuery = admin
          .from("questions")
          .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
          .eq("is_approved", true)
          .eq("country_id", template.country_id)
          .eq("difficulty", level);

        if (topicFilters.length > 0) {
          baseQuery = baseQuery.in("topic", topicFilters);
        }

        // Try section-specific questions first
        const { data: sectionSpecific } = await baseQuery
          .eq("section_id", section.id)
          .limit(count);

        if (sectionSpecific && sectionSpecific.length >= count) {
          sectionQuestions.push(...shuffle(sectionSpecific));
          continue;
        }

        const found = sectionSpecific ?? [];
        const remaining = count - found.length;
        sectionQuestions.push(...found);

        // Priority 2: questions linked to this exam template but no specific section
        if (remaining > 0) {
          let fallbackQuery = admin
            .from("questions")
            .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
            .eq("is_approved", true)
            .eq("country_id", template.country_id)
            .eq("difficulty", level)
            .eq("exam_template_id", exam_template_id)
            .is("section_id", null);

          if (topicFilters.length > 0) {
            fallbackQuery = fallbackQuery.in("topic", topicFilters);
          }

          // Exclude already selected IDs
          const usedIds = found.map((q: any) => q.id);
          if (usedIds.length > 0) {
            fallbackQuery = fallbackQuery.not("id", "in", `(${usedIds.join(",")})`);
          }

          const { data: templateQuestions } = await fallbackQuery.limit(remaining);
          if (templateQuestions) {
            sectionQuestions.push(...templateQuestions);
          }

          // Priority 3: any matching questions from the country pool
          const still = remaining - (templateQuestions?.length ?? 0);
          if (still > 0) {
            const allUsed = [...usedIds, ...(templateQuestions ?? []).map((q: any) => q.id)];
            let poolQuery = admin
              .from("questions")
              .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
              .eq("is_approved", true)
              .eq("country_id", template.country_id)
              .eq("difficulty", level);

            if (topicFilters.length > 0) {
              poolQuery = poolQuery.in("topic", topicFilters);
            }
            if (allUsed.length > 0) {
              poolQuery = poolQuery.not("id", "in", `(${allUsed.join(",")})`);
            }

            const { data: poolQuestions } = await poolQuery.limit(still);
            if (poolQuestions) {
              sectionQuestions.push(...poolQuestions);
            }
          }
        }
      }

      assembledQuestions[section.id] = shuffle(sectionQuestions);
      totalQuestionCount += sectionQuestions.length;
    }

    // ── 5. Build frozen snapshot ──
    const examSnapshot = {
      template: {
        id: template.id,
        name_ar: template.name_ar,
        slug: template.slug,
        country_id: template.country_id,
        default_time_limit_sec: template.default_time_limit_sec,
        default_question_count: template.default_question_count,
      },
      sections: (sections as Section[]).map((s) => ({
        id: s.id,
        name_ar: s.name_ar,
        order: s.order,
        question_count: weightedCounts.get(s.id) ?? s.question_count,
        time_limit_sec: s.time_limit_sec,
        difficulty_mix_json: s.difficulty_mix_json,
        topic_filter_json: s.topic_filter_json,
      })),
    };

    // ── 6. Create session ──
    const { data: session, error: sessionErr } = await admin
      .from("exam_sessions")
      .insert({
        user_id: user.id,
        exam_template_id,
        session_type,
        status: "in_progress",
        exam_snapshot: examSnapshot,
        questions_json: assembledQuestions,
        answers_json: {},
        time_limit_sec: template.default_time_limit_sec,
        points_cost: isDiamond ? 0 : pointsCost,
      })
      .select("id")
      .single();

    if (sessionErr) {
      console.error("Session creation error:", sessionErr);
      return new Response(
        JSON.stringify({ error: "فشل في إنشاء جلسة الاختبار", details: sessionErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        session_id: session.id,
        total_questions: totalQuestionCount,
        sections_count: sections.length,
        points_deducted: isDiamond ? 0 : pointsCost,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Assemble exam error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
