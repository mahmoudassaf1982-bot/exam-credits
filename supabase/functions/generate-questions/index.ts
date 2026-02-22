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

function buildPrompt(params: GenerateRequest): string {
  if (params.mode === "automatic") {
    return `أنت خبير في إعداد اختبارات القدرات لجامعة الكويت. قم بتوليد 15 سؤال اختبار قدرات متنوع يغطي الأقسام التالية:
- 5 أسئلة رياضيات (مستويات مختلفة)
- 5 أسئلة لغة إنجليزية (قواعد ومفردات)
- 5 أسئلة لغة عربية (نحو وصرف وبلاغة)

كل سؤال يجب أن يكون باللغة العربية ويتبع معايير اختبار القدرات الأكاديمية.

أرجع النتيجة كـ JSON array بالشكل التالي:
[
  {
    "topic": "الرياضيات",
    "difficulty": "medium",
    "question_text": "نص السؤال",
    "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح الإجابة الصحيحة"
  }
]

أرجع JSON فقط بدون أي نص إضافي.`;
  }

  const subjectMap: Record<string, string> = {
    mathematics: "الرياضيات",
    english: "اللغة الإنجليزية",
    arabic: "اللغة العربية",
  };
  const difficultyMap: Record<string, string> = {
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",
  };

  const subjectAr = subjectMap[params.subject || "mathematics"] || params.subject;
  const difficultyAr = difficultyMap[params.difficulty || "medium"] || params.difficulty;
  const count = Math.min(Math.max(params.count || 5, 1), 50);
  const topicText = params.topic ? `في موضوع "${params.topic}"` : "";

  return `أنت خبير في إعداد أسئلة الاختبارات الأكاديمية باللغة العربية.

قم بتوليد ${count} سؤال في مادة ${subjectAr} ${topicText}، بمستوى صعوبة ${difficultyAr}.

كل سؤال يجب أن يكون:
- واضح ودقيق علمياً
- مناسب لمستوى الصعوبة المطلوب
- له 4 خيارات إجابة
- إجابة واحدة صحيحة فقط
- شرح مختصر للإجابة الصحيحة

أرجع النتيجة كـ JSON array بالشكل التالي:
[
  {
    "topic": "${subjectAr}",
    "difficulty": "${params.difficulty || "medium"}",
    "question_text": "نص السؤال",
    "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح الإجابة الصحيحة"
  }
]

أرجع JSON فقط بدون أي نص إضافي.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: GenerateRequest = await req.json();
    console.log("[generate-questions] mode:", params.mode, "params:", JSON.stringify(params));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = buildPrompt(params);
    console.log("[generate-questions] Calling AI gateway...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "أنت مساعد متخصص في توليد أسئلة اختبارات أكاديمية عالية الجودة باللغة العربية. أرجع JSON فقط." },
          { role: "user", content: prompt },
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
    console.log("[generate-questions] AI raw response length:", rawContent.length);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let questions: any[];
    try {
      questions = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[generate-questions] JSON parse error:", e, "raw:", jsonStr.substring(0, 500));
      throw new Error("فشل في تحليل استجابة الذكاء الاصطناعي");
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("لم يتم توليد أي أسئلة");
    }

    console.log("[generate-questions] Parsed", questions.length, "questions. Inserting into DB...");

    // Map to DB format
    const countryId = params.countryId || "kw";
    const dbRows = questions.map((q: any) => {
      const optionIds = ["a", "b", "c", "d"];
      const options = (q.options || []).map((text: string, i: number) => ({
        id: optionIds[i] || `opt_${i}`,
        textAr: text,
      }));
      const correctIdx = typeof q.correct_answer_index === "number" ? q.correct_answer_index : 0;
      const correctOptionId = optionIds[correctIdx] || "a";

      return {
        country_id: countryId,
        topic: q.topic || params.subject || "عام",
        difficulty: q.difficulty || params.difficulty || "medium",
        text_ar: q.question_text,
        options: JSON.stringify(options),
        correct_option_id: correctOptionId,
        explanation: q.explanation || null,
        is_approved: false,
        source: "ai",
      };
    });

    // Insert using service role
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

    console.log("[generate-questions] Successfully inserted", inserted?.length, "questions");

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
