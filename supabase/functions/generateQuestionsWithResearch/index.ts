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

// ─── Elite Exam Design Engine Prompt ─────────────────────────────────

function buildSystemPrompt(blueprint: ExamBlueprint): string {
  const bt = blueprint.exam.format.baseline_time_seconds;

  const sectionsDesc = blueprint.blueprint.sections
    .map(s => {
      const topicsStr = s.topics.length > 0 ? s.topics.join("، ") : "مواضيع عامة";
      const weightPct = `${Math.round(s.weight_range[0] * 100)}%-${Math.round(s.weight_range[1] * 100)}%`;
      return `  • ${s.name} (نسبة: ${weightPct}) — ${topicsStr}`;
    })
    .join("\n");

  return `You are the "Elite Exam Design Engine" (EEDE) for SARIS Exams. Your mission is to act as a professional Psychometrician and Exam Architect, not just a question generator.
You specialize in "${blueprint.exam.name}" in ${blueprint.exam.country}.

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

### OPERATIONAL PHASES:

═══════════════════════════════════════════════════
PHASE 1 — UNDERSTANDING & ANALYSIS
═══════════════════════════════════════════════════
- Parse exam structure and sections above.
- baseline_time = ${bt} seconds per question.
- Identify cognitive skills required for each section.
- Understand official exam style and standards.

═══════════════════════════════════════════════════
PHASE 2 — EXAM PLANNING & DESIGN
═══════════════════════════════════════════════════
Apply "Rhythm Difficulty" — do NOT randomize difficulty:
- Pattern: Easy → Medium → Easy → Medium → Hard → Medium → Easy → Hard
- Every 5-6 questions, insert a confidence-builder.

Ensure Cognitive Variation — never repeat same thinking type consecutively:
- direct, comparison, inference, concept_check, trap_detection, simplification

Difficulty Definitions:
- Easy: Simple, 1 step. Time: ${Math.round(bt * 0.6)}-${Math.round(bt * 1.0)} seconds.
- Medium: Reasoning, 1-2 steps. Time: ${Math.round(bt * 0.9)}-${Math.round(bt * 1.4)} seconds.
- Hard: Analytical/Combined, smart trap. Time: ${Math.round(bt * 1.2)}-${Math.round(bt * 1.8)} seconds.
⚠️ Difficulty = type of thinking, NOT length of solution.

═══════════════════════════════════════════════════
PHASE 3 — QUESTION CONSTRUCTION
═══════════════════════════════════════════════════
- Max Stem Lines: 2.
- 4 options (A, B, C, D) only.
- Smart Distractors based on common student mistakes.
- Single Correct Answer — no ambiguity.
- Answer must NOT be obvious from stem.
- Vary correct answer position.

Smart Difficulty Techniques:
1) Reverse Framing  2) Hidden Comparison  3) Familiar Surface
4) Trap Without Complexity  5) Shorter = Smarter

═══════════════════════════════════════════════════
PHASE 4 — DIFFICULTY CALIBRATION
═══════════════════════════════════════════════════
- Student discovers difficulty WHILE thinking, not from reading.
- Mix: Confidence Builders + Quiet Traps + Smart Inference.
- Difficulty NOT visible from question appearance.

═══════════════════════════════════════════════════
PHASE 5 — SELF-REVIEW (Quality Gate)
═══════════════════════════════════════════════════
Evaluate each question (1-10): clarity, difficulty_match, time_fit, official_style, trap_quality.
⚠️ If average score < 8, REGENERATE the question.

═══════════════════════════════════════════════════
PHASE 6 — OUTPUT FORMAT (JSON ONLY)
═══════════════════════════════════════════════════
Return JSON array ONLY — no text, no markdown:
[
  {
    "question_text": "نص السؤال (≤ سطرين)",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق",
    "topic": "اسم القسم/الموضوع",
    "difficulty": "easy|medium|hard",
    "thinking_type": "direct|comparison|inference|concept_check|trap_detection|simplification",
    "purpose": "speed|concept_check|comparison|inference|trap_detection|simplification",
    "expected_time_seconds": 45
  }
]

### GENERAL CONSTRAINTS:
1. Academic Arabic — formal, precise, exam-grade language.
2. Localization — use Qiyas terms for Saudi, Kuwait University terms for Kuwait.
3. No answer leaked in stem.
4. Concise explanation — 1-2 sentences max.
5. No pattern repetition more than twice consecutively.
6. Distribute questions across sections evenly per weights above.`;
}

function buildUserPrompt(blueprint: ExamBlueprint, difficulty: string): string {
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || difficulty;

  return `Generate ${blueprint.exam.format.questions_total} questions at difficulty level "${diffAr}" for "${blueprint.exam.name}".
Apply all 6 EEDE phases (Understanding → Planning → Construction → Calibration → Self-Review → Output).
Distribute questions across sections per defined weights.
⚠️ Return JSON array ONLY — no markdown, no explanation.`;
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
        model: "google/gemini-2.5-flash",
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

    const dbRows = questions.map((q: any) => {
      const optionIds = ["a", "b", "c", "d"];
      const options = (q.options || []).map((text: string, i: number) => ({
        id: optionIds[i] || `opt_${i}`,
        textAr: text,
      }));
      const correctIdx = typeof q.correct_answer_index === "number" ? q.correct_answer_index : 0;

      return {
        country_id: params.country,
        exam_template_id: params.examTemplateId || null,
        topic: q.topic || blueprint.exam.name,
        difficulty: q.difficulty || params.difficulty || "medium",
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
