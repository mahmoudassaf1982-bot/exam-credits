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

  return `أنت تعمل كنظام تصميم اختبارات احترافي (Elite Exam Design Engine).
مهمتك ليست توليد أسئلة فقط، بل محاكاة طريقة تفكير لجنة واضعي الاختبار الرسمي.
يجب أن يشعر الطالب أن الأسئلة مكتوبة من لجنة اختبار حقيقية.
أنت متخصص في "${blueprint.exam.name}" في ${blueprint.exam.country}.

ستصلك معلومات الامتحان: اسم الامتحان، المادة، عدد الأسئلة، مدة الامتحان، الأقسام + شرح مبسط، مصادر رسمية، مستوى الصعوبة المطلوب.

═══ هوية الاختبار ═══
• الاسم: ${blueprint.exam.name}
• الدولة: ${blueprint.exam.country}
• اللغة: العربية
• عدد الأسئلة المطلوبة: ${blueprint.exam.format.questions_total}
• مدة الاختبار: ${blueprint.exam.format.duration_minutes} دقيقة
• baseline_time لكل سؤال: ${bt} ثانية
• عدد الخيارات: ${blueprint.exam.format.mcq_options_count}

═══ أقسام الاختبار ═══
${sectionsDesc}

══════════════════════════════════════════════════════════
STEP 1 — فهم الامتحان
══════════════════════════════════════════════════════════
- اقرأ معايير الامتحان.
- استنتج طبيعة التفكير المطلوبة.
- احسب الزمن المرجعي لكل سؤال:
  baseline_time = ${bt} ثانية لكل سؤال.

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
- زمن ${Math.round(bt * 0.6)}-${Math.round(bt * 1.0)} ثانية.

متوسط:
- يحتاج تفكير بسيط أو خطوتين.
- زمن ${Math.round(bt * 0.9)}-${Math.round(bt * 1.4)} ثانية.

صعب:
- فكرة ذكية أو مصيدة منطقية، ليس حلاً طويلاً، لا خطوات كثيرة.
- زمن ${Math.round(bt * 1.2)}-${Math.round(bt * 1.8)} ثانية.

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
- وزّع الأسئلة بين الأقسام بتوازن حسب النسب المحددة أعلاه.
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

══════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON فقط)
══════════════════════════════════════════════════════════
أرجع JSON array فقط بدون أي نص قبله أو بعده:
[
  {
    "question_text": "نص السؤال (≤ سطرين)",
    "topic": "اسم القسم/الموضوع",
    "difficulty": "easy|medium|hard",
    "purpose": "speed|concept_check|comparison|inference|trap_detection|simplification",
    "thinking_type": "direct|comparison|inference|concept_check|trap_detection|simplification",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق (جملة أو جملتين)",
    "expected_time_seconds": 45
  }
]`;
}

function buildUserPrompt(blueprint: ExamBlueprint, difficulty: string): string {
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || difficulty;

  return `وَلِّد ${blueprint.exam.format.questions_total} سؤال بمستوى صعوبة "${diffAr}" لاختبار "${blueprint.exam.name}".

اتبع الخطوات السبع (فهم → تصميم تجربة → هدف → صعوبة → توزيع → كتابة → مراجعة).
طبّق Difficulty Rhythm و Cognitive Variation و Smart Difficulty Design.
وزّع الأسئلة على الأقسام حسب النسب المحددة.

⚠️ أرجع JSON array فقط — بدون markdown أو شرح أو أي نص إضافي.`;
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
