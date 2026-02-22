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

// ─── Blueprint Builder ───────────────────────────────────────────────

interface ExamBlueprint {
  exam: {
    name: string;
    country: string;
    language: string;
    format: {
      questions_total: number;
      duration_minutes: number;
      mcq_options_count: number;
    };
  };
  blueprint: {
    sections: {
      id: string;
      name: string;
      topics: string[];
      weight_range: [number, number];
    }[];
    difficulty_levels: {
      id: string;
      definition: string;
      time_target_seconds: [number, number];
      steps_target: [number, number];
      rule?: string;
    }[];
    constraints: {
      max_stem_lines: number;
      no_long_derivations: boolean;
      avoid_trivia: boolean;
      rhythm_rule: string;
    };
  };
}

const DIFFICULTY_DEFINITIONS = [
  {
    id: "easy",
    definition: "سؤال مباشر يختبر الفهم الأساسي للمفهوم. لا يحتاج أكثر من خطوة واحدة للحل.",
    time_target_seconds: [15, 30] as [number, number],
    steps_target: [1, 1] as [number, number],
  },
  {
    id: "medium",
    definition: "سؤال يتطلب تطبيق مفهوم أو ربط بين مفهومين. يحتاج خطوة إلى خطوتين للحل.",
    time_target_seconds: [30, 60] as [number, number],
    steps_target: [1, 2] as [number, number],
  },
  {
    id: "hard",
    definition: "سؤال يتطلب تفكيراً تحليلياً أو ربط عدة مفاهيم. يحتاج خطوتين إلى ثلاث خطوات. القاعدة: الصعوبة تعني ذكاء أكثر وليس طولاً أكثر.",
    time_target_seconds: [45, 90] as [number, number],
    steps_target: [2, 3] as [number, number],
    rule: "hard = smarter, not longer",
  },
];

const QUALITY_CONSTRAINTS = {
  max_stem_lines: 2,
  no_long_derivations: true,
  avoid_trivia: true,
  rhythm_rule: "لا تضع أكثر من سؤالين متتاليين من نفس القسم أو الموضوع",
};

async function buildBlueprint(
  supabase: any,
  params: GenerateRequest
): Promise<ExamBlueprint> {
  // Fetch country info
  const { data: countryData } = await supabase
    .from("countries")
    .select("name_ar")
    .eq("id", params.country)
    .single();
  const countryName = countryData?.name_ar || params.country;

  // Fetch exam template
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

  // Fetch exam sections for topic/weight context
  let sections: ExamBlueprint["blueprint"]["sections"] = [];
  if (params.examTemplateId) {
    const { data: sectionData } = await supabase
      .from("exam_sections")
      .select("id, name_ar, question_count, topic_filter_json, difficulty_mix_json")
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

  // Fallback if no sections found
  if (sections.length === 0) {
    sections = [{ id: "general", name: examName, topics: [], weight_range: [1.0, 1.0] }];
  }

  return {
    exam: {
      name: examName,
      country: countryName,
      language: "ar",
      format: {
        questions_total: params.numberOfQuestions,
        duration_minutes: Math.round(durationSec / 60),
        mcq_options_count: 4,
      },
    },
    blueprint: {
      sections,
      difficulty_levels: DIFFICULTY_DEFINITIONS,
      constraints: QUALITY_CONSTRAINTS,
    },
  };
}

// ─── Prompt Builder ──────────────────────────────────────────────────

function buildSystemPrompt(blueprint: ExamBlueprint): string {
  const sectionsDesc = blueprint.blueprint.sections
    .map(s => {
      const topicsStr = s.topics.length > 0 ? `المواضيع: ${s.topics.join("، ")}` : "مواضيع عامة";
      const weightPct = `${Math.round(s.weight_range[0] * 100)}%-${Math.round(s.weight_range[1] * 100)}%`;
      return `  • ${s.name} (نسبة: ${weightPct}) — ${topicsStr}`;
    })
    .join("\n");

  const diffDesc = blueprint.blueprint.difficulty_levels
    .map(d => {
      const timeRange = `${d.time_target_seconds[0]}-${d.time_target_seconds[1]} ثانية`;
      const stepsRange = `${d.steps_target[0]}-${d.steps_target[1]} خطوة`;
      return `  • ${d.id}: ${d.definition} [زمن: ${timeRange}, خطوات: ${stepsRange}]${d.rule ? ` ⚠️ ${d.rule}` : ""}`;
    })
    .join("\n");

  const c = blueprint.blueprint.constraints;

  return `أنت مُعِدّ اختبارات أكاديمية محترف متخصص في "${blueprint.exam.name}" في ${blueprint.exam.country}.

═══ هوية الاختبار ═══
• الاسم: ${blueprint.exam.name}
• الدولة: ${blueprint.exam.country}
• اللغة: العربية
• عدد الأسئلة المطلوبة: ${blueprint.exam.format.questions_total}
• عدد الخيارات لكل سؤال: ${blueprint.exam.format.mcq_options_count}

═══ أقسام الاختبار ═══
${sectionsDesc}

═══ مستويات الصعوبة ═══
${diffDesc}

═══ قيود الجودة (إلزامية) ═══
• الحد الأقصى لنص السؤال: ${c.max_stem_lines} سطر — لا تتجاوز هذا أبداً
• ${c.no_long_derivations ? "ممنوع: الاشتقاقات والحسابات الطويلة" : ""}
• ${c.avoid_trivia ? "ممنوع: المعلومات التافهة أو الحفظية البحتة" : ""}
• ${c.rhythm_rule}
• كل سؤال يختبر مفهوماً واحداً فقط
• الخيارات الخاطئة يجب أن تكون منطقية (ليست سخيفة أو واضحة الخطأ)
• لا تكرر نفس بنية السؤال — نوّع في الصياغة

═══ تنسيق الإخراج (JSON فقط) ═══
أرجع JSON array فقط بدون أي نص قبله أو بعده:
[
  {
    "question_text": "نص السؤال (سطرين كحد أقصى)",
    "topic": "اسم القسم/الموضوع",
    "difficulty": "easy|medium|hard",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correct_answer_index": 0,
    "explanation": "شرح مختصر ودقيق للإجابة الصحيحة (جملة أو جملتين)"
  }
]`;
}

function buildUserPrompt(blueprint: ExamBlueprint, difficulty: string): string {
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || difficulty;

  return `وَلِّد ${blueprint.exam.format.questions_total} سؤال بمستوى صعوبة "${diffAr}" لاختبار "${blueprint.exam.name}".

التزم بالقيود والأقسام المذكورة في تعليماتك. وزّع الأسئلة على الأقسام حسب النسب المحددة.

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

    // Build dynamic blueprint from DB
    const blueprint = await buildBlueprint(supabase, params);
    console.log("[generateQuestionsWithResearch] Blueprint built:", JSON.stringify({
      exam: blueprint.exam.name,
      sections: blueprint.blueprint.sections.length,
      questionsRequested: params.numberOfQuestions,
    }));

    const systemPrompt = buildSystemPrompt(blueprint);
    const userPrompt = buildUserPrompt(blueprint, params.difficulty);

    // Call AI
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

    // Parse JSON (handle markdown code blocks)
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

    // Map to DB format
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
