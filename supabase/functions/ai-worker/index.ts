import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Constants ───────────────────────────────────────────────────────
const MAX_JOBS_PER_RUN = 5;
const MAX_JOB_ATTEMPTS = 3;
const MAX_ITEM_RETRIES = 2;
const BATCH_DELAY_MS = 1500;
const LOCK_TIMEOUT_MINUTES = 5;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MINUTES = 1;
const AI_TIMEOUT_MS = 120_000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(status: number): boolean {
  return status === 429 || status === 503 || status === 504 || status === 0;
}

function exponentialBackoff(attempt: number): number {
  const base = Math.pow(2, attempt) * 1000;
  const jitter = Math.random() * 1000;
  return base + jitter;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────
async function checkCircuitBreaker(admin: any): Promise<boolean> {
  // Use raw SQL for FOR UPDATE lock
  const { data, error } = await admin.rpc("check_circuit_breaker_safe", {});
  // Fallback: if RPC doesn't exist, check via normal query
  if (error) {
    const { data: state } = await admin
      .from("ai_system_state")
      .select("*")
      .eq("id", 1)
      .single();
    if (!state) return false; // allow
    if (state.gemini_circuit_open_until && new Date(state.gemini_circuit_open_until) > new Date()) {
      console.log("[ai-worker] Circuit breaker OPEN until", state.gemini_circuit_open_until);
      return true; // circuit open, don't call API
    }
    return false;
  }
  return data === true;
}

async function recordApiSuccess(admin: any) {
  await admin
    .from("ai_system_state")
    .update({
      gemini_failures_window: 0,
      gemini_circuit_open_until: null,
    })
    .eq("id", 1);
}

async function recordApiFailure(admin: any, statusCode: number) {
  if (!isRetryableError(statusCode)) return;

  const { data: state } = await admin
    .from("ai_system_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (!state) return;

  const newFailures = (state.gemini_failures_window || 0) + 1;
  const update: any = {
    gemini_failures_window: newFailures,
    gemini_last_failure_at: new Date().toISOString(),
  };

  if (newFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    const openUntil = new Date(Date.now() + CIRCUIT_BREAKER_COOLDOWN_MINUTES * 60 * 1000);
    update.gemini_circuit_open_until = openUntil.toISOString();
    console.log(`[ai-worker] Circuit breaker OPENED until ${openUntil.toISOString()} after ${newFailures} failures`);
  }

  await admin.from("ai_system_state").update(update).eq("id", 1);
}

// ─── Atomic Job Claim (via Postgres RPC — FOR UPDATE SKIP LOCKED) ───
async function claimJob(admin: any, workerId: string): Promise<any | null> {
  const { data, error } = await admin.rpc("claim_next_job", { worker_id: workerId });

  if (error) {
    console.log("[ai-worker] claim_next_job RPC error:", error.message);
    return null;
  }

  // RPC returns an array (RETURNS SETOF); take first row or null
  const claimed = Array.isArray(data) ? data[0] ?? null : data;

  if (!claimed) {
    console.log("[ai-worker] No claimable jobs found");
    return null;
  }

  console.log(`[ai-worker] ✅ Claimed job ${claimed.id} type=${claimed.type} attempt=${claimed.attempt_count}`);
  return claimed;
}

// ─── Release Job (Terminal State) ────────────────────────────────────
async function releaseJob(admin: any, jobId: string, status: "succeeded" | "failed" | "canceled", error?: string) {
  const update: any = {
    locked_by: null,
    locked_at: null,
    status,
    finished_at: new Date().toISOString(),
  };
  if (error) update.last_error = error;

  await admin.from("ai_jobs").update(update).eq("id", jobId);
  console.log(`[ai-worker] Job ${jobId} → ${status}${error ? ` (${error.substring(0, 100)})` : ""}`);
}

// ─── Move to DLQ ────────────────────────────────────────────────────
async function moveToDLQ(admin: any, job: any) {
  // Insert into DLQ
  await admin.from("ai_dead_letter_jobs").insert({
    job_id: job.id,
    type: job.type,
    params_json: job.params_json,
    last_error: job.last_error || "Max retries exceeded",
    attempts: job.attempt_count,
    failed_at: new Date().toISOString(),
  });

  // Mark job as failed
  await releaseJob(admin, job.id, "failed", "Moved to DLQ after max retries");
  console.log(`[ai-worker] ☠️ Job ${job.id} moved to DLQ`);
}

// ─── AI Call Helper ──────────────────────────────────────────────────
async function callGemini(
  admin: any,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
  // Check circuit breaker
  const circuitOpen = await checkCircuitBreaker(admin);
  if (circuitOpen) {
    return { ok: false, error: "Circuit breaker open", status: 503 };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      await recordApiFailure(admin, response.status);
      return { ok: false, error: errText.substring(0, 500), status: response.status };
    }

    const data = await response.json();
    await recordApiSuccess(admin);
    return { ok: true, data };
  } catch (e: any) {
    if (e.name === "AbortError") {
      await recordApiFailure(admin, 0);
      return { ok: false, error: "Timeout", status: 0 };
    }
    return { ok: false, error: e.message || "Unknown error", status: 0 };
  }
}

// ─── Job Processors ──────────────────────────────────────────────────

// ─── Topic Resolution ────────────────────────────────────────────────
async function resolveAllowedTopics(
  admin: any,
  profileSnapshot: any,
  sectionId: string | null
): Promise<{ topics: string[]; sectionName: string | null }> {
  if (!sectionId) return { topics: [], sectionName: null };

  // 1. Try profile snapshot first
  if (profileSnapshot?.official_spec?.sections) {
    const section = profileSnapshot.official_spec.sections.find(
      (s: any) => s.section_id === sectionId
    );
    if (section) {
      const topics = Array.isArray(section.topics) ? section.topics.filter((t: string) => t) : [];
      return { topics, sectionName: section.name || section.section_id };
    }
  }

  // 2. Fallback: query exam_sections.topic_filter_json from DB
  const { data: dbSection } = await admin
    .from("exam_sections")
    .select("name_ar, topic_filter_json")
    .eq("id", sectionId)
    .single();

  if (dbSection) {
    const raw = dbSection.topic_filter_json;
    const topics = Array.isArray(raw) ? raw.filter((t: string) => typeof t === "string" && t) : [];
    return { topics, sectionName: dbSection.name_ar };
  }

  return { topics: [], sectionName: null };
}

function buildTopicConstraint(sectionId: string | null, allowedTopics: string[], sectionName: string | null, lang: "en" | "ar"): string {
  if (allowedTopics.length === 0) return "";
  const topicsJson = JSON.stringify(allowedTopics);

  if (lang === "en") {
    return `

You are generating exam questions for a specific section.

SECTION_ID: ${sectionId}
ALLOWED_TOPICS: ${topicsJson}

STRICT RULES (MANDATORY):
1) You MUST generate questions ONLY from ALLOWED_TOPICS.
2) You MUST NOT generate content outside these topics.
3) If a question would belong to another topic, DO NOT generate it.
4) Each question MUST include:
   - "section_id": "${sectionId}" (must match SECTION_ID)
   - "topic_tag": (must be exactly one of ALLOWED_TOPICS)

If you cannot comply, return:
{ "error": "topic_violation" }
`;
  }

  return `

أنت تولّد أسئلة اختبار لقسم محدد.

SECTION_ID: ${sectionId}
ALLOWED_TOPICS: ${topicsJson}

قواعد صارمة (إلزامية):
1) يجب توليد أسئلة فقط من ALLOWED_TOPICS.
2) يُمنع توليد محتوى خارج هذه المواضيع.
3) إذا كان السؤال ينتمي لموضوع آخر، لا تولّده.
4) كل سؤال يجب أن يتضمن:
   - "section_id": "${sectionId}" (يطابق SECTION_ID)
   - "topic_tag": (يطابق أحد ALLOWED_TOPICS تماماً)

إذا لم تستطع الالتزام، أرجع:
{ "error": "topic_violation" }
`;
}

interface TopicValidationResult {
  valid: any[];
  violations: number;
  violationDetails: { index: number; givenTag: string; allowedTopics: string[] }[];
}

function validateTopicTags(questions: any[], allowedTopics: string[]): TopicValidationResult {
  if (allowedTopics.length === 0) return { valid: questions, violations: 0, violationDetails: [] };

  const normalizedTopics = new Set(allowedTopics.map(t => t.trim().toLowerCase()));
  let violations = 0;
  const violationDetails: { index: number; givenTag: string; allowedTopics: string[] }[] = [];

  const valid = questions.filter((q, i) => {
    const tag = (q.topic_tag || "").trim().toLowerCase();
    if (!tag || !normalizedTopics.has(tag)) {
      violations++;
      violationDetails.push({ index: i, givenTag: q.topic_tag || q.topic || "(empty)", allowedTopics });
      return false;
    }
    return true;
  });

  return { valid, violations, violationDetails };
}

// ─── Blueprint Compliance Guard (Semantic Level) ─────────────────────
// Defines forbidden question families per exam category.
// These are question TYPES/FAMILIES that should never appear in certain exams,
// regardless of topic_tag correctness.

interface ExamFamilyRules {
  examNamePatterns: RegExp[];
  forbiddenFamilies: { name: string; keywords: RegExp[] }[];
  requiredFamily: string; // e.g. "math", "verbal", "chemistry"
}

const EXAM_FAMILY_RULES: ExamFamilyRules[] = [
  {
    examNamePatterns: [/رياضيات/i, /math/i, /الرياضيات/i],
    requiredFamily: "math",
    forbiddenFamilies: [
      {
        name: "verbal_analogy",
        keywords: [/تناظر\s*لفظي/i, /تناظر/i, /analogy/i, /analogies/i, /العلاقة\s*بين.*كالعلاقة/i, /يناظر/i],
      },
      {
        name: "vocabulary",
        keywords: [/مرادف/i, /مضاد/i, /synonym/i, /antonym/i, /معنى\s*الكلمة/i, /المعنى\s*المناسب/i],
      },
      {
        name: "reading_comprehension",
        keywords: [/استيعاب\s*مقروء/i, /reading\s*comprehension/i, /فهم\s*المقروء/i, /النص\s*التالي.*اقرأ/i, /اقرأ\s*النص/i],
      },
      {
        name: "grammar",
        keywords: [/إعراب/i, /نحو/i, /صرف/i, /بلاغة/i, /الفاعل/i, /المفعول\s*به/i, /المبتدأ/i, /الخبر/i],
      },
    ],
  },
  {
    examNamePatterns: [/إنجليزي/i, /english/i, /انجليزي/i, /انقليزي/i],
    requiredFamily: "english",
    forbiddenFamilies: [
      {
        name: "math_calculation",
        keywords: [/احسب/i, /الناتج/i, /المعادلة/i, /حل\s*المعادلة/i, /calculate/i, /equation/i, /∫/i, /∑/i],
      },
      {
        name: "chemistry",
        keywords: [/تفاعل\s*كيميائي/i, /العنصر/i, /المركب/i, /الذرة/i, /chemical/i, /element/i, /molecule/i],
      },
    ],
  },
  {
    examNamePatterns: [/عربي/i, /arabic/i, /العربية/i, /لغة\s*عربية/i],
    requiredFamily: "arabic",
    forbiddenFamilies: [
      {
        name: "math_calculation",
        keywords: [/احسب/i, /الناتج/i, /المعادلة/i, /حل\s*المعادلة/i, /calculate/i, /equation/i],
      },
    ],
  },
  {
    examNamePatterns: [/كيمياء/i, /chemistry/i, /الكيمياء/i],
    requiredFamily: "chemistry",
    forbiddenFamilies: [
      {
        name: "verbal_analogy",
        keywords: [/تناظر\s*لفظي/i, /تناظر/i, /analogy/i, /يناظر/i],
      },
      {
        name: "grammar",
        keywords: [/إعراب/i, /نحو/i, /صرف/i, /بلاغة/i],
      },
    ],
  },
];

interface BlueprintViolation {
  index: number;
  questionText: string;
  violatedFamily: string;
  matchedKeyword: string;
}

function detectExamFamilyRules(examName: string, sectionName: string | null): ExamFamilyRules | null {
  const combined = `${examName} ${sectionName || ""}`;
  for (const rule of EXAM_FAMILY_RULES) {
    if (rule.examNamePatterns.some(p => p.test(combined))) return rule;
  }
  return null;
}

function validateBlueprintCompliance(
  questions: any[],
  examName: string,
  sectionName: string | null
): { valid: any[]; violations: BlueprintViolation[] } {
  const rules = detectExamFamilyRules(examName, sectionName);
  if (!rules) return { valid: questions, violations: [] };

  const violations: BlueprintViolation[] = [];

  const valid = questions.filter((q, i) => {
    const textToCheck = [
      q.text_ar || q.stem || "",
      ...(q.options || []).map((o: any) => o.textAr || o.text || ""),
      q.explanation || "",
      q.topic_tag || q.topic || "",
    ].join(" ");

    for (const family of rules.forbiddenFamilies) {
      for (const kw of family.keywords) {
        if (kw.test(textToCheck)) {
          violations.push({
            index: i,
            questionText: (q.text_ar || q.stem || "").substring(0, 80),
            violatedFamily: family.name,
            matchedKeyword: kw.source,
          });
          return false;
        }
      }
    }
    return true;
  });

  return { valid, violations };
}

function buildBlueprintPromptConstraint(examName: string, sectionName: string | null): string {
  const rules = detectExamFamilyRules(examName, sectionName);
  if (!rules) return "";

  const forbiddenNames = rules.forbiddenFamilies.map(f => f.name).join(", ");
  return `

🚨 BLUEPRINT COMPLIANCE — MANDATORY 🚨
This is a ${rules.requiredFamily.toUpperCase()} exam section.
FORBIDDEN question families that MUST NOT appear:
${rules.forbiddenFamilies.map(f => `- ${f.name}: DO NOT generate any questions of this type`).join("\n")}

If you generate a question belonging to [${forbiddenNames}], the ENTIRE batch will be REJECTED.
Every question MUST be a pure ${rules.requiredFamily} question matching the section blueprint.
`;
}

async function processGenerateDraftJob(admin: any, job: any, apiKey: string) {
  const params = job.params_json;
  const profileSnapshot = job.profile_snapshot_json || null;

  // ── Crash Recovery: reset stale "running" items back to "pending" ──
  await admin
    .from("ai_job_items")
    .update({ status: "pending", started_at: null })
    .eq("job_id", job.id)
    .eq("status", "running");

  const { data: items } = await admin
    .from("ai_job_items")
    .select("*")
    .eq("job_id", job.id)
    .in("status", ["pending", "failed"])
    .order("item_index", { ascending: true });

  if (!items || items.length === 0) {
    await finalizeGenerateJob(admin, job);
    return;
  }

  const countryId = params.country_id;
  const examTemplateId = params.exam_template_id;
  const difficulty = params.difficulty || "medium";
  const sectionId = params.section_id || null;

  const { data: countryData } = await admin.from("countries").select("name_ar").eq("id", countryId).single();
  const countryName = countryData?.name_ar || countryId;

  let examName = "اختبار عام";
  if (examTemplateId) {
    const { data: et } = await admin.from("exam_templates").select("name_ar").eq("id", examTemplateId).single();
    if (et) examName = et.name_ar;
  }

  const contentLang = params.content_language || "ar";
  const model = "google/gemini-2.5-flash";

  // ── Resolve allowed topics for the section ──
  const { topics: allowedTopics, sectionName } = await resolveAllowedTopics(admin, profileSnapshot, sectionId);

  // ── HARD BLOCK: if section_id is specified but no topics defined → needs_review ──
  if (sectionId && (!allowedTopics || allowedTopics.length === 0)) {
    const reason = `No topics configured for section "${sectionName || sectionId}". Cannot generate without topic constraints.`;
    console.error(`[ai-worker] ❌ TOPIC HARD BLOCK`, JSON.stringify({
      job_id: job.id,
      section_id: sectionId,
      section_name: sectionName,
      exam_template_id: examTemplateId,
      country_id: countryId,
      missing_topic_filter: true,
      has_profile_snapshot: !!profileSnapshot,
    }));
    await admin.from("ai_jobs").update({
      status: "needs_review",
      last_error: reason,
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    }).eq("id", job.id);
    return;
  }

  const topicConstraint = buildTopicConstraint(sectionId, allowedTopics, sectionName, contentLang as "en" | "ar");

  // ── E2E Test: skip AI calls ──
  if (params.e2e_test) {
    for (const item of items) {
      await admin.from("ai_job_items").update({
        status: "succeeded",
        output_json: { questions: [{ text_ar: "سؤال اختباري", options: [{id:"a",textAr:"أ"},{id:"b",textAr:"ب"},{id:"c",textAr:"ج"},{id:"d",textAr:"د"}], correct_option_id: "a", explanation: "اختبار", difficulty: "medium", topic: allowedTopics[0] || "e2e_test", topic_tag: allowedTopics[0] || "e2e_test" }] },
        finished_at: new Date().toISOString(),
        attempt_count: item.attempt_count + 1,
      }).eq("id", item.id);
    }
    await admin.from("ai_jobs").update({ progress_done: items.length, progress_failed: 0 }).eq("id", job.id);
    await finalizeGenerateJob(admin, job);
    return;
  }

  let totalDone = job.progress_done;
  let totalFailed = job.progress_failed;
  let allGeneratedQuestions: any[] = [];
  let totalTopicViolations = 0;

  // Build profile-aware prompt
  let profileContext = "";
  if (profileSnapshot) {
    const dna = profileSnapshot.psychometric_dna || {};
    const rules = profileSnapshot.generation_rules || {};
    profileContext = `
EXAM PROFILE DNA (MUST FOLLOW):
- Thinking Style: ${dna.thinking_style || "mixed"}
- Time Pressure: ${dna.time_pressure_level || "medium"}
- Reasoning Depth: ${dna.reasoning_depth_level || 3}/5
- Trap Density: ${dna.trap_density || "medium"}
- Distractor Style: ${dna.distractor_style?.type || "plausible"}
- Wording Complexity: ${dna.wording_complexity || "medium"}
- Calculation Load: ${dna.calculation_load || "low"}
- Max stem length: ${rules.stem_max_chars || 200} chars
- Options count: ${rules.options_count || 4}
- MUST have exactly one correct answer
- NEVER include the answer in the question stem
`;
  }

  // Build the required JSON schema for AI output (new standardized format)
  const topicFields = allowedTopics.length > 0
    ? `"section_id": "${sectionId}", "topic_tag": string (MUST be one of: ${allowedTopics.map(t => `"${t}"`).join(", ")}),`
    : `"section_id": string,`;

  const outputSchema = `{ ${topicFields} "stem": string, "options": [{"id":"A","text":string},{"id":"B","text":string},{"id":"C","text":string},{"id":"D","text":string}], "correct_option_id": "A"|"B"|"C"|"D", "explanation": string, "difficulty": "${difficulty}" }`;

  for (const item of items) {
    if (item.attempt_count >= MAX_ITEM_RETRIES && item.status === "failed") continue;

    await admin.from("ai_job_items").update({ status: "running", started_at: new Date().toISOString(), attempt_count: item.attempt_count + 1 }).eq("id", item.id);

    const batchCount = item.input_json.count || 10;

    const blueprintConstraint = buildBlueprintPromptConstraint(examName, sectionName);

    const systemPrompt = contentLang === "en"
      ? `You are an Elite Exam Question Generator. Generate ALL content in ENGLISH ONLY. ${profileContext}${topicConstraint}${blueprintConstraint}Return JSON array ONLY. Each item: ${outputSchema}`
      : `You are an Elite Exam Question Generator. Generate ALL content in ARABIC ONLY. ${profileContext}${topicConstraint}${blueprintConstraint}Return JSON array ONLY. Each item: ${outputSchema}`;

    const sectionContext = sectionName ? ` for section "${sectionName}"` : "";
    const userPrompt = `Generate exactly ${batchCount} questions at difficulty "${difficulty}" for "${examName}" (${countryName})${sectionContext}. ${allowedTopics.length > 0 ? `ONLY from topics: ${allowedTopics.join(", ")}. Each question MUST include section_id and topic_tag.` : ""} Return JSON array ONLY.`;

    let batchQuestions: any[] = [];
    let retryCount = 0;
    const MAX_TOPIC_RETRIES = 2;

    while (retryCount <= MAX_TOPIC_RETRIES) {
      const result = await callGemini(admin, apiKey, model, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      if (!result.ok) {
        if (isRetryableError(result.status || 0) && item.attempt_count < MAX_ITEM_RETRIES) {
          await admin.from("ai_job_items").update({ status: "pending", error: result.error }).eq("id", item.id);
        } else {
          await admin.from("ai_job_items").update({ status: "failed", error: result.error, finished_at: new Date().toISOString() }).eq("id", item.id);
          totalFailed++;
        }
        await admin.from("ai_jobs").update({ progress_failed: totalFailed, last_error: result.error }).eq("id", job.id);
        break;
      }

      try {
        const rawContent = result.data?.choices?.[0]?.message?.content || "";
        const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

        // Check if AI returned topic_violation error
        if (cleaned.includes('"topic_violation"') || cleaned.includes('"error"')) {
          try {
            const errObj = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || "{}");
            if (errObj.error === "topic_violation") {
              console.log(`[ai-worker] ⚠️ AI reported topic_violation — retry ${retryCount + 1}/${MAX_TOPIC_RETRIES}`);
              totalTopicViolations++;
              retryCount++;
              if (retryCount <= MAX_TOPIC_RETRIES) { await sleep(1000); continue; }
              throw new Error("AI cannot comply with topic constraints after retries");
            }
          } catch { /* not a topic violation JSON, continue parsing */ }
        }

        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) throw new Error("No JSON array found");

        const questions = JSON.parse(arrayMatch[0]);

        // Parse with backward-compatible support for both old and new schemas
        const parsed = questions.map((q: any, i: number) => {
          let optionsArr: { id: string; textAr: string }[];
          if (Array.isArray(q.options)) {
            optionsArr = q.options.map((o: any) => ({
              id: (o.id || "").toLowerCase(),
              textAr: o.text || o.textAr || "",
            }));
          } else if (q.options && typeof q.options === "object") {
            optionsArr = ["A", "B", "C", "D"].map(l => ({
              id: l.toLowerCase(),
              textAr: q.options[l] || "",
            }));
          } else {
            optionsArr = [];
          }

          const rawCorrect = (q.correct_option_id || q.correct_answer || "A").toUpperCase();
          const correctId = rawCorrect.toLowerCase();

          return {
            index: allGeneratedQuestions.length + i,
            text_ar: q.stem || q.question_text || "",
            options: optionsArr,
            correct_option_id: correctId,
            explanation: q.explanation || "",
            difficulty: q.difficulty || difficulty,
            topic: q.topic_tag || q.topic || examName,
            topic_tag: q.topic_tag || "",
            section_id: q.section_id || sectionId,
            content_language: contentLang,
          };
        });

        // ── STRICT Topic validation (3-step: generate → validate → retry up to 2x → needs_review) ──
        if (allowedTopics.length > 0) {
          const { valid, violations, violationDetails } = validateTopicTags(parsed, allowedTopics);
          totalTopicViolations += violations;

          if (violations > 0) {
            console.log(`[ai-worker] ⚠️ Topic violations: ${violations}/${parsed.length} — retry ${retryCount + 1}/${MAX_TOPIC_RETRIES}`, 
              JSON.stringify(violationDetails.slice(0, 5)));
          }

          // Step 2: If violations exist and retries remain, regenerate
          if (violations > 0 && retryCount < MAX_TOPIC_RETRIES) {
            retryCount++;
            await sleep(1500);
            continue;
          }

          // Step 3: All retries exhausted — if still no valid questions, mark needs_review
          if (valid.length === 0 && violations > 0) {
            const mismatchLog = `Topic enforcement FAILED after ${retryCount} retries. ${violations} violations, 0 valid. Allowed: [${allowedTopics.join(", ")}]. Sample violations: ${JSON.stringify(violationDetails.slice(0, 3))}`;
            console.log(`[ai-worker] ❌ ${mismatchLog}`);

            await admin.from("ai_job_items").update({
              status: "failed",
              error: mismatchLog,
              finished_at: new Date().toISOString(),
            }).eq("id", item.id);
            totalFailed++;

            // Set job to needs_review so admin can investigate
            await admin.from("ai_jobs").update({
              status: "needs_review",
              last_error: mismatchLog,
              params_json: { ...params, topic_violation_count: totalTopicViolations, topic_violation_details: violationDetails.slice(0, 10) },
            }).eq("id", job.id);
            console.log(`[ai-worker] 🔍 Job ${job.id} → needs_review due to unresolvable topic violations`);
            return; // abort entire job
          }

          // Partial success: some valid questions survived
          if (violations > 0) {
            console.log(`[ai-worker] ⚠️ Partial topic compliance: ${valid.length}/${parsed.length} passed after ${retryCount} retries`);
          }

          batchQuestions = valid;
        } else {
          batchQuestions = parsed;
        }

        allGeneratedQuestions = allGeneratedQuestions.concat(batchQuestions);

        await admin.from("ai_job_items").update({
          status: "succeeded",
          output_json: { questions: batchQuestions, topic_violation_count: totalTopicViolations },
          finished_at: new Date().toISOString(),
        }).eq("id", item.id);
        totalDone++;
        break; // success, exit retry loop
      } catch (parseError: any) {
        await admin.from("ai_job_items").update({
          status: "failed",
          error: `Parse error: ${parseError.message}`,
          finished_at: new Date().toISOString(),
        }).eq("id", item.id);
        totalFailed++;
        break;
      }
    }

    await admin.from("ai_jobs").update({
      progress_done: totalDone,
      progress_failed: totalFailed,
      params_json: { ...params, topic_violation_count: totalTopicViolations },
    }).eq("id", job.id);

    // Delay between batches
    if (items.indexOf(item) < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Log total topic violations
  if (totalTopicViolations > 0) {
    console.log(`[ai-worker] 📊 Total topic violations for job ${job.id}: ${totalTopicViolations}`);
  }

  // Finalize: collect all outputs and create/update draft
  await finalizeGenerateJob(admin, job);
}

// ── Collect all succeeded item outputs and save draft ──
async function finalizeGenerateJob(admin: any, job: any) {
  const { data: succeededItems } = await admin
    .from("ai_job_items")
    .select("output_json")
    .eq("job_id", job.id)
    .eq("status", "succeeded")
    .order("item_index", { ascending: true });

  const allQuestions: any[] = [];
  for (const item of (succeededItems || [])) {
    const qs = item.output_json?.questions;
    if (Array.isArray(qs)) allQuestions.push(...qs);
  }

  // ── Deterministic Validation against profile snapshot ──
  const profileSnapshot = job.profile_snapshot_json;
  let validatedQuestions = allQuestions;

  if (profileSnapshot && allQuestions.length > 0) {
    const rules = profileSnapshot.generation_rules || {};
    const spec = profileSnapshot.official_spec || {};
    const sectionIds = new Set((spec.sections || []).map((s: any) => s.section_id));

    // Resolve allowed topics for this job's section
    const jobSectionId = job.params_json?.section_id || null;
    let allowedTopics: string[] = [];
    if (jobSectionId && spec.sections) {
      const targetSection = spec.sections.find((s: any) => s.section_id === jobSectionId);
      if (targetSection?.topics) {
        allowedTopics = Array.isArray(targetSection.topics) ? targetSection.topics.filter((t: string) => t) : [];
      }
    }
    const normalizedTopics = allowedTopics.length > 0 ? new Set(allowedTopics.map((t: string) => t.trim().toLowerCase())) : null;

    validatedQuestions = allQuestions.filter((q: any) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      // Must have exactly 4 options
      if (opts.length !== (rules.options_count || 4)) return false;
      // Must have correct_option_id
      if (!q.correct_option_id) return false;
      // correct_option_id must exist in options
      if (!opts.some((o: any) => o.id === q.correct_option_id)) return false;
      // Valid difficulty
      if (!['easy', 'medium', 'hard'].includes(q.difficulty)) return false;
      // Topic validation
      if (normalizedTopics) {
        const tag = (q.topic_tag || q.topic || "").trim().toLowerCase();
        if (!tag || !normalizedTopics.has(tag)) return false;
      }
      return true;
    });

    if (validatedQuestions.length < allQuestions.length) {
      console.log(`[ai-worker] Profile validation: ${allQuestions.length - validatedQuestions.length} questions filtered out (including topic violations)`);
    }
  }

  // Create or update draft if we have questions
  if (validatedQuestions.length > 0 && !job.target_draft_id) {
    const p = job.params_json;
    const { data: draft } = await admin
      .from("question_drafts")
      .insert({
        created_by: job.created_by,
        country_id: p.country_id,
        exam_template_id: p.exam_template_id || null,
        section_id: p.section_id || null,
        difficulty: p.difficulty || "medium",
        count: validatedQuestions.length,
        generator_model: "google/gemini-2.5-flash",
        draft_questions_json: validatedQuestions,
        status: "pending_review",
      })
      .select("id")
      .single();

    if (draft) {
      await admin.from("ai_jobs").update({ target_draft_id: draft.id }).eq("id", job.id);
      console.log(`[ai-worker] ✅ Draft created: ${draft.id} with ${validatedQuestions.length} questions`);
    }
  } else if (validatedQuestions.length > 0 && job.target_draft_id) {
    await admin.from("question_drafts").update({
      draft_questions_json: validatedQuestions,
      count: validatedQuestions.length,
    }).eq("id", job.target_draft_id);
    console.log(`[ai-worker] ✅ Draft ${job.target_draft_id} updated with ${validatedQuestions.length} questions`);
  }

  // Determine final status
  const { data: finalItems } = await admin.from("ai_job_items").select("status, error").eq("job_id", job.id);
  const pending = finalItems?.filter((i: any) => i.status === "pending" || i.status === "running").length || 0;
  const failed = finalItems?.filter((i: any) => i.status === "failed").length || 0;
  const topicFailures = finalItems?.filter((i: any) => i.status === "failed" && i.error?.includes("Topic")).length || 0;

  if (pending > 0) {
    // Items still pending — set to failed with next_run_at for retry
    const backoff = exponentialBackoff(job.attempt_count || 1);
    await admin.from("ai_jobs").update({
      status: "failed",
      locked_by: null,
      locked_at: null,
      next_run_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } else if (topicFailures > 0 && validatedQuestions.length === 0) {
    // All items failed due to topic violations — needs admin review
    await admin.from("ai_jobs").update({
      status: "needs_review",
      last_error: `All items failed topic validation. ${topicFailures} topic-related failures.`,
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    }).eq("id", job.id);
    console.log(`[ai-worker] 🔍 Job ${job.id} → needs_review (finalization: all topic failures)`);
  } else if (failed === finalItems?.length) {
    // All items failed — schedule retry with backoff (claim_next_job guards max attempts)
    const backoff = exponentialBackoff(job.attempt_count || 1);
    await admin.from("ai_jobs").update({
      status: "failed",
      locked_by: null,
      locked_at: null,
      last_error: "All items failed",
      next_run_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    console.log(`[ai-worker] Job ${job.id} → failed (all items, retry in ${Math.round(backoff/1000)}s)`);
  } else {
    await releaseJob(admin, job.id, "succeeded");
  }
}

async function processReviewDraftJob(admin: any, job: any, apiKey: string) {
  const draftId = job.target_draft_id;
  if (!draftId) {
    await releaseJob(admin, job.id, "failed", "No target_draft_id");
    return;
  }

  // Delegate to existing review function logic
  const { data: draft } = await admin
    .from("question_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (!draft) {
    await releaseJob(admin, job.id, "failed", "Draft not found");
    return;
  }

  const questions = draft.draft_questions_json as any[];
  if (!questions || questions.length === 0) {
    await releaseJob(admin, job.id, "failed", "Draft has no questions");
    return;
  }

  // ── Crash Recovery: reset stale "running" items back to "pending" ──
  await admin
    .from("ai_job_items")
    .update({ status: "pending", started_at: null })
    .eq("job_id", job.id)
    .eq("status", "running");

  const { data: items } = await admin
    .from("ai_job_items")
    .select("*")
    .eq("job_id", job.id)
    .in("status", ["pending", "failed"])
    .order("item_index", { ascending: true });

  if (!items || items.length === 0) {
    // Finalize with previously succeeded items
    await finalizeReviewJob(admin, job, draftId);
    return;
  }

  const model = "google/gemini-2.5-pro";
  let totalDone = job.progress_done;
  let totalFailed = job.progress_failed;
  const allReviews: any[] = [];

  for (const item of items) {
    if (item.attempt_count >= MAX_ITEM_RETRIES && item.status === "failed") continue;

    await admin.from("ai_job_items").update({ status: "running", started_at: new Date().toISOString(), attempt_count: item.attempt_count + 1 }).eq("id", item.id);

    const batchQuestions = item.input_json.questions || [];
    const systemPrompt = `You are a Senior Exam Quality Reviewer. Review each question and return JSON: { "reviews": [{ "index": number, "ok": boolean, "score": number (0-10), "issues": string[], "suggestions": string[], "duplicate_risk": boolean, "quality_scores": { "confidence_score": number, "clarity_score": number, "difficulty_match": number, "single_answer_confidence": number, "language_quality": number, "language_consistency_score": number }, "corrected": { "text_ar": string, "options": [{"id":"a","textAr":string},{"id":"b","textAr":string},{"id":"c","textAr":string},{"id":"d","textAr":string}], "correct_option_id": string, "explanation": string, "difficulty": string, "topic": string } }] }. Return JSON ONLY.`;

    const userPrompt = `Review these ${batchQuestions.length} questions:\n${JSON.stringify(batchQuestions, null, 2)}\nReturn JSON ONLY.`;

    const result = await callGemini(admin, apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    if (!result.ok) {
      if (isRetryableError(result.status || 0) && item.attempt_count < MAX_ITEM_RETRIES) {
        await admin.from("ai_job_items").update({ status: "pending", error: result.error }).eq("id", item.id);
      } else {
        await admin.from("ai_job_items").update({ status: "failed", error: result.error, finished_at: new Date().toISOString() }).eq("id", item.id);
        totalFailed++;
      }
      await admin.from("ai_jobs").update({ progress_failed: totalFailed, last_error: result.error }).eq("id", job.id);
      continue;
    }

    try {
      const rawContent = result.data?.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(objMatch?.[0] || cleaned);
      const reviews = parsed.reviews || [];

      allReviews.push(...reviews);

      await admin.from("ai_job_items").update({
        status: "succeeded",
        output_json: { reviews },
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalDone++;
    } catch (parseError: any) {
      await admin.from("ai_job_items").update({
        status: "failed",
        error: `Parse error: ${parseError.message}`,
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalFailed++;
    }

    await admin.from("ai_jobs").update({ progress_done: totalDone, progress_failed: totalFailed }).eq("id", job.id);

    if (items.indexOf(item) < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Finalize review with all outputs (current + previous runs)
  await finalizeReviewJob(admin, job, draftId);
}

// ── Collect all review outputs and save to draft ──
async function finalizeReviewJob(admin: any, job: any, draftId: string) {
  const profileSnapshot = job.profile_snapshot_json;
  const { data: succeededItems } = await admin
    .from("ai_job_items")
    .select("output_json")
    .eq("job_id", job.id)
    .eq("status", "succeeded")
    .order("item_index", { ascending: true });

  const allReviews: any[] = [];
  for (const item of (succeededItems || [])) {
    const revs = item.output_json?.reviews;
    if (Array.isArray(revs)) allReviews.push(...revs);
  }

  if (allReviews.length > 0) {
    const correctedQuestions = allReviews
      .filter((r: any) => r.corrected)
      .sort((a: any, b: any) => a.index - b.index)
      .map((r: any) => r.corrected);

    const avgConfidence = allReviews.reduce((sum: number, r: any) => sum + (r.quality_scores?.confidence_score || 0), 0) / allReviews.length;

    // Use profile thresholds if available, otherwise defaults
    const thresholds = profileSnapshot?.psychometric_dna?.quality_gate_thresholds || {};
    const approveThreshold = thresholds.min_confidence || 0.85;
    const rejectThreshold = 0.70;

    let decision = "pending_review";
    if (avgConfidence >= approveThreshold) decision = "approved";
    else if (avgConfidence < rejectThreshold) decision = "needs_fix";

    await admin.from("question_drafts").update({
      corrected_questions_json: correctedQuestions.length > 0 ? correctedQuestions : null,
      reviewer_report_json: {
        overall_ok: allReviews.every((r: any) => r.ok),
        summary: `تمت مراجعة ${allReviews.length} سؤال — ثقة ${Math.round(avgConfidence * 100)}%`,
        issues_count: allReviews.filter((r: any) => !r.ok).length,
        reviews: allReviews,
        quality_gate: { decision, avg_confidence: avgConfidence },
      },
      reviewer_model: "google/gemini-2.5-pro",
      status: decision,
    }).eq("id", draftId);

    // ─── Auto-Publish if approved ────────────────────────────────────
    if (decision === "approved") {
      const { data: settingRow } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "auto_publish_enabled")
        .single();

      const autoPublishEnabled = settingRow?.value !== "false";

      if (autoPublishEnabled) {
        const { data: freshDraft } = await admin.from("question_drafts").select("*").eq("id", draftId).single();
        if (freshDraft) {
          const qToPublish = (correctedQuestions.length > 0 ? correctedQuestions : freshDraft.draft_questions_json) as any[];
          const dbRows = qToPublish.map((q: any) => ({
            country_id: freshDraft.country_id,
            exam_template_id: freshDraft.exam_template_id || null,
            section_id: q.section_id || freshDraft.section_id || null,
            topic: q.topic || "عام",
            difficulty: q.difficulty || freshDraft.difficulty || "medium",
            text_ar: q.text_ar,
            options: q.options,
            correct_option_id: q.correct_option_id,
            explanation: q.explanation || null,
            is_approved: true,
            status: "approved",
            source: "ai",
            draft_id: draftId,
            language: q.content_language || "ar",
          }));

          const { data: inserted, error: insertError } = await admin.from("questions").insert(dbRows).select("id");
          if (insertError) {
            console.error("[ai-worker] Auto-publish insert error:", insertError);
          } else {
            await admin.from("question_drafts").update({
              approved_by: job.created_by,
              approved_at: new Date().toISOString(),
              notes: `✅ نُشر تلقائياً (${inserted?.length || 0} سؤال) — ثقة ${Math.round(avgConfidence * 100)}%`,
            }).eq("id", draftId);
            console.log(`[ai-worker] 🚀 Auto-published ${inserted?.length || 0} questions from draft ${draftId}`);
          }
        }
      }
    }
  }

  // Determine final status
  const { data: finalItems } = await admin.from("ai_job_items").select("status").eq("job_id", job.id);
  const pending = finalItems?.filter((i: any) => i.status === "pending" || i.status === "running").length || 0;
  const failed = finalItems?.filter((i: any) => i.status === "failed").length || 0;

  if (pending > 0) {
    const backoff = exponentialBackoff(job.attempt_count || 1);
    await admin.from("ai_jobs").update({
      status: "failed",
      locked_by: null,
      locked_at: null,
      next_run_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } else if (failed === finalItems?.length) {
    // All review items failed — schedule retry with backoff
    const backoff = exponentialBackoff(job.attempt_count || 1);
    await admin.from("ai_jobs").update({
      status: "failed",
      locked_by: null,
      locked_at: null,
      last_error: "All review items failed",
      next_run_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    console.log(`[ai-worker] Job ${job.id} → failed (all review items, retry in ${Math.round(backoff/1000)}s)`);
  } else {
    await releaseJob(admin, job.id, "succeeded");
  }
}

async function processPublishDraftJob(admin: any, job: any) {
  const draftId = job.target_draft_id || job.params_json?.draft_id;
  if (!draftId) {
    await releaseJob(admin, job.id, "failed", "No draft_id");
    return;
  }

  const { data: draft } = await admin.from("question_drafts").select("*").eq("id", draftId).single();
  if (!draft) { await releaseJob(admin, job.id, "failed", "Draft not found"); return; }
  if (draft.status === "approved" && draft.approved_at) { await releaseJob(admin, job.id, "succeeded"); return; }

  const questions = (draft.corrected_questions_json || draft.draft_questions_json) as any[];
  if (!questions || questions.length === 0) { await releaseJob(admin, job.id, "failed", "No questions"); return; }

  const dbRows = questions.map((q: any) => ({
    country_id: draft.country_id,
    exam_template_id: draft.exam_template_id || null,
    section_id: q.section_id || draft.section_id || null,
    topic: q.topic || "عام",
    difficulty: q.difficulty || draft.difficulty || "medium",
    text_ar: q.text_ar,
    options: q.options,
    correct_option_id: q.correct_option_id,
    explanation: q.explanation || null,
    is_approved: true,
    status: "approved",
    source: "ai",
    draft_id: draft.id,
    language: q.content_language || "ar",
  }));

  const { data: inserted, error: insertError } = await admin.from("questions").insert(dbRows).select("id");
  if (insertError) {
    await releaseJob(admin, job.id, "failed", insertError.message);
    return;
  }

  await admin.from("question_drafts").update({
    status: "approved",
    approved_by: job.created_by,
    approved_at: new Date().toISOString(),
  }).eq("id", draftId);

  // Update item
  await admin.from("ai_job_items").update({
    status: "succeeded",
    output_json: { published_count: inserted?.length || 0 },
    finished_at: new Date().toISOString(),
  }).eq("job_id", job.id).eq("item_index", 0);

  await admin.from("ai_jobs").update({ progress_done: 1 }).eq("id", job.id);
  await releaseJob(admin, job.id, "succeeded");

  console.log(`[ai-worker] ✅ Published ${inserted?.length || 0} questions from draft ${draftId}`);
}

// ─── Main Worker Loop ────────────────────────────────────────────────
async function runWorker(admin: any, apiKey: string): Promise<{ processed: number; errors: string[] }> {
  const workerId = `worker-${crypto.randomUUID().substring(0, 8)}`;
  let processed = 0;
  const errors: string[] = [];

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await claimJob(admin, workerId);
    if (!job) {
      console.log(`[ai-worker] No more claimable jobs (processed ${processed})`);
      break;
    }

    // Check max attempts — exhausted → needs_review (not DLQ)
    if (job.attempt_count > MAX_JOB_ATTEMPTS) {
      const reason = `Max attempts (${MAX_JOB_ATTEMPTS}) exhausted for job type=${job.type}`;
      console.log(`[ai-worker] ⚠️ ${reason} — marking needs_review`);
      await admin.from("ai_jobs").update({
        status: "needs_review",
        last_error: reason,
        locked_by: null,
        locked_at: null,
        next_run_at: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      processed++;
      continue;
    }

    try {
      switch (job.type) {
        case "generate_draft":
          await processGenerateDraftJob(admin, job, apiKey);
          break;
        case "review_draft":
          await processReviewDraftJob(admin, job, apiKey);
          break;
        case "publish_draft":
          await processPublishDraftJob(admin, job);
          break;
        default:
          await releaseJob(admin, job.id, "failed", `Unknown job type: ${job.type}`);
      }
      processed++;
    } catch (e: any) {
      const errorMsg = e.message || "Unknown error";
      errors.push(`Job ${job.id}: ${errorMsg}`);
      console.error(`[ai-worker] Error processing job ${job.id}:`, e);

      // Set job back to failed for retry via claim_next_job
      const backoff = exponentialBackoff(job.attempt_count);
      await admin.from("ai_jobs").update({
        status: "failed",
        locked_by: null,
        locked_at: null,
        last_error: errorMsg,
        next_run_at: new Date(Date.now() + backoff).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      processed++;
    }
  }

  return { processed, errors };
}

// ─── HTTP Handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);

    // Optional: validate auth for manual triggers
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userSupabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userSupabase.auth.getUser();
      if (userData?.user) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
        if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    console.log("[ai-worker] 🚀 Worker run starting...");
    const result = await runWorker(admin, apiKey);
    console.log(`[ai-worker] ✅ Worker run complete: processed=${result.processed}`);

    return jsonResponse({
      ok: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (e) {
    console.error("[ai-worker] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
