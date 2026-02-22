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

const EEDE_SYSTEM_PROMPT = `You are the "Elite Exam Design Engine" (EEDE) for SARIS Exams. Your mission is to act as a professional Psychometrician and Exam Architect, not just a question generator.

### OPERATIONAL PHASES:

═══════════════════════════════════════════════════
PHASE 1 — UNDERSTANDING & ANALYSIS
═══════════════════════════════════════════════════
- Parse Exam Name, Target Country (Kuwait/Saudi), Sections, Duration, Difficulty.
- Calculate baseline_time = (Duration in seconds) / Total Questions.
- Identify the cognitive skills required for each section.
- Understand the official exam style and standards.

═══════════════════════════════════════════════════
PHASE 2 — EXAM PLANNING & DESIGN
═══════════════════════════════════════════════════
Apply "Rhythm Difficulty" — do NOT randomize difficulty:
- Pattern: Easy → Medium → Easy → Medium → Hard → Medium → Easy → Hard
- Every 5-6 questions, insert a confidence-builder (quick/easy question).

Ensure Cognitive Variation — never repeat the same thinking type consecutively:
- direct (مباشر)
- comparison (مقارنة)
- inference (استنتاج)
- concept_check (فهم مفهوم)
- trap_detection (كشف خطأ شائع)
- simplification (اختصار ذهني)

Difficulty Definitions:
- Easy: Simple, 1 step, direct recall. Time: 0.6–1.0 × baseline.
- Medium: Reasoning, 1-2 steps, requires basic analysis. Time: 0.9–1.4 × baseline.
- Hard: Analytical/Combined, smart trap or logical puzzle, NOT lengthy. Time: 1.2–1.8 × baseline.
⚠️ Difficulty = type of thinking, NOT length of solution.

═══════════════════════════════════════════════════
PHASE 3 — QUESTION CONSTRUCTION
═══════════════════════════════════════════════════
- Max Stem Lines: 2 (short, clear, professional).
- 4 options (A, B, C, D) only.
- Smart Distractors: each wrong option represents a common student mistake.
- Single Correct Answer — no ambiguity.
- Answer must NOT be obvious from the stem.
- Correct answer position must vary (don't always put it in the same slot).

Smart Difficulty Techniques:
1) Reverse Framing: Ask about the condition instead of the direct answer.
2) Hidden Comparison: Make the comparison implicit.
3) Familiar Surface: Question looks simple but requires careful attention.
4) Trap Without Complexity: The trap is a common mistake, not added complexity.
5) Shorter = Smarter: Shorter questions feel more official and professional.

═══════════════════════════════════════════════════
PHASE 4 — DIFFICULTY CALIBRATION
═══════════════════════════════════════════════════
- Easy: Direct knowledge, single concept, fast solution.
- Medium: Requires reasoning or connecting two concepts.
- Hard: Analytical thinking, combining concepts, or detecting a subtle trap.
- The student should discover difficulty WHILE thinking, not from reading the question.

Elite Touch — Exam Committee Style:
- Not every question should feel "special" — some should look ordinary but test hidden skills.
- Mix: Confidence Builders + Quiet Traps + Smart Inference questions.
- Difficulty should NOT be visible from the question's appearance.

═══════════════════════════════════════════════════
PHASE 5 — SELF-REVIEW (Quality Gate)
═══════════════════════════════════════════════════
Before outputting each question, evaluate on these criteria (score 1-10):
- clarity: Is the question clear and unambiguous?
- difficulty_match: Does it match the intended difficulty level?
- time_fit: Can it be solved within the expected time?
- official_style: Does it feel like a real official exam question?
- trap_quality: Are distractors smart and based on common mistakes?

⚠️ If average score < 8, REGENERATE the question.

═══════════════════════════════════════════════════
PHASE 6 — OUTPUT FORMAT (JSON ONLY)
═══════════════════════════════════════════════════
Return JSON array ONLY — no text, no markdown, no explanation before or after:
[
  {
    "question_text": "نص السؤال (≤ سطرين)",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق (جملة أو جملتين)",
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
3. No answer leaked in stem — the stem must not hint at the correct option.
4. Concise explanation — directly under the answer, 1-2 sentences max.
5. No pattern repetition — same thinking type must not appear more than twice consecutively.
6. Distribute questions across sections evenly — no more than 2 consecutive from the same section.`;

function buildPrompt(params: GenerateRequest): { system: string; user: string } {
  if (params.mode === "automatic") {
    const system = `${EEDE_SYSTEM_PROMPT}

═══ هيكل الاختبار ═══
• اختبار قدرات جامعة الكويت
• 5 أسئلة رياضيات (جبر، هندسة، تحليل) — نسبة: ~33%
• 5 أسئلة لغة إنجليزية (قواعد، مفردات، فهم) — نسبة: ~33%
• 5 أسئلة لغة عربية (نحو، صرف، بلاغة) — نسبة: ~33%
• baseline_time ≈ 72 ثانية لكل سؤال`;

    return {
      system,
      user: `Generate 15 questions for Kuwait University Aptitude Test (5 Math + 5 English + 5 Arabic) with varied difficulty levels.
Apply Rhythm Difficulty, Cognitive Variation, and Smart Difficulty Techniques.
⚠️ Return JSON array ONLY.`,
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
    user: `Generate ${count} questions in ${subjectAr}${topicText} at difficulty level "${diffAr}".
Apply all 6 EEDE phases. Return JSON array ONLY.`,
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
    const dbRows = questions.map((q: any) => {
      const optionIds = ["a", "b", "c", "d"];
      const options = (q.options || []).map((text: string, i: number) => ({
        id: optionIds[i] || `opt_${i}`,
        textAr: text,
      }));
      const correctIdx = typeof q.correct_answer_index === "number" ? q.correct_answer_index : 0;

      return {
        country_id: countryId,
        topic: q.topic || params.subject || "عام",
        difficulty: q.difficulty || params.difficulty || "medium",
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
