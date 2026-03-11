import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Platform knowledge for guide mode
const PLATFORM_KNOWLEDGE = {
  pages: {
    "/app": { name: "لوحة التحكم", description: "صفحة الرئيسية تعرض الإحصائيات والتوصيات" },
    "/app/exams": { name: "الاختبارات", description: "صفحة عرض جميع الاختبارات المتاحة وبدء جلسات التدريب الذكي" },
    "/app/history": { name: "سجل الاختبارات", description: "عرض تاريخ جميع الجلسات السابقة ونتائجها" },
    "/app/performance": { name: "ملف الأداء الشامل", description: "تحليل متقدم للأداء يشمل خريطة المهارات والدرجة المتوقعة وبصمة التعلم" },
    "/app/wallet": { name: "المحفظة", description: "عرض رصيد النقاط والمعاملات المالية" },
    "/app/referral": { name: "دعوة صديق", description: "مشاركة رمز الإحالة للحصول على نقاط إضافية" },
    "/app/topup": { name: "شراء نقاط", description: "شراء حزم نقاط عبر PayPal" },
  },
  features: {
    smart_training: "جلسة التدريب الذكي - تدريب تكيفي يركز على نقاط ضعفك ويتكيف مع مستواك",
    skill_memory: "ذاكرة المهارات - تتبع مستوى مهاراتك في كل قسم من أقسام الاختبار",
    learning_dna: "بصمة التعلم - تحليل نمط تعلمك الفريد (متوازن، تحليلي، حدسي، مثابر)",
    predicted_score: "الدرجة المتوقعة - تقدير درجتك في الاختبار الحقيقي بناءً على أدائك",
    smart_hint: "التلميح الذكي - تلميحات مفاهيمية للأسئلة الصعبة أثناء التدريب",
    recommendations: "التوصيات الذكية - اقتراحات تدريب مخصصة بناءً على نقاط ضعفك",
  },
  workflows: {
    start_training: "اذهب إلى صفحة الاختبارات → اختر الاختبار → اضغط 'ابدأ التدريب الذكي'",
    check_performance: "اذهب إلى صفحة ملف الأداء الشامل من القائمة الجانبية",
    review_answers: "اذهب إلى سجل الاختبارات → اضغط على الجلسة → اختر 'مراجعة الإجابات'",
    buy_points: "اذهب إلى شراء نقاط من القائمة الجانبية → اختر الحزمة → ادفع عبر PayPal",
  },
};

function detectMode(context: any): "training_coach" | "learning_tutor" | "platform_guide" {
  const msg = (context.message || "").toLowerCase();
  const guideKeywords = ["أين", "كيف أجد", "وين", "أين أذهب", "أين أرى", "صفحة", "زر", "أيقونة", "كيف أستخدم", "التنقل", "القائمة"];
  if (guideKeywords.some(k => msg.includes(k))) return "platform_guide";
  if (context.sessionActive && context.sessionType === "smart_training") return "training_coach";
  const tutorKeywords = ["لماذا", "اشرح", "لم أفهم", "مثال", "كيف أحل", "وضح", "الإجابة الصحيحة", "شرح"];
  if (tutorKeywords.some(k => msg.includes(k))) return "learning_tutor";
  if (context.currentPage?.includes("performance") || context.currentPage?.includes("history")) return "learning_tutor";
  return "platform_guide";
}

