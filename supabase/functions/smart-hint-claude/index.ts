import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_HINTS_PER_EXAM = 5;

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

    // 4. Session-level checks
    const catSession = session.cat_session_json as any;
    const existingHints = catSession?.hints_json || {};
    const hintsUsedCount = Object.values(existingHints).filter((h: any) => h?.hint_used).length;
    const remainingHints = MAX_HINTS_PER_EXAM - hintsUsedCount;

    if (existingHints[question_id]?.hint_used) {
      return jsonRes({
        hint: existingHints[question_id].hint_text,
        source: existingHints[question_id].source || "session",
        already_used: true,
        hints_used: hintsUsedCount,
        hints_remaining: remainingHints,
        max_hints: MAX_HINTS_PER_EXAM,
      });
    }

    if (remainingHints <= 0) {
      return errorRes(400, "لقد استخدمت جميع التلميحات المتاحة في هذه الجلسة");
    }

    // 5. Check global cache
    const { data: cachedHint } = await adminClient
      .from("question_hints_cache")
      .select("id, hint_text, model, usage_count")
      .eq("question_id", question_id)
      .eq("hint_mode", "smart_hint")
      .eq("language", "ar")
      .eq("is_active", true)
      .maybeSingle();

    let hintText: string;
    let hintSource: "cache" | "ai";

    if (cachedHint) {
      hintText = cachedHint.hint_text;
      hintSource = "cache";
      adminClient
        .from("question_hints_cache")
        .update({ usage_count: ((cachedHint as any).usage_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", cachedHint.id)
        .then(() => {});
    } else {
      hintSource = "ai";

      const [
        { data: examProfile },
        { data: examStandards },
        { data: skillMemory },
        { data: questionMeta },
      ] = await Promise.all([
        adminClient.from("exam_profiles").select("profile_json").eq("exam_template_id", session.exam_template_id).eq("status", "approved").maybeSingle(),
        adminClient.from("exam_standards").select("section_name, question_count, difficulty_distribution, topics").eq("exam_template_id", session.exam_template_id),
        adminClient.from("skill_memory").select("section_name, skill_score, total_correct, total_answered").eq("user_id", user.id).eq("exam_template_id", session.exam_template_id),
        adminClient.from("questions").select("topic, difficulty, section_id, explanation").eq("id", question_id).maybeSingle(),
      ]);

      const systemPrompt = `You are the SARIS EXAMS Smart Hint Assistant.

Your role is to generate ONE safe hint for a difficult exam question.

IMPORTANT RULES:
1. You must use ONLY the information provided in the SARIS exam data.
2. You are NOT allowed to rely on your own general knowledge about the exam.
3. You must NOT reveal the correct answer.
4. You must NOT mention which option is correct.
5. You must NOT solve the question fully.
6. You must NOT eliminate answer options in a way that reveals the solution.
7. You must NOT give the final calculation path that directly gives the result.
8. You must provide ONLY ONE short hint.
9. The hint must guide the student's thinking without revealing the answer.
10. The hint must be written in Arabic.
11. If the provided SARIS data is insufficient, respond with:
"هذه المعلومة غير متوفرة في بيانات الاختبار"

The hint must help the student start solving the question while preserving exam integrity.`;

      const weakSkills = (skillMemory || [])
        .filter((s: any) => s.skill_score < 50)
        .map((s: any) => `${s.section_name}: ${s.skill_score}%`);

      const userPrompt = `Exam DNA:
${JSON.stringify(examProfile?.profile_json || "غير متوفر", null, 2)}

Exam Standards:
${JSON.stringify(examStandards || [], null, 2)}

Question Data:
Question Text:
${targetQuestion.text_ar}

Answer Options:
${(targetQuestion.options || []).map((o: any, i: number) => `${i + 1}. ${o.textAr || o.text}`).join("\n")}

Question Metadata:
Topic: ${questionMeta?.topic || targetQuestion.topic || "غير محدد"}
Section: ${sectionName || "غير محدد"}
Difficulty: ${targetQuestion.difficulty}

Student Context:
Weak Skills:
${weakSkills.length > 0 ? weakSkills.join("\n") : "لا توجد نقاط ضعف مسجلة"}

Skill Profile:
${JSON.stringify(skillMemory || [], null, 2)}

Instructions:
Generate ONE safe hint that helps the student think about the problem.
Do NOT solve the question.
Do NOT reveal the answer.`;

      // Call Anthropic Claude API
      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 150,
          temperature: 0.2,
          system: systemPrompt,
          messages: [
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("[smart-hint] Anthropic error:", aiResponse.status, errText);
        if (aiResponse.status === 429) return errorRes(429, "تم تجاوز حد الطلبات، حاول لاحقاً");
        if (aiResponse.status === 402) return errorRes(402, "رصيد غير كافٍ للذكاء الاصطناعي");
        return errorRes(502, "فشل في توليد التلميح");
      }

      const aiData = await aiResponse.json();
      hintText = (aiData.content?.[0]?.text || "لا يوجد تلميح متاح").trim();
      if (hintText.length > 500) hintText = hintText.substring(0, 500);

      // Cache globally
      await adminClient
        .from("question_hints_cache")
        .upsert({
          question_id,
          exam_template_id: session.exam_template_id,
          hint_text: hintText,
          hint_mode: "smart_hint",
          language: "ar",
          model: "claude-sonnet-4-20250514",
          usage_count: 1,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "question_id,hint_mode,language" });
    }

    // 6. Store hint in session
    const updatedHints = {
      ...existingHints,
      [question_id]: {
        hint_text: hintText,
        hint_used: true,
        model: hintSource === "cache" ? (cachedHint?.model || "gemini") : "gemini-2.5-flash",
        source: hintSource,
        created_at: new Date().toISOString(),
        mode: "smart_hint",
      },
    };

    await adminClient
      .from("exam_sessions")
      .update({ cat_session_json: { ...(catSession || {}), hints_json: updatedHints } })
      .eq("id", session_id);

    const newHintsUsed = hintsUsedCount + 1;

    return jsonRes({
      hint: hintText,
      source: hintSource,
      already_used: false,
      hints_used: newHintsUsed,
      hints_remaining: MAX_HINTS_PER_EXAM - newHintsUsed,
      max_hints: MAX_HINTS_PER_EXAM,
    });
  } catch (err) {
    console.error("[smart-hint] Error:", err);
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
