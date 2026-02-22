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
    const { session_id, answers } = await req.json();

    if (!session_id || !answers) {
      return new Response(
        JSON.stringify({ error: "session_id و answers مطلوبان" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session (service role bypasses RLS)
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, exam_snapshot, questions_json")
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

    if (session.status === "completed") {
      return new Response(
        JSON.stringify({ error: "الجلسة مكتملة بالفعل" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Build full review questions (with correct answers + explanations)
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

        // Add correct answer info for review
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

    // Update session with results
    const { error: updateErr } = await admin
      .from("exam_sessions")
      .update({
        status: "completed",
        answers_json: answers,
        score_json: scoreData,
        review_questions_json: reviewQuestions,
        completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (updateErr) {
      console.error("Failed to update session:", updateErr);
      return new Response(
        JSON.stringify({ error: "فشل في حفظ النتيجة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        score: scoreData,
        review_questions: reviewQuestions,
      }),
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
