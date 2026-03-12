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
  
  // If in simulation mode, coaching is disabled
  if (context.session_mode === "simulation") return "platform_guide";
  
  const guideKeywords = ["أين", "كيف أجد", "وين", "أين أذهب", "أين أرى", "صفحة", "زر", "أيقونة", "كيف أستخدم", "التنقل", "القائمة"];
  if (guideKeywords.some(k => msg.includes(k))) return "platform_guide";
  if (context.sessionActive && (context.sessionType === "smart_training" || context.sessionType === "adaptive_training" || context.session_mode === "smart_training")) return "training_coach";
  const tutorKeywords = ["لماذا", "اشرح", "لم أفهم", "مثال", "كيف أحل", "وضح", "الإجابة الصحيحة", "شرح", "خاطئة", "خطأ"];
  if (tutorKeywords.some(k => msg.includes(k))) return "learning_tutor";
  if (context.currentPage?.includes("performance") || context.currentPage?.includes("history")) return "learning_tutor";
  return "platform_guide";
}

async function loadExamBlueprint(adminClient: any, examTemplateId: string) {
  const [templateRes, sectionsRes, profileRes] = await Promise.all([
    adminClient.from("exam_templates").select("name_ar, country_id, slug, description_ar, target_easy_pct, target_medium_pct, target_hard_pct").eq("id", examTemplateId).maybeSingle(),
    adminClient.from("exam_sections").select("id, name_ar, question_count, topic_filter_json, difficulty_mix_json").eq("exam_template_id", examTemplateId).order("order"),
    adminClient.from("exam_profiles").select("profile_json").eq("exam_template_id", examTemplateId).eq("status", "approved").maybeSingle(),
  ]);

  return {
    template: templateRes.data,
    sections: sectionsRes.data || [],
    profile: profileRes.data?.profile_json || null,
  };
}

