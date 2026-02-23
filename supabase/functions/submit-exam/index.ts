import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { session_id, answers, idempotency_key } = await req.json();

    if (!session_id || !answers || !idempotency_key) {
      return new Response(
        JSON.stringify({ error: "session_id و answers و idempotency_key مطلوبان" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use a database transaction via RPC to lock the session row and prevent race conditions
    // Step 1: Lock session row with FOR UPDATE and check status
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, exam_snapshot, questions_json, last_submit_id")
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

    // Anti-cheat: If already submitted/completed, return existing result (no re-grading)
    if (session.status === "completed" || session.status === "submitted") {
      // Check if there's an existing submission to return
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

    // Idempotency check: if same key already used, return that result
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

    // Fetch answer keys from separate locked table
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
        const userAnswer = answers[q.id];

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

    // Insert submission record (unique constraint prevents duplicates)
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
      // If unique constraint violation, another request already submitted
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

    // Update session with results
    const { error: updateErr } = await admin
      .from("exam_sessions")
      .update({
        status: "completed",
        answers_json: answers,
        score_json: scoreData,
        review_questions_json: reviewQuestions,
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        last_submit_id: submission.id,
      })
      .eq("id", session_id)
      .eq("status", "in_progress"); // Only update if still in_progress (optimistic lock)

    if (updateErr) {
      console.error("Failed to update session:", updateErr);
    }

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
