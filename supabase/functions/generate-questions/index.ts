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

const FOUR_PHASE_METHOD = `═══════════════════════════════════════════════════════════
اتبع هذه المراحل الأربع بالترتيب عند توليد كل سؤال:
═══════════════════════════════════════════════════════════

▌المرحلة 1 — فهم الامتحان
- اقرأ وصف المادة والأقسام.
- استنتج طبيعة التفكير المطلوبة.
- احسب الزمن التقريبي لكل سؤال.

▌المرحلة 2 — بناء خطة اختبار (قبل كتابة أي سؤال)
- وزّع الأسئلة على المواضيع بشكل متوازن.
- حدد لكل سؤال: مستوى الصعوبة، نوع التفكير (مباشر / مقارنة / استنتاج / حل ذكي)، وزمن الحل.

تعريف الصعوبة:
  • سهل: مباشر، خطوة واحدة، سريع. [15-30 ثانية]
  • متوسط: يحتاج تفكير بسيط أو خطوتين. [30-60 ثانية]
  • صعب: فكرة ذكية أو مصيدة منطقية، وليس حل طويل. [45-90 ثانية]
  ⚠️ القاعدة الذهبية: الصعوبة = ذكاء أكثر، وليس طول أكثر.

▌المرحلة 3 — كتابة السؤال
- اكتب سؤال اختيار من متعدد (4 خيارات).
- الخيارات متقاربة ومنطقية — لا تجعل الإجابة واضحة بشكل مبالغ.
- نص السؤال: سطرين كحد أقصى.
- كل سؤال يختبر مفهوماً واحداً فقط.
- نوّع في الصياغة — لا تكرر نفس بنية السؤال.
- ممنوع: الاشتقاقات الطويلة، المعلومات التافهة أو الحفظية البحتة.
- لا تضع أكثر من سؤالين متتاليين من نفس الموضوع.

▌المرحلة 4 — مراجعة ذاتية (قبل إخراج كل سؤال)
- ✅ هل الصعوبة صحيحة حسب التعريف؟
- ✅ هل السؤال يناسب زمن الامتحان؟
- ✅ هل يشبه أسلوب اختبار قدرات حقيقي؟
- ✅ هل الخيارات الخاطئة منطقية ومتقاربة؟
- ❌ إذا فشل أي شرط → أعد كتابة السؤال.

أخرج الأسئلة فقط بعد اتباع هذه المراحل الأربع.`;

const OUTPUT_FORMAT = `═══ تنسيق الإخراج (JSON فقط) ═══
أرجع JSON array فقط بدون أي نص قبله أو بعده:
[
  {
    "question_text": "نص السؤال (سطرين كحد أقصى)",
    "topic": "الموضوع",
    "difficulty": "easy|medium|hard",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق (جملة أو جملتين)"
  }
]`;

function buildPrompt(params: GenerateRequest): { system: string; user: string } {
  if (params.mode === "automatic") {
    const system = `أنت مصمم اختبارات احترافي، وليس مجرد مولد أسئلة.
أنت متخصص في اختبار قدرات جامعة الكويت.

═══ هيكل الاختبار ═══
• 5 أسئلة رياضيات (جبر، هندسة، تحليل) — نسبة: ~33%
• 5 أسئلة لغة إنجليزية (قواعد، مفردات، فهم) — نسبة: ~33%
• 5 أسئلة لغة عربية (نحو، صرف، بلاغة) — نسبة: ~33%

${FOUR_PHASE_METHOD}

${OUTPUT_FORMAT}`;

    return {
      system,
      user: `وَلِّد 15 سؤال اختبار قدرات متنوع (5 رياضيات + 5 إنجليزية + 5 عربية) بمستويات صعوبة متنوعة.
اتبع المراحل الأربع (فهم → خطة → كتابة → مراجعة). أرجع JSON فقط.`,
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

  const system = `أنت مصمم اختبارات احترافي، وليس مجرد مولد أسئلة.
أنت متخصص في ${subjectAr}.

${FOUR_PHASE_METHOD}

${OUTPUT_FORMAT}`;

  return {
    system,
    user: `وَلِّد ${count} سؤال في ${subjectAr}${topicText} بمستوى صعوبة "${diffAr}".
اتبع المراحل الأربع (فهم → خطة → كتابة → مراجعة). أرجع JSON فقط.`,
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
