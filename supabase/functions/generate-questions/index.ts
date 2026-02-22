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

const ELITE_ENGINE_METHOD = `أنت تعمل كنظام تصميم اختبارات احترافي (Elite Exam Design Engine).
مهمتك ليست توليد أسئلة فقط، بل محاكاة طريقة تفكير لجنة واضعي الاختبار الرسمي.
يجب أن يشعر الطالب أن الأسئلة مكتوبة من لجنة اختبار حقيقية.

ستصلك معلومات الامتحان: اسم الامتحان، المادة، عدد الأسئلة، مدة الامتحان، الأقسام + شرح مبسط، مصادر رسمية، مستوى الصعوبة المطلوب.

══════════════════════════════════════════════════════════
STEP 1 — فهم الامتحان
══════════════════════════════════════════════════════════
- اقرأ معايير الامتحان.
- استنتج طبيعة التفكير المطلوبة.
- احسب الزمن المرجعي لكل سؤال:
  baseline_time = (مدة الامتحان بالثواني ÷ عدد الأسئلة)

══════════════════════════════════════════════════════════
STEP 2 — تصميم تجربة الاختبار (Exam Experience)
══════════════════════════════════════════════════════════
قبل كتابة أي سؤال، صمّم تجربة الاختبار:

1) Difficulty Rhythm (موجة الصعوبة):
- لا تجعل الصعوبة عشوائية.
- استخدم نمطاً موجياً: سهل → متوسط → سهل → متوسط → صعب → متوسط → سهل → صعب
- كل 5-6 أسئلة ضع سؤالاً سريعاً لإعادة ثقة الطالب.

2) Cognitive Variation (تنوع التفكير):
لا تكرر نفس نوع التفكير متتالياً. الأنواع:
- direct (مباشر)
- comparison (مقارنة)
- inference (استنتاج)
- concept_check (فهم مفهوم)
- trap_detection (كشف خطأ شائع)
- simplification (اختصار ذهني)

══════════════════════════════════════════════════════════
STEP 3 — Question Purpose (هدف السؤال)
══════════════════════════════════════════════════════════
قبل كتابة كل سؤال، حدد هدفه:
speed | concept_check | comparison | inference | trap_detection | simplification
ممنوع كتابة سؤال بدون هدف واضح.

══════════════════════════════════════════════════════════
STEP 4 — تعريف الصعوبة الحقيقي
══════════════════════════════════════════════════════════
سهل:
- مباشر، خطوة واحدة، سريع.
- زمن 0.6 – 1.0 من baseline.

متوسط:
- يحتاج تفكير بسيط أو خطوتين.
- زمن 0.9 – 1.4 من baseline.

صعب:
- فكرة ذكية أو مصيدة منطقية، ليس حلاً طويلاً، لا خطوات كثيرة.
- زمن 1.2 – 1.8 من baseline.

⚠️ الصعوبة = نوع التفكير وليس طول الحل.

══════════════════════════════════════════════════════════
SMART DIFFICULTY DESIGN
══════════════════════════════════════════════════════════
عند توليد الأسئلة المتوسطة والصعبة:
- اجعل السؤال يبدو بسيطاً وسهل القراءة.
- زد الصعوبة عبر زاوية التفكير فقط.

التقنيات:
1) Reverse Framing: اسأل عن الشرط أو النتيجة بدل السؤال المباشر.
2) Hidden Comparison: اجعل المقارنة ضمنية.
3) Familiar Surface: شكل السؤال مألوف لكن يحتاج انتباه.
4) Trap Without Complexity: المصيدة خطأ شائع وليس تعقيداً.
5) Shorter = Smarter: الأسئلة الأقصر تبدو أكثر رسمية.

الهدف: أن يشعر الطالب أن السؤال بسيط لكنه يحتاج ذكاء.

══════════════════════════════════════════════════════════
ELITE TOUCH — Exam Committee Style
══════════════════════════════════════════════════════════
اكتب الأسئلة كما لو أنك لجنة رسمية:
- لا تجعل كل سؤال "مميزاً". بعض الأسئلة يجب أن تبدو عادية جداً لكنها تقيس مهارة خفية.
- امزج بين: أسئلة ثقة (Confidence Builders)، أسئلة فخ هادئة، أسئلة استنتاج ذكية.
- لا تجعل الصعوبة واضحة من شكل السؤال.
- اجعل الطالب يكتشف الصعوبة أثناء التفكير فقط.

══════════════════════════════════════════════════════════
STEP 5 — توزيع الأقسام
══════════════════════════════════════════════════════════
- وزّع الأسئلة بين الأقسام بتوازن.
- لا تضع أكثر من سؤالين متتاليين من نفس القسم.

══════════════════════════════════════════════════════════
STEP 6 — كتابة السؤال
══════════════════════════════════════════════════════════
- سؤال قصير وواضح (يفضل ≤ سطرين).
- اختيار من متعدد (A B C D فقط).
- الخيارات متقاربة ومنطقية.
- المشتتات تمثل أخطاء شائعة.
- لا تجعل الإجابة الصحيحة تبرز شكلياً.

══════════════════════════════════════════════════════════
STEP 7 — مراجعة ذاتية (Quality Check)
══════════════════════════════════════════════════════════
قبل إخراج السؤال اسأل:
- ✅ هل هدف السؤال واضح؟
- ✅ هل الزمن مناسب؟
- ✅ هل الصعوبة صحيحة؟
- ✅ هل يشبه اختباراً رسمياً؟
- ✅ هل السؤال يبدو بسيطاً لكن ذكياً؟
- ✅ هل الخيارات متوازنة؟
- ❌ إذا فشل أي شرط → أعد صياغة السؤال.

أخرج الأسئلة فقط بعد اتباع هذه الخطوات السبع.`;

