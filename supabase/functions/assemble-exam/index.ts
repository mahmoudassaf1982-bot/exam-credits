import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──
const PRACTICE_QUESTION_COUNT = 10;
const PRACTICE_WEAK_RATIO = 0.6;   // 60% from weak sections
const PRACTICE_MEDIUM_RATIO = 0.3; // 30% from medium sections
const PRACTICE_RANDOM_RATIO = 0.1; // 10% random review

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

interface SectionPerformance {
  sectionId: string;
  accuracy: number; // 0-100
  tier: "weak" | "medium" | "strong";
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

/** Build adaptive difficulty mix based on past accuracy */
function adaptiveDifficultyMix(accuracy: number): { easy: number; medium: number; hard: number } {
  if (accuracy >= 80) {
    // Strong: push harder
    return { easy: 10, medium: 30, hard: 60 };
  } else if (accuracy >= 60) {
    // Medium: balanced with slight challenge
    return { easy: 20, medium: 50, hard: 30 };
  } else if (accuracy >= 40) {
    // Weak: more easy/medium to build confidence
    return { easy: 40, medium: 40, hard: 20 };
  } else {
    // Very weak: mostly easy
    return { easy: 60, medium: 30, hard: 10 };
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Categorize sections into weak/medium/strong based on past scores */
function categorizeSections(
  sectionScores: Record<string, SectionScore>,
  validSections: Section[]
): SectionPerformance[] {
  const performances: SectionPerformance[] = [];

  for (const section of validSections) {
    const score = sectionScores[section.id];
    let accuracy = 50; // default if no data
    if (score && score.total > 0) {
      accuracy = Math.round((score.correct / score.total) * 100);
    }

    let tier: "weak" | "medium" | "strong";
    if (accuracy < 50) tier = "weak";
    else if (accuracy < 75) tier = "medium";
    else tier = "strong";

    performances.push({ sectionId: section.id, accuracy, tier });
  }

  return performances;
}

/** Count available approved questions for a section (with fallback pools) */
async function countAvailableQuestions(
  admin: ReturnType<typeof createClient>,
  sectionId: string,
  countryId: string,
  examTemplateId: string
): Promise<number> {
  const { count: sectionCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("section_id", sectionId);

  if ((sectionCount ?? 0) > 0) return sectionCount ?? 0;

  const { count: templateCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("exam_template_id", examTemplateId);

  if ((templateCount ?? 0) > 0) return templateCount ?? 0;

  const { count: countryCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId);

  return countryCount ?? 0;
}

/** Fetch questions for a single section with a specific difficulty mix and fallback */
async function fetchSectionQuestions(
  admin: ReturnType<typeof createClient>,
  section: Section,
  targetCount: number,
  template: { country_id: string; id: string },
  difficultyMixOverride: { easy: number; medium: number; hard: number } | null,
  excludeIds: string[] = []
) {
  const mix = difficultyMixOverride ?? section.difficulty_mix_json ?? { easy: 30, medium: 50, hard: 20 };
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

/** Distribute question count across sections in a tier, proportionally */
function distributeAcrossSections(sectionIds: string[], totalCount: number): Map<string, number> {
  const result = new Map<string, number>();
  if (sectionIds.length === 0 || totalCount <= 0) return result;

  const perSection = Math.floor(totalCount / sectionIds.length);
  let remainder = totalCount - perSection * sectionIds.length;

  for (const id of sectionIds) {
    result.set(id, perSection + (remainder-- > 0 ? 1 : 0));
  }
  return result;
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

    const typedSections = sections as Section[];

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

    // ══════════════════════════════════════════════════
    // BRANCH: PRACTICE (Smart Training) vs SIMULATION
    // ══════════════════════════════════════════════════

    const assembledQuestions: Record<string, unknown[]> = {};
    const answersKey: Record<string, Record<string, { correct_option_id: string; explanation?: string }>> = {};
    let totalQuestionCount = 0;
    let practiceMode: "diagnostic" | "adaptive" = "diagnostic";
    let isDiagnostic = false;
    let practiceMetadata: Record<string, unknown> = {};

    if (session_type === "practice") {
      // ─── SMART TRAINING: 10 questions, weakness-based distribution ───
      const totalPracticeQuestions = PRACTICE_QUESTION_COUNT;

      // Check for past performance data
      const { data: pastSessions } = await admin
        .from("exam_sessions")
        .select("score_json")
        .eq("user_id", user.id)
        .eq("exam_template_id", exam_template_id)
        .in("status", ["completed", "submitted"])
        .not("score_json", "is", null)
        .order("completed_at", { ascending: false })
        .limit(5); // Use last 5 sessions for better accuracy

      let sectionDistribution: Map<string, number>;
      let sectionDifficultyMap: Map<string, { easy: number; medium: number; hard: number }>;
      let activeSections: Section[];

      if (!pastSessions || pastSessions.length === 0) {
        // ── NO HISTORY: Diagnostic mode — equal distribution, default difficulty ──
        isDiagnostic = true;
        practiceMode = "diagnostic";
        activeSections = typedSections;

        sectionDistribution = distributeAcrossSections(
          typedSections.map((s) => s.id),
          totalPracticeQuestions
        );
        sectionDifficultyMap = new Map(
          typedSections.map((s) => [s.id, { easy: 30, medium: 50, hard: 20 }])
        );

        console.log(`[assemble-exam] Practice DIAGNOSTIC: ${totalPracticeQuestions} questions, equal across ${typedSections.length} sections`);
      } else {
        // ── HAS HISTORY: Adaptive mode — weighted by weakness ──
        practiceMode = "adaptive";

        // Aggregate scores across last N sessions
        const aggregatedScores: Record<string, { correct: number; total: number; name: string }> = {};
        for (const ps of pastSessions) {
          const scoreJson = ps.score_json as { section_scores?: Record<string, SectionScore> };
          if (!scoreJson?.section_scores) continue;
          for (const [sId, sc] of Object.entries(scoreJson.section_scores)) {
            if (!aggregatedScores[sId]) {
              aggregatedScores[sId] = { correct: 0, total: 0, name: sc.name };
            }
            aggregatedScores[sId].correct += sc.correct;
            aggregatedScores[sId].total += sc.total;
          }
        }

        // Categorize sections
        const performances = categorizeSections(aggregatedScores, typedSections);

        const weakSections = performances.filter((p) => p.tier === "weak");
        const mediumSections = performances.filter((p) => p.tier === "medium");
        const strongSections = performances.filter((p) => p.tier === "strong");

        // Calculate question counts per tier
        let weakCount = Math.round(totalPracticeQuestions * PRACTICE_WEAK_RATIO);
        let mediumCount = Math.round(totalPracticeQuestions * PRACTICE_MEDIUM_RATIO);
        let randomCount = totalPracticeQuestions - weakCount - mediumCount;

        // If no weak sections, redistribute to medium/random
        if (weakSections.length === 0) {
          mediumCount += weakCount;
          weakCount = 0;
        }
        // If no medium sections, redistribute to weak/random
        if (mediumSections.length === 0) {
          if (weakSections.length > 0) {
            weakCount += mediumCount;
          } else {
            randomCount += mediumCount;
          }
          mediumCount = 0;
        }

        // Distribute within tiers
        const weakDist = distributeAcrossSections(weakSections.map((s) => s.sectionId), weakCount);
        const medDist = distributeAcrossSections(mediumSections.map((s) => s.sectionId), mediumCount);
        // Random comes from all sections (including strong)
        const allSectionIds = typedSections.map((s) => s.id);
        const randomDist = distributeAcrossSections(allSectionIds, randomCount);

        // Merge distributions
        sectionDistribution = new Map<string, number>();
        for (const s of typedSections) {
          const total = (weakDist.get(s.id) ?? 0) + (medDist.get(s.id) ?? 0) + (randomDist.get(s.id) ?? 0);
          if (total > 0) sectionDistribution.set(s.id, total);
        }

        // Build adaptive difficulty per section
        sectionDifficultyMap = new Map();
        for (const perf of performances) {
          sectionDifficultyMap.set(perf.sectionId, adaptiveDifficultyMix(perf.accuracy));
        }

        activeSections = typedSections.filter((s) => (sectionDistribution.get(s.id) ?? 0) > 0);

        practiceMetadata = {
          section_performances: performances.map((p) => ({
            section_id: p.sectionId,
            section_name: typedSections.find((s) => s.id === p.sectionId)?.name_ar,
            accuracy: p.accuracy,
            tier: p.tier,
            questions_assigned: sectionDistribution.get(p.sectionId) ?? 0,
          })),
          distribution: { weak: weakCount, medium: mediumCount, random: randomCount },
        };

        console.log(`[assemble-exam] Practice ADAPTIVE: weak=${weakCount} (${weakSections.length} sections), medium=${mediumCount} (${mediumSections.length} sections), random=${randomCount}`);
      }

      // Fetch questions per section with adaptive difficulty
      const allUsedIds: string[] = [];
      for (const section of activeSections!) {
        const count = sectionDistribution!.get(section.id) ?? 0;
        if (count <= 0) continue;

        const diffMix = sectionDifficultyMap!.get(section.id) ?? null;

        const { questions, usedIds } = await fetchSectionQuestions(
          admin,
          section,
          count,
          { country_id: template.country_id, id: template.id },
          diffMix,
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

        console.log(`[assemble-exam] Practice section "${section.name_ar}": target=${count}, fetched=${strippedQuestions.length}, difficulty=${JSON.stringify(diffMix)}`);
      }

      // Validate we got enough questions total
      if (totalQuestionCount === 0) {
        // Refund
        if (!isDiamond && pointsCost > 0) {
          const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", user.id).single();
          if (wallet) {
            await admin.from("wallets").update({ balance: wallet.balance + pointsCost }).eq("user_id", user.id);
            await admin.from("transactions").insert({
              user_id: user.id, type: "credit", amount: pointsCost,
              reason: "refund_insufficient_questions",
              meta_json: { exam_template_id, session_type },
            });
          }
        }
        return new Response(
          JSON.stringify({ error: "لا توجد أسئلة كافية لبدء جلسة التدريب" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } else {
      // ─── SIMULATION MODE: strict blueprint ───
      // Validate each section has enough questions
      const insufficientSections: { name: string; required: number; available: number }[] = [];

      for (const section of typedSections) {
        const required = section.question_count;
        const available = await countAvailableQuestions(admin, section.id, template.country_id, template.id);
        if (available < required) {
          insufficientSections.push({ name: section.name_ar, required, available });
        }
      }

      if (insufficientSections.length > 0) {
        const details = insufficientSections
          .map((s) => `${s.name}: مطلوب ${s.required}، متوفر ${s.available}`)
          .join(" | ");

        console.error(`[assemble-exam] Insufficient questions: ${details}`);

        if (!isDiamond && pointsCost > 0) {
          const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", user.id).single();
          if (wallet) {
            await admin.from("wallets").update({ balance: wallet.balance + pointsCost }).eq("user_id", user.id);
            await admin.from("transactions").insert({
              user_id: user.id, type: "credit", amount: pointsCost,
              reason: "refund_insufficient_questions",
              meta_json: { exam_template_id, session_type, insufficient_sections: insufficientSections },
            });
          }
        }

        return new Response(
          JSON.stringify({ error: "عدد الأسئلة المتوفرة غير كافٍ لبعض الأقسام", details: insufficientSections, message: details }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch exact blueprint counts per section
      const allUsedIds: string[] = [];
      for (const section of typedSections) {
        const { questions, usedIds } = await fetchSectionQuestions(
          admin,
          section,
          section.question_count,
          { country_id: template.country_id, id: template.id },
          null, // use section's own difficulty mix
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

        console.log(`[assemble-exam] Simulation section "${section.name_ar}": required=${section.question_count}, fetched=${strippedQuestions.length}`);
      }
    }

    // ── Build question_order ──
    const questionOrder: string[] = [];
    const snapshotSections: Section[] = [];
    for (const section of typedSections) {
      const sqs = assembledQuestions[section.id] || [];
      if ((sqs as any[]).length === 0) continue;
      snapshotSections.push(section);
      for (const q of sqs as any[]) {
        questionOrder.push(q.id);
      }
    }

    // ── Build frozen snapshot ──
    const examSnapshot: Record<string, unknown> = {
      template: {
        id: template.id,
        name_ar: template.name_ar,
        slug: template.slug,
        country_id: template.country_id,
        default_time_limit_sec: template.default_time_limit_sec,
        default_question_count: template.default_question_count,
      },
      sections: snapshotSections.map((s) => ({
        id: s.id,
        name_ar: s.name_ar,
        order: s.order,
        question_count: (assembledQuestions[s.id] || []).length,
        time_limit_sec: s.time_limit_sec,
        difficulty_mix_json: s.difficulty_mix_json,
        topic_filter_json: s.topic_filter_json,
      })),
    };

    if (session_type === "practice") {
      examSnapshot.practice_mode = practiceMode;
      examSnapshot.is_diagnostic = isDiagnostic;
      examSnapshot.practice_metadata = practiceMetadata;
    }

    // ── Create session ──
    // Practice gets a shorter time limit (10 questions → ~10 min)
    const timeLimitSec = session_type === "practice"
      ? Math.max(600, totalQuestionCount * 60) // 1 min per question, min 10 min
      : template.default_time_limit_sec;

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
        time_limit_sec: timeLimitSec,
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
      .insert({ session_id: session.id, answers_key_json: answersKey });

    if (keyErr) console.error("Answer keys storage error:", keyErr);

    console.log(`[assemble-exam] Session ${session.id} created: ${totalQuestionCount} questions, type=${session_type}, mode=${session_type === "practice" ? practiceMode : "blueprint"}`);

    return new Response(
      JSON.stringify({
        session_id: session.id,
        total_questions: totalQuestionCount,
        sections_count: snapshotSections.length,
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
