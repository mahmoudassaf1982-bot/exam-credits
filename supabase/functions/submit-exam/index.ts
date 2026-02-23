import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** SHA-256 hex hash using Web Crypto */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { session_id, answers, idempotency_key, attempt_token } = await req.json();

    if (!session_id || !answers || !idempotency_key || !attempt_token) {
      return new Response(
        JSON.stringify({ error: "session_id و answers و idempotency_key و attempt_token مطلوبان" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session (include attempt_token_hash for verification)
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, exam_snapshot, questions_json, last_submit_id, expires_at, answers_json, attempt_token_hash")
      .eq("id", session_id)
      .single();

    if (sErr || !session) {
      return new Response(
        JSON.stringify({ error: "الجلسة غير موجودة" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "غير مصرح بالوصول لهذه الجلسة" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Anti-cheat: If already submitted/completed, return existing result
    if (session.status === "completed" || session.status === "submitted") {
      const { data: existingSub } = await admin
        .from("exam_submissions")
        .select("result_json")
        .eq("session_id", session_id)
        .single();

      if (existingSub?.result_json) {
        const result = existingSub.result_json as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            score: result.score,
            review_questions: result.review_questions,
            already_submitted: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "الجلسة مكتملة بالفعل" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.status === "expired") {
      return new Response(
        JSON.stringify({ error: "انتهى وقت الاختبار", expired: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ATTEMPT TOKEN VERIFICATION ──
    const submittedHash = await sha256Hex(attempt_token);
    if (!session.attempt_token_hash || submittedHash !== session.attempt_token_hash) {
      console.warn(`Token mismatch for session ${session_id}, user ${user.id}`);
      return new Response(
        JSON.stringify({ error: "رمز الجلسة غير صالح أو منتهي الصلاحية" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SERVER-SIDE TIME ENFORCEMENT
    const now = new Date();
    let finalAnswers = answers;

    if (session.expires_at && now > new Date(session.expires_at)) {
      console.log("Session expired server-side, auto-submitting with saved answers");
      finalAnswers = (session.answers_json as Record<string, string>) || {};

      await admin
        .from("exam_sessions")
        .update({ status: "expired" })
        .eq("id", session_id)
        .eq("status", "in_progress");
    }

    // Idempotency check
    const { data: existingByKey } = await admin
      .from("exam_submissions")
      .select("result_json")
      .eq("session_id", session_id)
      .eq("idempotency_key", idempotency_key)
      .single();

    if (existingByKey?.result_json) {
      const result = existingByKey.result_json as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          score: result.score,
          review_questions: result.review_questions,
          already_submitted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch answer keys
    const { data: keyRow, error: keyErr } = await admin
      .from("exam_answer_keys")
      .select("answers_key_json")
      .eq("session_id", session_id)
      .single();

    if (keyErr || !keyRow) {
      return new Response(
        JSON.stringify({ error: "مفاتيح الإجابات غير موجودة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const answersKeyJson = keyRow.answers_key_json as Record<string, Record<string, { correct_option_id: string; explanation?: string }>>;
    const questionsJson = session.questions_json as Record<string, any[]>;
    const snapshot = session.exam_snapshot as { sections: { id: string; name_ar: string }[] };
    const sections = snapshot?.sections || [];

    let totalCorrect = 0;
    let totalQuestions = 0;
    let totalAttempted = 0;
    const sectionScores: Record<string, { correct: number; total: number; name: string }> = {};
    const reviewQuestions: Record<string, any[]> = {};

    for (const section of sections) {
      const sectionKeys = answersKeyJson[section.id] || {};
      const sectionQs = questionsJson[section.id] || [];
      let sCorrect = 0;
      const sTotal = sectionQs.length;
      totalQuestions += sTotal;

      const reviewQs: any[] = [];

      for (const q of sectionQs) {
        const key = sectionKeys[q.id];
        const userAnswer = finalAnswers[q.id];

        if (userAnswer) {
          totalAttempted++;
          if (key && userAnswer === key.correct_option_id) {
            sCorrect++;
            totalCorrect++;
          }
        }

        reviewQs.push({
          ...q,
          correct_option_id: key?.correct_option_id || "",
          explanation: key?.explanation || null,
        });
      }

      sectionScores[section.id] = {
        correct: sCorrect,
        total: sTotal,
        name: section.name_ar,
      };
      reviewQuestions[section.id] = reviewQs;
    }

    const percentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const scoreData = {
      total_correct: totalCorrect,
      total_questions: totalQuestions,
      total_attempted: totalAttempted,
      percentage,
      section_scores: sectionScores,
    };

    const resultPayload = {
      score: scoreData,
      review_questions: reviewQuestions,
    };

    // Insert submission record
    const { data: submission, error: subErr } = await admin
      .from("exam_submissions")
      .insert({
        session_id,
        user_id: user.id,
        idempotency_key,
        result_json: resultPayload,
      })
      .select("id")
      .single();

    if (subErr) {
      if (subErr.code === "23505") {
        const { data: raceSub } = await admin
          .from("exam_submissions")
          .select("result_json")
          .eq("session_id", session_id)
          .single();

        if (raceSub?.result_json) {
          const result = raceSub.result_json as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              score: result.score,
              review_questions: result.review_questions,
              already_submitted: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      console.error("Failed to insert submission:", subErr);
      return new Response(
        JSON.stringify({ error: "فشل في حفظ النتيجة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update session — INVALIDATE token by setting hash to NULL (one-time use)
    await admin
      .from("exam_sessions")
      .update({
        status: "completed",
        answers_json: finalAnswers,
        score_json: scoreData,
        review_questions_json: reviewQuestions,
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        last_submit_id: submission.id,
        attempt_token_hash: null,
      })
      .eq("id", session_id);

    return new Response(
      JSON.stringify(resultPayload),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Submit exam error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
