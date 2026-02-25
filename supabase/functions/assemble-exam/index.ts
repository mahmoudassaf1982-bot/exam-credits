import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ──
const PRACTICE_QUESTION_COUNT = 10;
const PRACTICE_WEAK_RATIO = 0.70;   // 70% from weak sections (was 60%)
const PRACTICE_MEDIUM_RATIO = 0.0;  // absorbed into blueprint coverage
const PRACTICE_RANDOM_RATIO = 0.0;  // absorbed into blueprint coverage
const PRACTICE_BLUEPRINT_RATIO = 0.30; // 30% blueprint coverage for exam balance
const SIMULATION_FLEX_RATIO = 0.10; // 10% flexibility if shortage exists

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
  examTemplateId: string,
  language: string = "ar"
): Promise<number> {
  const { count: sectionCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("language", language)
    .eq("section_id", sectionId);

  if ((sectionCount ?? 0) > 0) return sectionCount ?? 0;

  const { count: templateCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("language", language)
    .eq("exam_template_id", String(examTemplateId));

  if ((templateCount ?? 0) > 0) return templateCount ?? 0;

  const { count: countryCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", countryId)
    .eq("language", language);

  return countryCount ?? 0;
}

/** Fetch questions for a single section with difficulty mix and 3-tier fallback.
 *  Strategy: fetch IDs first (lightweight), pick by difficulty, then hydrate full data.
 *  Note: topic_filter_json is intentionally skipped because questions are already
 *  assigned to sections via section_id and topic names may not exactly match filters. */
async function fetchSectionQuestions(
  admin: ReturnType<typeof createClient>,
  section: Section,
  targetCount: number,
  template: { country_id: string; id: string },
  difficultyMixOverride: { easy: number; medium: number; hard: number } | null,
  excludeIds: string[] = [],
  language: string = "ar"
) {
  const mix = difficultyMixOverride ?? section.difficulty_mix_json ?? { easy: 30, medium: 50, hard: 20 };
  const { easy: wantEasy, medium: wantMedium, hard: wantHard } = computeDifficultyCounts(targetCount, mix);
  const templateIdStr = String(template.id);

  const usedIds = new Set(excludeIds);

  // Fetch lightweight ID+difficulty list from a pool tier
  async function fetchIdPool(opts: { sectionId?: string; examTemplateId?: string; nullSection?: boolean }): Promise<{ id: string; difficulty: string }[]> {
    let q = admin
      .from("questions")
      .select("id, difficulty")
      .eq("is_approved", true)
      .eq("country_id", template.country_id)
      .eq("language", language);

    if (opts.sectionId) q = q.eq("section_id", opts.sectionId);
    if (opts.examTemplateId) q = q.eq("exam_template_id", opts.examTemplateId);
    if (opts.nullSection) q = q.is("section_id", null);

    const excludeArr = [...usedIds];
    if (excludeArr.length > 0) q = q.not("id", "in", `(${excludeArr.join(",")})`);

    const { data, error } = await q.limit(200);
    if (error) console.error(`[fetchQ] pool error:`, error.message);
    return (data as { id: string; difficulty: string }[]) ?? [];
  }

  // Pick IDs from pool respecting difficulty targets
  function pickByDifficulty(pool: { id: string; difficulty: string }[], targets: { easy: number; medium: number; hard: number }): string[] {
    const picked: string[] = [];
    const byDiff: Record<string, string[]> = { easy: [], medium: [], hard: [] };
    for (const q of pool) {
      if (byDiff[q.difficulty]) byDiff[q.difficulty].push(q.id);
    }

    for (const [diff, want] of Object.entries(targets) as [string, number][]) {
      const available = byDiff[diff] || [];
      // Shuffle for randomness
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      for (let i = 0; i < Math.min(want, available.length); i++) {
        picked.push(available[i]);
        usedIds.add(available[i]);
      }
    }
    return picked;
  }

  let rEasy = wantEasy, rMedium = wantMedium, rHard = wantHard;
  const selectedIds: string[] = [];

  // Priority 1: section-specific
  const p1Pool = await fetchIdPool({ sectionId: section.id });
  const p1Ids = pickByDifficulty(p1Pool, { easy: rEasy, medium: rMedium, hard: rHard });
  selectedIds.push(...p1Ids);
  rEasy -= p1Ids.filter(id => p1Pool.find(q => q.id === id)?.difficulty === "easy").length;
  rMedium -= p1Ids.filter(id => p1Pool.find(q => q.id === id)?.difficulty === "medium").length;
  rHard -= p1Ids.filter(id => p1Pool.find(q => q.id === id)?.difficulty === "hard").length;

  // Priority 2: template-level (null section)
  if (rEasy + rMedium + rHard > 0) {
    const p2Pool = await fetchIdPool({ examTemplateId: templateIdStr, nullSection: true });
    const p2Ids = pickByDifficulty(p2Pool, { easy: rEasy, medium: rMedium, hard: rHard });
    selectedIds.push(...p2Ids);
    rEasy -= p2Ids.filter(id => p2Pool.find(q => q.id === id)?.difficulty === "easy").length;
    rMedium -= p2Ids.filter(id => p2Pool.find(q => q.id === id)?.difficulty === "medium").length;
    rHard -= p2Ids.filter(id => p2Pool.find(q => q.id === id)?.difficulty === "hard").length;
  }

  // Priority 3: country pool
  if (rEasy + rMedium + rHard > 0) {
    const p3Pool = await fetchIdPool({});
    const p3Ids = pickByDifficulty(p3Pool, { easy: rEasy, medium: rMedium, hard: rHard });
    selectedIds.push(...p3Ids);
  }

  // Fill remaining with any difficulty if still short
  if (selectedIds.length < targetCount) {
    const fillPool = await fetchIdPool({});
    const unused = fillPool.filter(q => !usedIds.has(q.id));
    for (let i = 0; i < Math.min(targetCount - selectedIds.length, unused.length); i++) {
      selectedIds.push(unused[i].id);
      usedIds.add(unused[i].id);
    }
  }

  // Hydrate: fetch full question data for selected IDs (in small batches)
  const questions: unknown[] = [];
  const BATCH_SIZE = 5;
  for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
    const batch = selectedIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await admin
      .from("questions")
      .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
      .in("id", batch);
    if (error) console.error(`[fetchQ] hydrate error:`, error.message);
    if (data) questions.push(...data);
  }

  console.log(`[fetchQ] section=${section.name_ar}: target=${targetCount}, pool1=${p1Pool.length}, selected=${selectedIds.length}, hydrated=${questions.length}`);

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
    const { exam_template_id, session_type, exam_language } = body;

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

    // ── Resolve exam language ──
    const availableLangs: string[] = Array.isArray(template.available_languages) ? template.available_languages : ["ar"];
    let selectedLanguage: string;
    if (availableLangs.length === 1) {
      selectedLanguage = availableLangs[0];
    } else if (exam_language && availableLangs.includes(exam_language)) {
      selectedLanguage = exam_language;
    } else {
      selectedLanguage = availableLangs[0]; // fallback
    }
    console.log(`[assemble-exam] Language: ${selectedLanguage} (available: ${availableLangs.join(",")})`);


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

      // ── Read Skill Memory for intelligent section prioritization ──
      const { data: skillMemory } = await admin
        .from("skill_memory")
        .select("*")
        .eq("user_id", user.id)
        .eq("exam_template_id", exam_template_id);

      let sectionDistribution: Map<string, number>;
      let sectionDifficultyMap: Map<string, { easy: number; medium: number; hard: number }>;
      let activeSections: Section[];

      if (!skillMemory || skillMemory.length === 0) {
        // ── NO SKILL MEMORY: Diagnostic mode — equal distribution ──
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

        console.log(`[assemble-exam] Practice DIAGNOSTIC (no skill memory): ${totalPracticeQuestions} questions, equal across ${typedSections.length} sections`);
      } else {
        // ── HAS SKILL MEMORY: Adaptive mode — weighted by skill scores ──
        practiceMode = "adaptive";

        // Build performance map from skill_memory
        const performances: SectionPerformance[] = [];
        const skillMap = new Map(skillMemory.map((sm: any) => [sm.section_id, sm]));

        for (const section of typedSections) {
          const sm = skillMap.get(section.id) as any;
          let accuracy = 50; // default for sections without skill data
          if (sm) {
            accuracy = Number(sm.skill_score) || 50;
          }

          let tier: "weak" | "medium" | "strong";
          if (accuracy < 50) tier = "weak";
          else if (accuracy < 75) tier = "medium";
          else tier = "strong";

          performances.push({ sectionId: section.id, accuracy, tier });
        }

        // Prioritize sections where last exam showed weakness
        const recentExamWeakSections = skillMemory
          .filter((sm: any) => sm.last_exam_score !== null && Number(sm.last_exam_score) < 50)
          .map((sm: any) => sm.section_id);

        // Boost weak sections from recent exams
        for (const perf of performances) {
          if (recentExamWeakSections.includes(perf.sectionId) && perf.tier !== "weak") {
            perf.tier = "weak";
            console.log(`[assemble-exam] Boosted section ${perf.sectionId} to weak (last exam score < 50)`);
          }
        }

        const weakSections = performances.filter((p) => p.tier === "weak");
        const mediumSections = performances.filter((p) => p.tier === "medium");
        const strongSections = performances.filter((p) => p.tier === "strong");

        // C) BLEND POLICY: 70% weakness-based + 30% blueprint coverage
        let weakCount = Math.round(totalPracticeQuestions * PRACTICE_WEAK_RATIO);

        // If no weak sections, shift to medium or blueprint
        if (weakSections.length === 0) {
          weakCount = 0;
        }

        const blueprintCount = totalPracticeQuestions - weakCount;

        // Distribute weakness-based questions
        const weakTargetSections = weakSections.length > 0 ? weakSections : mediumSections;
        const weakDist = distributeAcrossSections(weakTargetSections.map((s) => s.sectionId), weakCount);

        // Blueprint coverage: proportional to section blueprint weights
        const blueprintDist = new Map<string, number>();
        const totalBlueprintQuestions = typedSections.reduce((s, sec) => s + sec.question_count, 0);
        let assignedBlueprint = 0;
        for (let i = 0; i < typedSections.length; i++) {
          const sec = typedSections[i];
          const weight = totalBlueprintQuestions > 0 ? sec.question_count / totalBlueprintQuestions : 1 / typedSections.length;
          const count = i === typedSections.length - 1
            ? blueprintCount - assignedBlueprint
            : Math.round(blueprintCount * weight);
          blueprintDist.set(sec.id, Math.max(count, 0));
          assignedBlueprint += count;
        }

        // Merge distributions
        sectionDistribution = new Map<string, number>();
        for (const s of typedSections) {
          const total = (weakDist.get(s.id) ?? 0) + (blueprintDist.get(s.id) ?? 0);
          if (total > 0) sectionDistribution.set(s.id, total);
        }

        // Build adaptive difficulty per section using skill_score
        sectionDifficultyMap = new Map();
        for (const perf of performances) {
          sectionDifficultyMap.set(perf.sectionId, adaptiveDifficultyMix(perf.accuracy));
        }

        activeSections = typedSections.filter((s) => (sectionDistribution.get(s.id) ?? 0) > 0);

        practiceMetadata = {
          skill_memory_used: true,
          blend_policy: "70% weakness + 30% blueprint",
          section_performances: performances.map((p) => {
            const sm = skillMap.get(p.sectionId) as any;
            return {
              section_id: p.sectionId,
              section_name: typedSections.find((s) => s.id === p.sectionId)?.name_ar,
              skill_score: p.accuracy,
              tier: p.tier,
              questions_assigned: sectionDistribution.get(p.sectionId) ?? 0,
              last_exam_score: sm?.last_exam_score ?? null,
              last_exam_date: sm?.last_exam_date ?? null,
              total_answered: sm?.total_answered ?? 0,
            };
          }),
          distribution: { weakness: weakCount, blueprint: blueprintCount },
        };

        console.log(`[assemble-exam] Practice ADAPTIVE (70/30 blend): weakness=${weakCount} (${weakTargetSections.length} sections), blueprint=${blueprintCount}, recent_exam_weak=${recentExamWeakSections.length}`);
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
          allUsedIds,
          selectedLanguage
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
      // ─── SIMULATION MODE: 90% strict blueprint + 10% flex if shortage ───
      const insufficientSections: { name: string; required: number; available: number }[] = [];

      for (const section of typedSections) {
        const required = section.question_count;
        const available = await countAvailableQuestions(admin, section.id, template.country_id, template.id, selectedLanguage);
        if (available < required) {
          insufficientSections.push({ name: section.name_ar, required, available });
        }
      }

      // C) BLEND POLICY: Allow 10% flexibility if shortage exists
      const totalRequired = typedSections.reduce((s, sec) => s + sec.question_count, 0);
      const flexAllowance = Math.ceil(totalRequired * SIMULATION_FLEX_RATIO);

      if (insufficientSections.length > 0) {
        const totalDeficit = insufficientSections.reduce((s, sec) => s + (sec.required - sec.available), 0);

        if (totalDeficit > flexAllowance) {
          // Deficit exceeds 10% flex — reject
          const details = insufficientSections
            .map((s) => `${s.name}: مطلوب ${s.required}، متوفر ${s.available}`)
            .join(" | ");

          console.error(`[assemble-exam] Insufficient questions (beyond 10% flex): ${details}`);

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
        } else {
          // Within 10% flex — proceed with warning
          console.warn(`[assemble-exam] Simulation flex mode: ${totalDeficit} questions short (within ${flexAllowance} flex allowance)`);
        }
      }

      // Fetch blueprint counts per section (use available if short, within flex)
      const allUsedIds: string[] = [];
      for (const section of typedSections) {
        const available = await countAvailableQuestions(admin, section.id, template.country_id, template.id, selectedLanguage);
        const targetCount = Math.min(section.question_count, available);

        const { questions, usedIds } = await fetchSectionQuestions(
          admin,
          section,
          targetCount,
          { country_id: template.country_id, id: template.id },
          null,
          allUsedIds,
          selectedLanguage
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

        const shortfall = section.question_count - strippedQuestions.length;
        if (shortfall > 0) {
          console.warn(`[assemble-exam] Simulation section "${section.name_ar}": required=${section.question_count}, fetched=${strippedQuestions.length} (flex: -${shortfall})`);
        } else {
          console.log(`[assemble-exam] Simulation section "${section.name_ar}": required=${section.question_count}, fetched=${strippedQuestions.length}`);
        }
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
      exam_language: selectedLanguage,
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

    console.log(`[assemble-exam] Session ${session.id} created: ${totalQuestionCount} questions, type=${session_type}, lang=${selectedLanguage}, mode=${session_type === "practice" ? practiceMode : "blueprint"}`);

    return new Response(
      JSON.stringify({
        session_id: session.id,
        total_questions: totalQuestionCount,
        sections_count: snapshotSections.length,
        points_deducted: isDiamond ? 0 : pointsCost,
        practice_mode: session_type === "practice" ? practiceMode : undefined,
        is_diagnostic: session_type === "practice" ? isDiagnostic : undefined,
        exam_language: selectedLanguage,
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
