import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorRes(401, "Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return errorRes(401, "غير مصرح");

    const { session_id, question_id } = await req.json();
    if (!session_id || !question_id) return errorRes(400, "session_id و question_id مطلوبان");

    // 1. Fetch session & verify ownership
    const { data: session, error: sessErr } = await adminClient
      .from("exam_sessions")
      .select("id, user_id, status, session_type, exam_template_id, questions_json, exam_snapshot, cat_session_json")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) return errorRes(404, "الجلسة غير موجودة");
    if (session.user_id !== user.id) return errorRes(403, "ليس لديك صلاحية");
    if (session.status !== "in_progress") return errorRes(400, "الجلسة ليست نشطة");

    // 2. Find the question in the session
    const questionsJson = session.questions_json as Record<string, any[]>;
    let targetQuestion: any = null;
    let sectionName = "";

    for (const [sectionId, questions] of Object.entries(questionsJson || {})) {
      const found = (questions || []).find((q: any) => q.id === question_id);
      if (found) {
        targetQuestion = found;
        // Find section name from snapshot
        const sections = (session.exam_snapshot as any)?.sections || [];
        const sec = sections.find((s: any) => s.id === sectionId);
        sectionName = sec?.name_ar || "";
        break;
      }
    }

    if (!targetQuestion) return errorRes(404, "السؤال غير موجود في هذه الجلسة");

    // 3. Verify difficulty = hard
    if (targetQuestion.difficulty !== "hard") {
      return errorRes(400, "التلميح متاح فقط للأسئلة الصعبة");
    }

    // 4. Check if hint already used
    const catSession = session.cat_session_json as any;
    const existingHints = catSession?.hints_json || {};
    if (existingHints[question_id]?.hint_used) {
      return jsonRes({ hint: existingHints[question_id].hint_text, already_used: true });
    }

    // 5. Gather SARIS context
    // Exam profile
    const { data: examProfile } = await adminClient
      .from("exam_profiles")
      .select("profile_json")
      .eq("exam_template_id", session.exam_template_id)
      .eq("status", "approved")
      .maybeSingle();

    // Exam standards
    const { data: examStandards } = await adminClient
      .from("exam_standards")
      .select("section_name, question_count, difficulty_distribution, topics")
      .eq("exam_template_id", session.exam_template_id);

    // Student skill memory
    const { data: skillMemory } = await adminClient
      .from("skill_memory")
      .select("section_name, skill_score, total_correct, total_answered")
      .eq("user_id", user.id)
      .eq("exam_template_id", session.exam_template_id);

    // Question metadata from bank (topic, explanation — but NOT correct answer for hint)
    const { data: questionMeta } = await adminClient
      .from("questions")
      .select("topic, difficulty, section_id, explanation")
      .eq("id", question_id)
      .maybeSingle();

    // 6. Build Claude prompt
    const sarisContext = {
      exam_profile: examProfile?.profile_json || null,
      exam_standards: examStandards || [],
      student_skills: skillMemory || [],
      question: {
        text: targetQuestion.text_ar,
        options: (targetQuestion.options || []).map((o: any) => o.textAr || o.text),
        difficulty: targetQuestion.difficulty,
        topic: questionMeta?.topic || targetQuestion.topic || "",
        section: sectionName,
      },
    };

    const systemPrompt = `أنت مساعد "تلميح ذكي" في منصة SARIS للاختبارات.

## القواعد الصارمة:
1. استخدم فقط البيانات المقدمة من منصة SARIS — لا تستخدم معرفتك العامة عن الاختبار.
2. لا تكشف الإجابة الصحيحة أبداً.
3. لا تذكر أي خيار محدد (أ، ب، ج، د).
4. لا تحل السؤال بالكامل.
5. لا تحذف خيارات بشكل يكشف الإجابة.
6. لا تعطي مسار الحساب الكامل الذي يوصل مباشرة للنتيجة.
7. أعط تلميحاً واحداً فقط — قصير ومفيد وآمن.
8. التلميح يجب أن يوجه تفكير الطالب دون حل السؤال.
9. أجب بالعربية فقط.
10. إذا لم تكن البيانات المقدمة كافية لتقديم تلميح مفيد، قل: "هذه المعلومة غير متوفرة في بيانات الاختبار"

## ما يُسمح به:
- توجيه الطالب لمفهوم أو قاعدة ذات صلة
- اقتراح نقطة بداية للتفكير
- تقليل الارتباك
- تذكير بقانون أو علاقة رياضية

## بيانات SARIS المتوفرة:
${JSON.stringify(sarisContext, null, 2)}`;

    const userPrompt = `قدم تلميحاً ذكياً واحداً لهذا السؤال الصعب. تلميح قصير ومفيد يوجه تفكير الطالب دون كشف الإجابة.`;

    // 7. Call Anthropic API
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("[smart-hint-claude] Anthropic error:", anthropicResponse.status, errText);
      return errorRes(502, "فشل في توليد التلميح");
    }

    const anthropicData = await anthropicResponse.json();
    const hintText = anthropicData.content?.[0]?.text || "لا يوجد تلميح متاح";

    // 8. Store hint in session
    const updatedHints = {
      ...existingHints,
      [question_id]: {
        hint_text: hintText,
        hint_used: true,
        model: "claude",
        created_at: new Date().toISOString(),
        mode: "smart_hint",
      },
    };

    const updatedCatSession = {
      ...(catSession || {}),
      hints_json: updatedHints,
    };

    await adminClient
      .from("exam_sessions")
      .update({ cat_session_json: updatedCatSession })
      .eq("id", session_id);

    // 9. Return hint
    return jsonRes({ hint: hintText, already_used: false });
  } catch (err) {
    console.error("[smart-hint-claude] Error:", err);
    return errorRes(500, err instanceof Error ? err.message : "خطأ غير متوقع");
  }
});

function errorRes(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonRes(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