function buildSystemPrompt(mode: string, context: any, blueprint: any): string {
  const examName = context.exam_name || blueprint?.template?.name_ar || "غير محدد";
  
  const baseIdentity = `أنت "SARIS" المدرب الذكي في منصة SARIS EXAMS.
اسمك SARIS وأنت المدرب الذكي الشخصي للطالب.
أنت تعمل داخل منصة SARIS EXAMS وتساعد الطالب في جلسة تدريب على اختبار: "${examName}".
شخصيتك: ودود، محفز، واضح، أكاديمي، مختصر.
تتحدث بالعربية دائماً.

قواعد حتمية صارمة:
- لا تقل أبداً "لا أستطيع رؤية السؤال" — السؤال مُقدم لك دائماً في السياق.
- لا تقل أبداً "هذا الاختبار لا يشمل هذا الموضوع" — إذا كان السؤال ينتمي لقسم معرف في مخطط الاختبار فهو صالح.
- لا تستخدم افتراضات عامة عن الاختبارات. استند فقط إلى بيانات الاختبار المقدمة.
- إذا طُلب منك معلومة غير متوفرة في السياق، قل: "هذه المعلومة غير متوفرة في بيانات المنصة حالياً".
- استند دائماً إلى: أقسام الاختبار، المواضيع المعتمدة، بصمة الاختبار (DNA).`;

  // Blueprint context
  let blueprintContext = "";
  if (blueprint?.sections?.length) {
    blueprintContext = `\nأقسام الاختبار المعتمدة:\n${blueprint.sections.map((s: any) => 
      `- ${s.name_ar} (${s.question_count} سؤال)${s.topic_filter_json?.length ? ` | المواضيع: ${(s.topic_filter_json as string[]).join('، ')}` : ''}`
    ).join('\n')}`;
  }

  if (blueprint?.template) {
    blueprintContext += `\n\nتوزيع الصعوبة المستهدف: سهل ${blueprint.template.target_easy_pct}% | متوسط ${blueprint.template.target_medium_pct}% | صعب ${blueprint.template.target_hard_pct}%`;
  }

  // Current question context
  let questionContext = "";
  if (context.currentQuestion) {
    const q = context.currentQuestion;
    questionContext = `\n\nالسؤال الحالي:`;
    if (q.text_ar) questionContext += `\nنص السؤال: ${q.text_ar}`;
    if (q.options?.length) {
      questionContext += `\nالخيارات:\n${q.options.map((o: any) => `  ${o.id}: ${o.text}`).join('\n')}`;
    }
    if (q.correct_answer) questionContext += `\nالإجابة الصحيحة: ${q.correct_answer}`;
    if (q.student_answer) questionContext += `\nإجابة الطالب: ${q.student_answer}`;
    if (q.topic) questionContext += `\nالموضوع: ${q.topic}`;
    if (q.difficulty) questionContext += `\nالصعوبة: ${q.difficulty}`;
    if (q.section_name) questionContext += `\nالقسم: ${q.section_name}`;
    if (q.explanation) questionContext += `\nالشرح المعتمد: ${q.explanation}`;
  }

  // Error tracking context
  let errorContext = "";
  if (context.student_error_count && context.student_error_count > 0) {
    errorContext = `\n\nعدد الأخطاء المتتالية: ${context.student_error_count}`;
    if (context.recent_error_topics?.length) {
      const topics = context.recent_error_topics
        .filter((e: any) => e.topic || e.section)
        .map((e: any) => `${e.section || ''}${e.topic ? ` - ${e.topic}` : ''}`)
        .join('، ');
      if (topics) errorContext += `\nمواضيع الأخطاء الأخيرة: ${topics}`;
    }
  }

  if (mode === "training_coach") {
    return `${baseIdentity}
${blueprintContext}

أنت الآن في وضع "مدرب التدريب" أثناء جلسة تدريب ذكي نشطة.
نوع الجلسة: ${context.session_mode || 'smart_training'}

قواعد صارمة للتدريب:
- لا تكشف الإجابة الصحيحة مباشرة أبداً
- لا تحل السؤال بالكامل
- لا تتعارض مع إجابات بنك الأسئلة المعتمد
- يمكنك شرح الفكرة العامة والمفهوم
- يمكنك توجيه التفكير خطوة بخطوة
- يمكنك إعطاء تلميح قصير
- يمكنك اقتراح استراتيجية حل
- يمكنك تقديم تشجيع وتحفيز
- كن مختصراً (2-3 جمل كحد أقصى)
- إذا أخطأ الطالب، اشرح المفهوم الذي يحتاجه دون كشف الحل
${questionContext}
${errorContext}

${context.studentDNA ? `بيانات الطالب:\nمستوى القدرة: ${context.studentDNA.ability_score || 'غير محدد'}\nاتجاه الأداء: ${context.studentDNA.trend_direction || 'مستقر'}` : ''}`;
  }

  if (mode === "learning_tutor") {
    return `${baseIdentity}
${blueprintContext}

أنت الآن في وضع "المعلم" لشرح المفاهيم والإجابات.
${questionContext}
${errorContext}

يمكنك:
- شرح الإجابة الصحيحة وسببها بالتفصيل
- توضيح المفاهيم الرياضية أو اللغوية المتعلقة
- إعطاء أمثلة مشابهة
- شرح استراتيجيات الحل
- ربط المفهوم بأقسام الاختبار المعتمدة

قواعد:
- التزم بالشرح المعتمد في بنك الأسئلة إن وجد
- لا تتعارض مع الإجابة المعتمدة في البنك
- استخدم بيانات SARIS والمخطط المقدم فقط
- كن واضحاً ومنظماً في الشرح

${context.studentDNA ? `مستوى الطالب: ${context.studentDNA.dna_type || 'متوازن'}` : ''}`;
  }

  // Simulation mode — minimal coaching
  if (context.session_mode === "simulation") {
    return `${baseIdentity}

أنت الآن في وضع "محاكاة الاختبار". التدريب معطل في هذا الوضع.
يمكنك فقط:
- الإجابة على أسئلة عامة عن المنصة
- توجيه الطالب للعودة بعد انتهاء المحاكاة

لا تقدم أي مساعدة أكاديمية أثناء المحاكاة.`;
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

    // Load student data + exam blueprint in parallel
    const examTemplateId = context.exam_template_id;
    
    const [dnaRes, skillsRes, blueprintData] = await Promise.all([
      adminClient.from("student_learning_dna").select("*").eq("student_id", user.id).maybeSingle(),
      adminClient.from("skill_memory").select("section_name, skill_score, total_answered").eq("user_id", user.id),
      examTemplateId ? loadExamBlueprint(adminClient, examTemplateId) : Promise.resolve(null),
    ]);

    if (dnaRes.data) enrichedContext.studentDNA = dnaRes.data;
    if (skillsRes.data?.length) enrichedContext.skillMemory = skillsRes.data;

    // Detect mode and build prompt with blueprint
    const mode = detectMode(enrichedContext);
    const systemPrompt = buildSystemPrompt(mode, enrichedContext, blueprintData);

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
        maxTokens: 600,
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
