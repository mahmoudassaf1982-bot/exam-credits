import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateRequest {
  country: string;
  examTemplateId?: string | null;
  numberOfQuestions: number;
  difficulty: string;
  debug?: boolean;
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: jsonHeaders });
}

function buildStrictJsonSchema(questionCount: number) {
  return {
    type: "array",
    minItems: questionCount,
    maxItems: questionCount,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["question_text", "options", "correct_answer", "explanation", "metadata"],
      properties: {
        question_text: { type: "string" },
        options: {
          type: "object",
          additionalProperties: false,
          required: ["A", "B", "C", "D"],
          properties: {
            A: { type: "string" },
            B: { type: "string" },
            C: { type: "string" },
            D: { type: "string" },
          },
        },
        correct_answer: { type: "string", enum: ["A", "B", "C", "D"] },
        explanation: { type: "string" },
        metadata: {
          type: "object",
          additionalProperties: true,
          required: ["difficulty", "expected_time_seconds", "source_refs"],
          properties: {
            section: { type: "string" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            thinking_type: { type: "string" },
            purpose: { type: "string" },
            expected_time_seconds: { type: "number" },
            source_refs: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

function parseQuestionsFromRaw(raw: string):
  | { ok: true; questions: any[]; normalized: string }
  | { ok: false; reason: string; parsingError?: string; candidate?: string } {
  const withoutFences = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);
  const objectMatch = withoutFences.match(/\{[\s\S]*\}/);
  const extracted = (arrayMatch?.[0] || objectMatch?.[0] || withoutFences).trim();

  const attempts = [
    extracted,
    extracted
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, ""),
  ];

  let lastError = "UNKNOWN_PARSE_ERROR";
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        return { ok: false, reason: "PARSED_JSON_IS_NOT_ARRAY", candidate: candidate.substring(0, 2000) };
      }
      if (parsed.length === 0) {
        return { ok: false, reason: "PARSED_ARRAY_IS_EMPTY", candidate: candidate.substring(0, 2000) };
      }
      return { ok: true, questions: parsed, normalized: candidate };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "UNKNOWN_PARSE_ERROR";
    }
  }

  return {
    ok: false,
    reason: "INVALID_OR_EMPTY_JSON",
    parsingError: lastError,
    candidate: extracted.substring(0, 2000),
  };
}
// ─── Blueprint Types ─────────────────────────────────────────────────

interface ExamBlueprint {
  exam: {
    name: string;
    country: string;
    language: string;
    format: {
      questions_total: number;
      duration_minutes: number;
      mcq_options_count: number;
      baseline_time_seconds: number;
    };
  };
  blueprint: {
    sections: {
      id: string;
      name: string;
      topics: string[];
      weight_range: [number, number];
    }[];
  };
}

// ─── Blueprint Builder ───────────────────────────────────────────────

async function buildBlueprint(
  supabase: any,
  params: GenerateRequest
): Promise<ExamBlueprint> {
  const { data: countryData } = await supabase
    .from("countries")
    .select("name_ar")
    .eq("id", params.country)
    .single();
  const countryName = countryData?.name_ar || params.country;

  let examName = "اختبار عام";
  let durationSec = 7200;
  let defaultQCount = 100;

  if (params.examTemplateId) {
    const { data: examData } = await supabase
      .from("exam_templates")
      .select("name_ar, default_time_limit_sec, default_question_count")
      .eq("id", params.examTemplateId)
      .single();
    if (examData) {
      examName = examData.name_ar;
      durationSec = examData.default_time_limit_sec || 7200;
      defaultQCount = examData.default_question_count || 100;
    }
  }

  let sections: ExamBlueprint["blueprint"]["sections"] = [];
  if (params.examTemplateId) {
    const { data: sectionData } = await supabase
      .from("exam_sections")
      .select("id, name_ar, question_count, topic_filter_json")
      .eq("exam_template_id", params.examTemplateId)
      .order("order");

    if (sectionData && sectionData.length > 0) {
      const totalQ = sectionData.reduce((s: number, sec: any) => s + (sec.question_count || 0), 0) || defaultQCount;
      sections = sectionData.map((sec: any) => ({
        id: sec.id,
        name: sec.name_ar,
        topics: Array.isArray(sec.topic_filter_json) ? sec.topic_filter_json : [],
        weight_range: [
          Math.max(0, ((sec.question_count || 0) / totalQ) - 0.05),
          Math.min(1, ((sec.question_count || 0) / totalQ) + 0.05),
        ] as [number, number],
      }));
    }
  }

  if (sections.length === 0) {
    sections = [{ id: "general", name: examName, topics: [], weight_range: [1.0, 1.0] }];
  }

  const baselineTime = Math.round(durationSec / params.numberOfQuestions);

  return {
    exam: {
      name: examName,
      country: countryName,
      language: "ar",
      format: {
        questions_total: params.numberOfQuestions,
        duration_minutes: Math.round(durationSec / 60),
        mcq_options_count: 4,
        baseline_time_seconds: baselineTime,
      },
    },
    blueprint: { sections },
  };
}

// ─── Elite Exam Design Engine V2 Prompt ──────────────────────────────

function buildSystemPrompt(blueprint: ExamBlueprint): string {
  const bt = blueprint.exam.format.baseline_time_seconds;

  const sectionsDesc = blueprint.blueprint.sections
    .map(s => {
      const topicsStr = s.topics.length > 0 ? s.topics.join("، ") : "مواضيع عامة";
      const weightPct = `${Math.round(s.weight_range[0] * 100)}%-${Math.round(s.weight_range[1] * 100)}%`;
      return `  • ${s.name} (نسبة: ${weightPct}) — ${topicsStr}`;
    })
    .join("\n");

  return `You are the **Elite Exam Design Engine (EEDE)** for **SARIS Exams**. You act as a professional **Psychometrician** + **Exam Architect**.

You are used inside the \`generateQuestionsWithResearch\` Edge Function. Research is already provided to you as structured notes/sources; use ONLY those sources—do NOT invent or browse.

Your single job: generate questions that **match the official exam style**, **time constraints**, and **difficulty definition** (Easy/Medium/Hard) using a scientific, repeatable methodology.

═══ EXAM IDENTITY ═══
• Name: ${blueprint.exam.name}
• Country: ${blueprint.exam.country}
• Language: Arabic
• Questions Required: ${blueprint.exam.format.questions_total}
• Duration: ${blueprint.exam.format.duration_minutes} minutes
• baseline_time per question: ${bt} seconds
• Options Count: ${blueprint.exam.format.mcq_options_count}

═══ SECTIONS ═══
${sectionsDesc}

---

## OPERATIONAL PHASES (DO NOT SKIP)

### PHASE 1 — UNDERSTANDING
1) Parse the exam spec above.
2) baseline_time = ${bt} seconds per question.
3) Determine per-question time targets by difficulty:
   - Easy: 0.70–0.90 × baseline_time = ${Math.round(bt * 0.7)}-${Math.round(bt * 0.9)} seconds
   - Medium: 0.90–1.20 × baseline_time = ${Math.round(bt * 0.9)}-${Math.round(bt * 1.2)} seconds
   - Hard: 1.20–1.60 × baseline_time = ${Math.round(bt * 1.2)}-${Math.round(bt * 1.6)} seconds
4) If the request is for a single section/difficulty, still respect the global duration via expected_time_seconds.

### PHASE 2 — PLANNING (Blueprint + Rhythm)
1) Build a mini-blueprint for this generation call:
   - distribute questions exactly by requested count, difficulty, section scope per weights above.
2) Apply **Rhythm Difficulty** within the generated batch:
   - No more than 2 consecutive questions with identical pattern/structure.
3) Apply **Cognitive Variation** across the batch:
   - Rotate thinking_type among (Recall, Procedure, Reasoning, Multi-Concept, Interpretation).
   - Rotate purpose among (Skill-check, Trap-check, Speed-check, Concept-check).

### PHASE 3 — CONSTRUCTION (Item Writing Rules)
Hard constraints:
- Academic Arabic (clear, exam-like, no slang).
- Localization:
  - Kuwait: University aptitude tone/terms.
  - Saudi: Qiyas tone/terms.
- Max stem lines: **2** (short, direct).
- 4 options ONLY (A,B,C,D).
- Exactly **one** correct answer.
- **Smart distractors**:
  - plausible, same unit/type as correct
  - reflect common mistakes
  - no obviously longer/shorter option pattern
- No answer hinted inside the stem.
- Avoid repeating the same correct letter more than twice in a row across the batch.
- No repeated template/pattern more than twice across the batch.

### PHASE 4 — DIFFICULTY CALIBRATION (Scientific Definition)
Difficulty MUST match the chosen level:
- Easy: 1 direct step, minimal manipulation, familiar numbers.
- Medium: 1–2 steps, requires choosing method, light reasoning.
- Hard: analytical/combined concepts OR non-obvious approach; still solvable within time target.

Time-Based Difficulty rule:
- If your solution realistically exceeds expected_time_seconds for that difficulty band, simplify the item (NOT the options count).

### PHASE 5 — SELF-REVIEW (Quality Gate)
Score each question (0–10) on:
- clarity, difficulty_match, time_fit, official_style_match, distractor_quality, trap_quality
If any question score < 8 → regenerate that question ONLY (keep batch size fixed).

### PHASE 6 — OUTPUT FORMAT (JSON ONLY)
Return **JSON array ONLY** (no markdown, no extra text) with this schema per item:
{
  "question_text": string,
  "options": { "A": string, "B": string, "C": string, "D": string },
  "correct_answer": "A" | "B" | "C" | "D",
  "explanation": string,
  "metadata": {
    "section": string,
    "difficulty": "easy" | "medium" | "hard",
    "thinking_type": string,
    "purpose": string,
    "expected_time_seconds": number,
    "source_refs": string[]
  }
}

### PHASE 7 — EXPLANATION PLACEMENT (MANDATORY)
The "explanation" field must:
- Start by confirming the correct choice briefly (without repeating the full options).
- Then give the shortest reasoning that proves it.
- Stay directly tied to the stem and computed result.
- Avoid long derivations.

---

## RESEARCH RULES (for generateQuestionsWithResearch)
- Use ONLY official_sources provided in the input.
- If official_sources is empty, leave source_refs = [].
- Never invent citations, URLs, or claims.

## FINAL GUARANTEE
You must generate EXACTLY the requested number of questions, matching:
- the requested difficulty and section scope,
- the official style notes,
- and the timing constraints derived from duration_minutes and total_questions.

### GENERAL CONSTRAINTS:
1. Academic Arabic — formal, precise, exam-grade language.
2. Localization — use Qiyas terms for Saudi, Kuwait University terms for Kuwait.
3. No answer leaked in stem.
4. Concise explanation — 1-3 sentences max.
5. No pattern repetition more than twice consecutively.
6. Distribute questions across sections evenly per weights above.`;
}

function buildUserPrompt(blueprint: ExamBlueprint, difficulty: string, liteMode: boolean): string {
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || difficulty;

  if (liteMode) {
    return `Generate exactly ${blueprint.exam.format.questions_total} questions only.
Return JSON array only with keys: question_text, options(A/B/C/D), correct_answer, explanation, metadata.
Keep each question short (<=2 lines), Arabic formal style, and no extra prose.`;
  }

  return `Generate exactly ${blueprint.exam.format.questions_total} questions at difficulty level "${diffAr}" for "${blueprint.exam.name}".
Apply all 7 EEDE phases (Understanding → Planning → Construction → Calibration → Self-Review → Output → Explanation).
Distribute questions across sections per defined weights.
⚠️ Return JSON array ONLY — no markdown, no explanation outside JSON.`;
}

// ─── Main Handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let stage = "validate_input";
  let debug = false;
  const debugDetails: Record<string, unknown> = {};

  try {
    const params: GenerateRequest = await req.json();
    debug = Boolean(params?.debug);

    if (debug) {
      debugDetails.request = {
        country: params?.country,
        examTemplateId: params?.examTemplateId ?? null,
        numberOfQuestions: params?.numberOfQuestions,
        difficulty: params?.difficulty,
      };
    }

    if (!params?.country || !params?.difficulty || !Number.isFinite(params?.numberOfQuestions) || params.numberOfQuestions < 1) {
      return jsonResponse({
        ok: false,
        stage,
        error: "INVALID_INPUT",
        details: {
          message: "country, difficulty, numberOfQuestions are required",
          ...(debug ? debugDetails : {}),
        },
      }, 400);
    }

    console.log("[generateQuestionsWithResearch] params:", JSON.stringify(params));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({
        ok: false,
        stage,
        error: "MISSING_API_KEY",
        details: { ...(debug ? debugDetails : {}) },
      }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const blueprint = await buildBlueprint(supabase, params);
    console.log("[generateQuestionsWithResearch] Blueprint:", JSON.stringify({
      exam: blueprint.exam.name,
      sections: blueprint.blueprint.sections.length,
      baseline_time: blueprint.exam.format.baseline_time_seconds,
    }));

    stage = "call_model";

    const liteMode = params.numberOfQuestions === 1;
    const systemPrompt = buildSystemPrompt(blueprint);
    const userPrompt = buildUserPrompt(blueprint, params.difficulty, liteMode);

    const model = params.numberOfQuestions <= 3
      ? "google/gemini-3-flash-preview"
      : "google/gemini-2.5-flash";

    console.log("[generateQuestionsWithResearch] Using model:", model, "for", params.numberOfQuestions, "questions", "liteMode:", liteMode);

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "generated_exam_questions",
          strict: true,
          schema: buildStrictJsonSchema(params.numberOfQuestions),
        },
      },
    };

    let aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (aiResponse.status === 400) {
      const errText = await aiResponse.text();
      console.warn("[generateQuestionsWithResearch] response_format rejected, retrying without schema:", errText.substring(0, 300));

      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      const status = aiResponse.status;
      return jsonResponse({
        ok: false,
        stage,
        error: status === 429
          ? "RATE_LIMITED"
          : status === 402
            ? "INSUFFICIENT_CREDITS"
            : "AI_GATEWAY_ERROR",
        details: {
          status,
          response_excerpt: errText.substring(0, 1200),
          ...(debug ? debugDetails : {}),
        },
      }, status === 429 || status === 402 ? status : 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    const rawOutputLength = rawContent.length;
    const rawOutputExcerpt = rawContent.substring(0, 500);

    console.log("[generateQuestionsWithResearch] AI response length:", rawOutputLength);
    console.log("[generateQuestionsWithResearch] AI raw response preview:", rawOutputExcerpt);

    if (debug) {
      debugDetails.raw_output_length = rawOutputLength;
      debugDetails.raw_output_excerpt = rawOutputExcerpt;
      debugDetails.model = model;
    }

    stage = "parse_output";

    const parsed = parseQuestionsFromRaw(rawContent);
    if (!parsed.ok) {
      return jsonResponse({
        ok: false,
        stage,
        error: "FAILED_TO_PARSE_MODEL_OUTPUT",
        details: {
          reason: parsed.reason,
          parsing_error: parsed.parsingError || null,
          extracted_candidate_excerpt: parsed.candidate?.substring(0, 500) || null,
          ...(debug ? debugDetails : {}),
        },
      }, 500);
    }

    const questions = parsed.questions;

    if (questions.length !== params.numberOfQuestions) {
      return jsonResponse({
        ok: false,
        stage,
        error: "QUESTION_COUNT_MISMATCH",
        details: {
          requested: params.numberOfQuestions,
          received: questions.length,
          ...(debug ? debugDetails : {}),
        },
      }, 500);
    }

    stage = "normalize";

    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const optionIds = ["a", "b", "c", "d"];
    const dbRows: any[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const missingFields: string[] = [];

      if (!q || typeof q !== "object") missingFields.push("question_object");
      if (!q?.question_text || typeof q.question_text !== "string") missingFields.push("question_text");
      if (!q?.options) missingFields.push("options");
      if (!q?.correct_answer && typeof q?.correct_answer_index !== "number") missingFields.push("correct_answer");
      if (typeof q?.explanation !== "string" || !q.explanation.trim()) missingFields.push("explanation");

      let optionsArr: string[] = [];
      if (q?.options && typeof q.options === "object" && !Array.isArray(q.options)) {
        optionsArr = [q.options.A, q.options.B, q.options.C, q.options.D].filter(Boolean);
      } else if (Array.isArray(q?.options)) {
        optionsArr = q.options.filter((opt: unknown) => typeof opt === "string");
      }
      if (optionsArr.length !== 4) missingFields.push("options[4]");

      if (missingFields.length > 0) {
        return jsonResponse({
          ok: false,
          stage,
          error: "SCHEMA_MISMATCH",
          details: {
            index: i,
            missing_fields: missingFields,
            question_excerpt: typeof q?.question_text === "string" ? q.question_text.substring(0, 140) : null,
            ...(debug ? debugDetails : {}),
          },
        }, 500);
      }

      const options = optionsArr.map((text: string, idx: number) => ({
        id: optionIds[idx] || `opt_${idx}`,
        textAr: text,
      }));

      let correctIdx = 0;
      if (q.correct_answer && typeof q.correct_answer === "string") {
        correctIdx = letterToIndex[q.correct_answer.toUpperCase()] ?? -1;
      } else if (typeof q.correct_answer_index === "number") {
        correctIdx = q.correct_answer_index;
      }

      if (correctIdx < 0 || correctIdx > 3) {
        return jsonResponse({
          ok: false,
          stage,
          error: "SCHEMA_MISMATCH",
          details: {
            index: i,
            missing_fields: ["correct_answer_validity"],
            ...(debug ? debugDetails : {}),
          },
        }, 500);
      }

      const section = q.metadata?.section || q.topic || blueprint.exam.name;
      const difficulty = q.metadata?.difficulty || q.difficulty || params.difficulty || "medium";

      const row = {
        country_id: params.country,
        exam_template_id: params.examTemplateId || null,
        section_id: null,
        topic: section,
        difficulty,
        text_ar: q.question_text,
        options,
        correct_option_id: optionIds[correctIdx],
        explanation: q.explanation,
        is_approved: false,
        source: "ai",
      };

      dbRows.push(row);
    }

    stage = "db_insert";

    const { data: inserted, error: insertError } = await supabase
      .from("questions")
      .insert(dbRows)
      .select();

    if (insertError) {
      const likelyField =
        insertError.message.match(/column\s+"([^"]+)"/i)?.[1] ||
        insertError.details?.match(/\(([^)]+)\)/)?.[1] ||
        null;

      return jsonResponse({
        ok: false,
        stage,
        error: "DB_INSERT_FAILED",
        details: {
          message: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
          db_details: insertError.details,
          likely_field: likelyField,
          ...(debug ? debugDetails : {}),
        },
      }, 500);
    }

    stage = "done";
    console.log("[generateQuestionsWithResearch] ✅ Inserted", inserted?.length, "questions");

    return jsonResponse({
      ok: true,
      stage,
      success: true,
      count: inserted?.length || 0,
      questions: inserted || [],
      ...(debug ? { details: debugDetails } : {}),
    });
  } catch (e) {
    console.error("[generateQuestionsWithResearch] Error:", e);
    return jsonResponse({
      ok: false,
      stage,
      error: e instanceof Error ? e.message : "حدث خطأ أثناء توليد الأسئلة.",
      details: debug ? debugDetails : {},
    }, 500);
  }
});
