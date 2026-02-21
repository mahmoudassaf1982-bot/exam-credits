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
  // Legacy fields
  examType?: string;
}

const countryMap: Record<string, string> = {
  kw: "الكويت", sa: "السعودية", eg: "مصر", ae: "الإمارات", jo: "الأردن", ps: "فلسطين",
  bh: "البحرين", om: "عمان", qa: "قطر",
};

const difficultyMap: Record<string, string> = {
  easy: "سهل", medium: "متوسط", hard: "صعب",
};

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

    // Resolve exam name from DB if examTemplateId provided
    let examName = "اختبار عام";
    let topicHint = "";
    if (params.examTemplateId) {
      const { data: examData } = await supabase
        .from("exam_templates")
        .select("name_ar, country_id")
        .eq("id", params.examTemplateId)
        .single();
      if (examData) examName = examData.name_ar;
    }

    // Resolve country name
    let countryAr = countryMap[params.country] || params.country;
    if (!countryMap[params.country]) {
      const { data: countryData } = await supabase
        .from("countries")
        .select("name_ar")
        .eq("id", params.country)
        .single();
      if (countryData) countryAr = countryData.name_ar;
    }

    const diffAr = difficultyMap[params.difficulty] || params.difficulty;
    const count = Math.min(Math.max(params.numberOfQuestions || 10, 1), 50);

    const prompt = `أنت خبير في إعداد الاختبارات الأكاديمية في ${countryAr}.

قم بتوليد ${count} سؤال لـ "${examName}" بمستوى صعوبة ${diffAr}، مناسب لمعايير ${countryAr} التعليمية.

كل سؤال يجب أن يكون:
- واضح ودقيق علمياً
- مناسب لمستوى الصعوبة المطلوب
- له 4 خيارات إجابة (أ، ب، ج، د)
- إجابة واحدة صحيحة فقط
- شرح مختصر للإجابة الصحيحة
- موضوع (topic) مناسب للاختبار

أرجع النتيجة كـ JSON array بالشكل التالي:
[
  {
    "question_text": "نص السؤال",
    "topic": "موضوع السؤال",
    "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح الإجابة الصحيحة"
  }
]

أرجع JSON فقط بدون أي نص إضافي.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "أنت مساعد متخصص في توليد أسئلة اختبارات أكاديمية عالية الجودة باللغة العربية. أرجع JSON فقط." },
          { role: "user", content: prompt },
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
        topic: q.topic || examName,
        difficulty: params.difficulty || "medium",
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