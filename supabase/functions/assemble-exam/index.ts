import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ──

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

interface SectionScore {
  correct: number;
  total: number;
  name: string;
}

// ── Helpers ──

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
    const perSection = Math.floor(totalQuestions / sections.length);
    let remainder = totalQuestions - perSection * sections.length;
    for (const sec of sections) {
      sectionWeights.set(sec.id, perSection + (remainder-- > 0 ? 1 : 0));
    }
  } else {
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

/** Count available approved questions for a section */
async function countSectionQuestions(
  admin: ReturnType<typeof createClient>,
  sectionId: string,
  countryId: string
): Promise<number> {
  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("section_id", sectionId);
  return count ?? 0;
}

/** Find the weakest section from past session scores */
function findWeakestSectionId(
  sectionScores: Record<string, SectionScore>,
  validSectionIds: Set<string>
): string | null {
  let weakestId: string | null = null;
  let weakestPct = Infinity;

  for (const [sId, score] of Object.entries(sectionScores)) {
    if (!validSectionIds.has(sId)) continue;
    const pct = score.total > 0 ? score.correct / score.total : 0;
    if (pct < weakestPct) {
      weakestPct = pct;
      weakestId = sId;
    }
  }
  return weakestId;
}

/** Fetch questions for a single section with difficulty mix and fallback */
async function fetchSectionQuestions(
  admin: ReturnType<typeof createClient>,
  section: Section,
  targetCount: number,
  template: { country_id: string; id: string },
  excludeIds: string[] = []
) {
  const mix = section.difficulty_mix_json ?? { easy: 30, medium: 50, hard: 20 };
  const { easy, medium, hard } = computeDifficultyCounts(targetCount, mix);
  const topicFilters = section.topic_filter_json ?? [];

  const difficulties = [
    { level: "easy", count: easy },
    { level: "medium", count: medium },
    { level: "hard", count: hard },
  ];

  const questions: unknown[] = [];
  const usedIds = new Set(excludeIds);

  for (const { level, count } of difficulties) {
    if (count <= 0) continue;

    // Priority 1: section-specific questions
    let baseQuery = admin
      .from("questions")
      .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
      .eq("is_approved", true)
      .eq("country_id", template.country_id)
      .eq("difficulty", level);

    if (topicFilters.length > 0) baseQuery = baseQuery.in("topic", topicFilters);

    const { data: sectionSpecific } = await baseQuery
      .eq("section_id", section.id)
      .not("id", "in", usedIds.size > 0 ? `(${[...usedIds].join(",")})` : "(00000000-0000-0000-0000-000000000000)")
      .limit(count);

    if (sectionSpecific) {
      sectionSpecific.forEach((q: any) => usedIds.add(q.id));
      questions.push(...sectionSpecific);
    }

    const remaining = count - (sectionSpecific?.length ?? 0);
    if (remaining <= 0) continue;

    // Priority 2: template-level questions
    let fallbackQuery = admin
      .from("questions")
      .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
      .eq("is_approved", true)
      .eq("country_id", template.country_id)
      .eq("difficulty", level)
      .eq("exam_template_id", template.id)
      .is("section_id", null);

    if (topicFilters.length > 0) fallbackQuery = fallbackQuery.in("topic", topicFilters);
    if (usedIds.size > 0) fallbackQuery = fallbackQuery.not("id", "in", `(${[...usedIds].join(",")})`);

    const { data: templateQuestions } = await fallbackQuery.limit(remaining);
    if (templateQuestions) {
      templateQuestions.forEach((q: any) => usedIds.add(q.id));
      questions.push(...templateQuestions);
    }

    // Priority 3: country pool
    const still = remaining - (templateQuestions?.length ?? 0);
    if (still > 0) {
      let poolQuery = admin
        .from("questions")
        .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
        .eq("is_approved", true)
        .eq("country_id", template.country_id)
        .eq("difficulty", level);

      if (topicFilters.length > 0) poolQuery = poolQuery.in("topic", topicFilters);
      if (usedIds.size > 0) poolQuery = poolQuery.not("id", "in", `(${[...usedIds].join(",")})`);

      const { data: poolQuestions } = await poolQuery.limit(still);
      if (poolQuestions) {
        poolQuestions.forEach((q: any) => usedIds.add(q.id));
        questions.push(...poolQuestions);
      }
    }
  }

  return { questions, usedIds: [...usedIds] };
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
    const body = await req.json();
    const { exam_template_id, session_type } = body;

    // ── Tamper detection ──
    const tamperKeys = ["seed", "shuffle", "order", "question_order", "sort"];
    const detectedTamper = tamperKeys.filter((k) => k in body);
    if (detectedTamper.length > 0) {
      console.warn(`Order tamper attempt by ${user.id}: ${detectedTamper.join(", ")}`);
      await admin.from("sync_audit_log").insert({
        exam_template_id: exam_template_id || "unknown",
        action: "order_tamper_attempt",
        performed_by: user.id,
        details: { detected_keys: detectedTamper, session_type },
      }).then(() => {});
    }

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

    // ── 2. Fetch sections ──
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

    // ── 4. Adaptive practice logic ──
    let isDiagnostic = false;
    let targetSectionId: string | null = null;
    let practiceMode: "diagnostic" | "weakest" | "mixed" = "diagnostic";

    if (session_type === "practice") {
      // Check for previous completed sessions with scores
      const { data: pastSessions } = await admin
        .from("exam_sessions")
        .select("score_json")
        .eq("user_id", user.id)
        .eq("exam_template_id", exam_template_id)
        .in("status", ["completed", "submitted"])
        .not("score_json", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1);

      if (!pastSessions || pastSessions.length === 0) {
        // First time → Diagnostic session
        isDiagnostic = true;
        practiceMode = "diagnostic";
        console.log(`[assemble-exam] Diagnostic mode for user ${user.id}`);
      } else {
        // Returning user → find weakest section
        const lastScore = pastSessions[0].score_json as {
          section_scores?: Record<string, SectionScore>;
        };

        if (lastScore?.section_scores) {
          const validSectionIds = new Set((sections as Section[]).map((s) => s.id));
          const weakestId = findWeakestSectionId(lastScore.section_scores, validSectionIds);

          if (weakestId) {
            // Verify the section has available questions
            const qCount = await countSectionQuestions(admin, weakestId, template.country_id);
            if (qCount > 0) {
              targetSectionId = weakestId;
              practiceMode = "weakest";
              console.log(`[assemble-exam] Weakest section: ${weakestId} (${qCount} questions available)`);
            } else {
              console.log(`[assemble-exam] Weakest section ${weakestId} is empty, falling back to mixed`);
              practiceMode = "mixed";
            }
          } else {
            practiceMode = "mixed";
          }
        } else {
          // Score exists but no section breakdown → diagnostic
          isDiagnostic = true;
          practiceMode = "diagnostic";
        }
      }
    }

    // ── 5. Structure-driven question assembly ──
    const totalQuestions = template.default_question_count;
    const assembledQuestions: Record<string, unknown[]> = {};
    const answersKey: Record<string, Record<string, { correct_option_id: string; explanation?: string }>> = {};
    let totalQuestionCount = 0;

    if (session_type === "practice" && practiceMode === "weakest" && targetSectionId) {
      // ── WEAKEST SECTION MODE: generate all questions from the weakest section ──
      const targetSection = (sections as Section[]).find((s) => s.id === targetSectionId)!;
      const { questions } = await fetchSectionQuestions(
        admin,
        targetSection,
        totalQuestions,
        { country_id: template.country_id, id: template.id }
      );

      const sectionAnswerKeys: Record<string, { correct_option_id: string; explanation?: string }> = {};
      const strippedQuestions = questions.map((q: any) => {
        sectionAnswerKeys[q.id] = {
          correct_option_id: q.correct_option_id,
          explanation: q.explanation || undefined,
        };
        let parsedOptions = q.options;
        if (typeof parsedOptions === "string") {
          try { parsedOptions = JSON.parse(parsedOptions); } catch { parsedOptions = []; }
        }
        return { id: q.id, text_ar: q.text_ar, options: parsedOptions, difficulty: q.difficulty, topic: q.topic };
      });

      assembledQuestions[targetSection.id] = shuffle(strippedQuestions);
      answersKey[targetSection.id] = sectionAnswerKeys;
      totalQuestionCount = strippedQuestions.length;

    } else {
      // ── DIAGNOSTIC / MIXED / SIMULATION MODE: distribute across all sections ──
      const weightedCounts = autoWeightSections(sections as Section[], totalQuestions);
      const allUsedIds: string[] = [];

      for (const section of sections as Section[]) {
        const sectionTargetCount = weightedCounts.get(section.id) ?? section.question_count;
        const { questions, usedIds } = await fetchSectionQuestions(
          admin,
          section,
          sectionTargetCount,
          { country_id: template.country_id, id: template.id },
          allUsedIds
        );
        allUsedIds.push(...usedIds);

        const sectionAnswerKeys: Record<string, { correct_option_id: string; explanation?: string }> = {};
        const strippedQuestions = questions.map((q: any) => {
          sectionAnswerKeys[q.id] = {
            correct_option_id: q.correct_option_id,
            explanation: q.explanation || undefined,
          };
          let parsedOptions = q.options;
          if (typeof parsedOptions === "string") {
            try { parsedOptions = JSON.parse(parsedOptions); } catch { parsedOptions = []; }
          }
          return { id: q.id, text_ar: q.text_ar, options: parsedOptions, difficulty: q.difficulty, topic: q.topic };
        });

        assembledQuestions[section.id] = shuffle(strippedQuestions);
        answersKey[section.id] = sectionAnswerKeys;
        totalQuestionCount += strippedQuestions.length;
      }
    }

    // ── 6. Build question_order ──
    const questionOrder: string[] = [];
    for (const section of sections as Section[]) {
      const sqs = assembledQuestions[section.id] || [];
      for (const q of sqs as any[]) {
        questionOrder.push(q.id);
      }
    }

    // ── 7. Build frozen snapshot ──
    const weightedCounts = autoWeightSections(sections as Section[], totalQuestions);
    const activeSections = (session_type === "practice" && practiceMode === "weakest" && targetSectionId)
      ? (sections as Section[]).filter((s) => s.id === targetSectionId)
      : (sections as Section[]);

    const examSnapshot = {
      template: {
        id: template.id,
        name_ar: template.name_ar,
        slug: template.slug,
        country_id: template.country_id,
        default_time_limit_sec: template.default_time_limit_sec,
        default_question_count: template.default_question_count,
      },
      sections: activeSections.map((s) => ({
        id: s.id,
        name_ar: s.name_ar,
        order: s.order,
        question_count: (assembledQuestions[s.id] || []).length,
        time_limit_sec: s.time_limit_sec,
        difficulty_mix_json: s.difficulty_mix_json,
        topic_filter_json: s.topic_filter_json,
      })),
      // Practice metadata
      practice_mode: session_type === "practice" ? practiceMode : undefined,
      is_diagnostic: session_type === "practice" ? isDiagnostic : undefined,
      target_section_id: targetSectionId || undefined,
      target_section_name: targetSectionId
        ? (sections as Section[]).find((s) => s.id === targetSectionId)?.name_ar
        : undefined,
    };

    // ── 8. Create session ──
    const { data: session, error: sessionErr } = await admin
      .from("exam_sessions")
      .insert({
        user_id: user.id,
        exam_template_id,
        session_type,
        status: "not_started",
        exam_snapshot: examSnapshot,
        questions_json: assembledQuestions,
        answers_json: {},
        time_limit_sec: template.default_time_limit_sec,
        points_cost: isDiamond ? 0 : pointsCost,
        question_order: questionOrder,
        order_locked: true,
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

    // Store answer keys
    const { error: keyErr } = await admin
      .from("exam_answer_keys")
      .insert({
        session_id: session.id,
        answers_key_json: answersKey,
      });

    if (keyErr) {
      console.error("Answer keys storage error:", keyErr);
    }

    return new Response(
      JSON.stringify({
        session_id: session.id,
        total_questions: totalQuestionCount,
        sections_count: activeSections.length,
        points_deducted: isDiamond ? 0 : pointsCost,
        practice_mode: session_type === "practice" ? practiceMode : undefined,
        is_diagnostic: session_type === "practice" ? isDiagnostic : undefined,
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
