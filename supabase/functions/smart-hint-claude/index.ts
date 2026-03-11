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

    // Student weak skills from skill memory
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

    // 7. Call Anthropic API
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 120,
        temperature: 0.2,
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
    // Post-response processing: sanitize and trim
    let hintText = (anthropicData.content?.[0]?.text || "لا يوجد تلميح متاح").trim();
    // Enforce max length (500 chars safety cap)
    if (hintText.length > 500) hintText = hintText.substring(0, 500);

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