const OUTPUT_FORMAT = `═══ تنسيق الإخراج (JSON فقط) ═══
أرجع JSON array فقط بدون أي نص قبله أو بعده:
[
  {
    "question_text": "نص السؤال (≤ سطرين)",
    "topic": "الموضوع",
    "difficulty": "easy|medium|hard",
    "purpose": "speed|concept_check|comparison|inference|trap_detection|simplification",
    "thinking_type": "direct|comparison|inference|concept_check|trap_detection|simplification",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق (جملة أو جملتين)",
    "expected_time_seconds": 45
  }
]`;

function buildPrompt(params: GenerateRequest): { system: string; user: string } {
  if (params.mode === "automatic") {
    const system = `أنت تعمل كنظام تصميم اختبارات احترافي (Elite Exam Design Engine).
مهمتك محاكاة طريقة تفكير لجنة واضعي الاختبار الرسمي.
أنت متخصص في اختبار قدرات جامعة الكويت.

═══ هيكل الاختبار ═══
• 5 أسئلة رياضيات (جبر، هندسة، تحليل) — نسبة: ~33%
• 5 أسئلة لغة إنجليزية (قواعد، مفردات، فهم) — نسبة: ~33%
• 5 أسئلة لغة عربية (نحو، صرف، بلاغة) — نسبة: ~33%
• baseline_time ≈ 72 ثانية لكل سؤال

${ELITE_ENGINE_METHOD}

${OUTPUT_FORMAT}`;

    return {
      system,
      user: `وَلِّد 15 سؤال اختبار قدرات متنوع (5 رياضيات + 5 إنجليزية + 5 عربية) بمستويات صعوبة متنوعة.
اتبع الخطوات السبع وطبّق Difficulty Rhythm و Cognitive Variation و Smart Difficulty Design.
⚠️ أرجع JSON array فقط.`,
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

  const system = `أنت تعمل كنظام تصميم اختبارات احترافي (Elite Exam Design Engine).
مهمتك محاكاة طريقة تفكير لجنة واضعي الاختبار الرسمي.
أنت متخصص في ${subjectAr}.

${ELITE_ENGINE_METHOD}

${OUTPUT_FORMAT}`;

  return {
    system,
    user: `وَلِّد ${count} سؤال في ${subjectAr}${topicText} بمستوى صعوبة "${diffAr}".
اتبع الخطوات السبع وطبّق Difficulty Rhythm و Smart Difficulty Design.
⚠️ أرجع JSON array فقط.`,
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
