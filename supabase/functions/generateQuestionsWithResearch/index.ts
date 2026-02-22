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

function buildUserPrompt(blueprint: ExamBlueprint, difficulty: string): string {
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || difficulty;

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

  try {
    const params: GenerateRequest = await req.json();
    console.log("[generateQuestionsWithResearch] params:", JSON.stringify(params));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const blueprint = await buildBlueprint(supabase, params);
    console.log("[generateQuestionsWithResearch] Blueprint:", JSON.stringify({
      exam: blueprint.exam.name,
      sections: blueprint.blueprint.sections.length,
      baseline_time: blueprint.exam.format.baseline_time_seconds,
    }));

    const systemPrompt = buildSystemPrompt(blueprint);
    const userPrompt = buildUserPrompt(blueprint, params.difficulty);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generateQuestionsWithResearch] AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول مرة أخرى لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد للمنصة" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    console.log("[generateQuestionsWithResearch] AI response length:", rawContent.length);

    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let questions: any[];
    try {
      questions = JSON.parse(jsonStr);
    } catch {
      console.error("[generateQuestionsWithResearch] JSON parse error, raw:", jsonStr.substring(0, 500));
      throw new Error("فشل في تحليل استجابة الذكاء الاصطناعي");
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("لم يتم توليد أي أسئلة");
    }

    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const optionIds = ["a", "b", "c", "d"];

    const dbRows = questions.map((q: any) => {
      // Support both new format (options as object {A,B,C,D}) and legacy (array)
      let optionsArr: string[];
      if (q.options && typeof q.options === "object" && !Array.isArray(q.options)) {
        optionsArr = [q.options.A, q.options.B, q.options.C, q.options.D];
      } else {
        optionsArr = q.options || [];
      }

      const options = optionsArr.map((text: string, i: number) => ({
        id: optionIds[i] || `opt_${i}`,
        textAr: text,
      }));

      // Support both new format (correct_answer: "A") and legacy (correct_answer_index: 0)
      let correctIdx = 0;
      if (q.correct_answer && typeof q.correct_answer === "string") {
        correctIdx = letterToIndex[q.correct_answer.toUpperCase()] ?? 0;
      } else if (typeof q.correct_answer_index === "number") {
        correctIdx = q.correct_answer_index;
      }

      const section = q.metadata?.section || q.topic || blueprint.exam.name;
      const difficulty = q.metadata?.difficulty || q.difficulty || params.difficulty || "medium";

      return {
        country_id: params.country,
        exam_template_id: params.examTemplateId || null,
        topic: section,
        difficulty,
        text_ar: q.question_text,
        options: JSON.stringify(options),
        correct_option_id: optionIds[correctIdx] || "a",
        explanation: q.explanation || null,
        is_approved: false,
        source: "ai",
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("questions")
      .insert(dbRows)
      .select();

    if (insertError) {
      console.error("[generateQuestionsWithResearch] Insert error:", insertError);
      throw new Error("فشل في حفظ الأسئلة: " + insertError.message);
    }

    console.log("[generateQuestionsWithResearch] ✅ Inserted", inserted?.length, "questions");

    return new Response(JSON.stringify({ success: true, questions: inserted, count: inserted?.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generateQuestionsWithResearch] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "حدث خطأ أثناء توليد الأسئلة." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