function buildSystemPrompt(mode: string, context: any): string {
  const baseIdentity = `أنت "SARIS" المدرب الذكي في منصة SARIS EXAMS.
اسمك SARIS وأنت المدرب الذكي الشخصي للطالب.
أنت مدرب أكاديمي ذكي تساعد الطلاب على الاستعداد لاختبارات القدرات.
شخصيتك: ودود، محفز، واضح، أكاديمي، مختصر.
تتحدث بالعربية دائماً.
لا تستخدم معلومات من خارج بيانات منصة SARIS.
إذا لم تجد المعلومة في بيانات المنصة، قل: "هذه المعلومة غير متوفرة في بيانات المنصة حالياً"`;

  if (mode === "training_coach") {
    return `${baseIdentity}

أنت الآن في وضع "مدرب التدريب" أثناء جلسة تدريب ذكي نشطة.

قواعد صارمة:
- لا تكشف الإجابة الصحيحة مباشرة أبداً
- لا تحل السؤال بالكامل
- لا تتعارض مع إجابات بنك الأسئلة المعتمد
- يمكنك شرح الفكرة العامة
- يمكنك توجيه التفكير
- يمكنك إعطاء تلميح قصير
- يمكنك اقتراح استراتيجية حل
- يمكنك تقديم تشجيع وتحفيز
- كن مختصراً (2-3 جمل كحد أقصى)

${context.studentDNA ? `بيانات الطالب:\nمستوى القدرة: ${context.studentDNA.ability_score || 'غير محدد'}\nاتجاه الأداء: ${context.studentDNA.trend_direction || 'مستقر'}` : ''}
${context.currentQuestion ? `السؤال الحالي:\nالموضوع: ${context.currentQuestion.topic || 'غير محدد'}\nالصعوبة: ${context.currentQuestion.difficulty || 'غير محدد'}\nالقسم: ${context.currentQuestion.section || 'غير محدد'}` : ''}`;
  }

  if (mode === "learning_tutor") {
    return `${baseIdentity}

أنت الآن في وضع "المعلم" لشرح المفاهيم والإجابات.

يمكنك:
- شرح الإجابة الصحيحة وسببها
- توضيح المفاهيم
- إعطاء أمثلة
- شرح استراتيجيات الحل
- ربط المفهوم بأقسام الاختبار

قواعد:
- التزم بالشرح المعتمد في بنك الأسئلة إن وجد
- لا تتعارض مع الإجابة المعتمدة في البنك
- استخدم بيانات SARIS فقط
- كن واضحاً ومنظماً في الشرح

${context.questionData ? `بيانات السؤال:\nالسؤال: ${context.questionData.text_ar || ''}\nالإجابة الصحيحة: ${context.questionData.correct_option_id || ''}\nالشرح المعتمد: ${context.questionData.explanation || 'لا يوجد شرح مخزن'}` : ''}
${context.studentDNA ? `مستوى الطالب: ${context.studentDNA.dna_type || 'متوازن'}` : ''}`;
  }

  return `${baseIdentity}

أنت الآن في وضع "دليل المنصة" لمساعدة الطالب في التنقل واستخدام المنصة.

معرفتك بالمنصة:

الصفحات المتاحة:
${Object.entries(PLATFORM_KNOWLEDGE.pages).map(([path, info]) => `- ${info.name}: ${info.description}`).join('\n')}

الميزات الرئيسية:
${Object.entries(PLATFORM_KNOWLEDGE.features).map(([key, desc]) => `- ${desc}`).join('\n')}

كيفية تنفيذ المهام:
${Object.entries(PLATFORM_KNOWLEDGE.workflows).map(([key, desc]) => `- ${desc}`).join('\n')}

قواعد:
- أجب فقط بما تعرفه عن المنصة
- كن مختصراً وواضحاً
- وجه الطالب بخطوات محددة
- لا تخترع صفحات أو ميزات غير موجودة`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { message, conversation_history = [], context = {} } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "الرسالة مطلوبة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enrich context
    const enrichedContext = { ...context, message };

    const { data: dna } = await adminClient
      .from("student_learning_dna")
      .select("*")
      .eq("student_id", user.id)
      .maybeSingle();
    if (dna) enrichedContext.studentDNA = dna;

    const { data: skills } = await adminClient
      .from("skill_memory")
      .select("section_name, skill_score, total_answered")
      .eq("user_id", user.id);
    if (skills?.length) enrichedContext.skillMemory = skills;

    // Detect mode and build prompt
    const mode = detectMode(enrichedContext);
    const systemPrompt = buildSystemPrompt(mode, enrichedContext);

    // Build conversation messages for router
    const aiMessages = [
      ...conversation_history.slice(-10).map((m: any) => ({
        role: m.role === "coach" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // Call the AI provider router
    const routerRes = await fetch(`${supabaseUrl}/functions/v1/ai-provider-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        feature: `smart-coach:${mode}`,
        systemPrompt,
        messages: aiMessages,
        maxTokens: 500,
        temperature: 0.3,
      }),
    });

    if (!routerRes.ok) {
      console.error("[smart-coach] Router error:", routerRes.status);
      return new Response(JSON.stringify({
        reply: "عذراً، حدث خطأ في معالجة طلبك. حاول مرة أخرى.",
        mode,
        error: true,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const routerData = await routerRes.json();

    if (routerData.error) {
      return new Response(JSON.stringify({
        reply: routerData.reply || "عذراً، حدث خطأ.",
        mode,
        provider: routerData.provider,
        fallback_used: routerData.fallback_used,
        error: true,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      reply: routerData.reply,
      mode,
      provider: routerData.provider,
      fallback_used: routerData.fallback_used,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("smart-coach error:", e);
    return new Response(JSON.stringify({
      reply: "عذراً، حدث خطأ. حاول مرة أخرى.",
      mode: "platform_guide",
      error: true,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
