import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateRequest {
  mode: "automatic" | "custom";
  subject?: string;
  topic?: string;
  difficulty?: string;
  count?: number;
  countryId?: string;
}

const EEDE_SYSTEM_PROMPT = `You are the **Elite Exam Design Engine (EEDE)** for **SARIS Exams**. You act as a professional **Psychometrician** + **Exam Architect**.

You are used inside the \`generate-questions\` Edge Function (NO web research; rely ONLY on provided exam spec + stored blueprint).

Your single job: generate questions that **match the official exam style**, **time constraints**, and **difficulty definition** (Easy/Medium/Hard) using a scientific, repeatable methodology.

---

## OPERATIONAL PHASES (DO NOT SKIP)

### PHASE 1 — UNDERSTANDING
1) Parse the exam spec.
2) Compute: baseline_time = (duration_minutes * 60) / total_questions
3) Determine per-question time targets by difficulty:
   - Easy: 0.70–0.90 × baseline_time
   - Medium: 0.90–1.20 × baseline_time
   - Hard: 1.20–1.60 × baseline_time
4) If the request is for a single section/difficulty, you MUST still respect the global duration via expected_time_seconds.

### PHASE 2 — PLANNING (Blueprint + Rhythm)
1) Build a mini-blueprint for this generation call:
   - distribute questions exactly by requested_generation (count, difficulty, section scope)
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
- clarity
- difficulty_match
- time_fit
- official_style_match
- distractor_quality
- trap_quality (where appropriate)

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
    "expected_time_seconds": number
  }
}

### PHASE 7 — EXPLANATION PLACEMENT (MANDATORY)
The "explanation" field must:
- Start by confirming the correct choice briefly (without repeating the full options).
- Then give the shortest reasoning that proves it.
- Stay directly tied to the stem and computed result.
- Avoid long derivations.

---

## FINAL GUARANTEE
You must generate EXACTLY the requested number of questions, matching:
- the requested difficulty and section scope,
- the official style notes,
- and the timing constraints derived from duration_minutes and total_questions.

### GENERAL CONSTRAINTS:
1. Academic Arabic — formal, precise, exam-grade language.
2. Localization — use Qiyas terms for Saudi, Kuwait University terms for Kuwait.
3. No answer leaked in stem — the stem must not hint at the correct option.
4. Concise explanation — directly under the answer, 1-3 sentences max.
5. No pattern repetition — same thinking type must not appear more than twice consecutively.
6. Distribute questions across sections evenly.`;

function buildPrompt(params: GenerateRequest): { system: string; user: string } {
  if (params.mode === "automatic") {
    const system = `${EEDE_SYSTEM_PROMPT}

═══ هيكل الاختبار ═══
• اختبار قدرات جامعة الكويت
• total_questions: 15
• duration_minutes: 18
• baseline_time: 72 seconds
• 5 أسئلة رياضيات (جبر، هندسة، تحليل) — نسبة: ~33%
• 5 أسئلة لغة إنجليزية (قواعد، مفردات، فهم) — نسبة: ~33%
• 5 أسئلة لغة عربية (نحو، صرف، بلاغة) — نسبة: ~33%`;

    return {
      system,
      user: `Generate exactly 15 questions for Kuwait University Aptitude Test (5 Math + 5 English + 5 Arabic) with varied difficulty levels.
Apply all 7 EEDE phases. Return JSON array ONLY.`,
    };
  }

  const subjectMap: Record<string, string> = {
    mathematics: "الرياضيات", english: "اللغة الإنجليزية", arabic: "اللغة العربية",
  };
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

  const subjectAr = subjectMap[params.subject || "mathematics"] || params.subject;
  const diffAr = diffMap[params.difficulty || "medium"] || params.difficulty;
  const count = Math.min(Math.max(params.count || 5, 1), 50);
  const topicText = params.topic ? ` في موضوع "${params.topic}"` : "";

  const system = `${EEDE_SYSTEM_PROMPT}

═══ التخصص ═══
• المادة: ${subjectAr}`;

  return {
    system,
    user: `Generate exactly ${count} questions in ${subjectAr}${topicText} at difficulty level "${diffAr}".
Apply all 7 EEDE phases. Return JSON array ONLY.`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: GenerateRequest = await req.json();
    console.log("[generate-questions] mode:", params.mode);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { system, user } = buildPrompt(params);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-questions] AI error:", aiResponse.status, errText);
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

    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let questions: any[];
    try {
      questions = JSON.parse(jsonStr);
    } catch {
      console.error("[generate-questions] JSON parse error, raw:", jsonStr.substring(0, 500));
      throw new Error("فشل في تحليل استجابة الذكاء الاصطناعي");
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("لم يتم توليد أي أسئلة");
    }

    const countryId = params.countryId || "kw";
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

      const section = q.metadata?.section || q.topic || params.subject || "عام";
      const difficulty = q.metadata?.difficulty || q.difficulty || params.difficulty || "medium";

      return {
        country_id: countryId,
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: inserted, error: insertError } = await supabase
      .from("questions")
      .insert(dbRows)
      .select();

    if (insertError) {
      console.error("[generate-questions] Insert error:", insertError);
      throw new Error("فشل في حفظ الأسئلة: " + insertError.message);
    }

    console.log("[generate-questions] ✅ Inserted", inserted?.length, "questions");

    return new Response(JSON.stringify({ success: true, questions: inserted, count: inserted?.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-questions] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
