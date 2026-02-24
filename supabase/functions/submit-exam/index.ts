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

// ── Difficulty weight multiplier ──
function difficultyWeight(difficulty: string): number {
  switch (difficulty) {
    case "hard": return 1.5;
    case "medium": return 1.0;
    case "easy": return 0.7;
    default: return 1.0;
  }
}

/** Update skill_memory for a user after exam/training submission */
async function updateSkillMemory(
  admin: ReturnType<typeof createClient>,
  userId: string,
  examTemplateId: string,
  sessionType: string,
  sectionScores: Record<string, { correct: number; total: number; name: string }>,
  questionsJson: Record<string, any[]>,
  answersKeyJson: Record<string, Record<string, { correct_option_id: string }>>,
  finalAnswers: Record<string, string>
) {
  // Weight: performance_exam = 3x, training = 1x
  const isExam = sessionType === "simulation";
  const sessionWeight = isExam ? 3 : 1;
  const now = new Date().toISOString();

  for (const [sectionId, score] of Object.entries(sectionScores)) {
    const sectionQuestions = questionsJson[sectionId] || [];
    const sectionKeys = answersKeyJson[sectionId] || {};

    // Calculate weighted impact per question based on difficulty
    let weightedCorrect = 0;
    let weightedTotal = 0;

    for (const q of sectionQuestions) {
      const dw = difficultyWeight(q.difficulty || "medium") * sessionWeight;
      weightedTotal += dw;
      const userAnswer = finalAnswers[q.id];
      const key = sectionKeys[q.id];
      if (userAnswer && key && userAnswer === key.correct_option_id) {
        weightedCorrect += dw;
      }
    }

    const sectionAccuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    // Fetch existing skill memory
    const { data: existing } = await admin
      .from("skill_memory")
      .select("*")
      .eq("user_id", userId)
      .eq("exam_template_id", examTemplateId)
      .eq("section_id", sectionId)
      .single();

    if (existing) {
      // Merge: accumulate weighted scores, recalculate skill_score
      const newWeightedCorrect = (Number(existing.weighted_correct) || 0) + weightedCorrect;
      const newWeightedTotal = (Number(existing.weighted_total) || 0) + weightedTotal;
      const newTotalCorrect = existing.total_correct + score.correct;
      const newTotalAnswered = existing.total_answered + score.total;

      // Skill score = weighted accuracy (0-100)
      const newSkillScore = newWeightedTotal > 0
        ? Math.round((newWeightedCorrect / newWeightedTotal) * 100)
        : Number(existing.skill_score);

      const oldSkillScore = Number(existing.skill_score);

      const updatePayload: Record<string, unknown> = {
        skill_score: newSkillScore,
        total_correct: newTotalCorrect,
        total_answered: newTotalAnswered,
        weighted_correct: newWeightedCorrect,
        weighted_total: newWeightedTotal,
        section_name: score.name,
      };

      if (isExam) {
        updatePayload.last_exam_score = sectionAccuracy;
        updatePayload.last_exam_date = now;
      } else {
        updatePayload.last_training_score = sectionAccuracy;
        updatePayload.last_training_date = now;
      }

      await admin
        .from("skill_memory")
        .update(updatePayload)
        .eq("id", existing.id);

      console.log(
        `[skill-memory] Section "${score.name}" (${sectionId}): ` +
        `score ${oldSkillScore} → ${newSkillScore} | ` +
        `type=${isExam ? "exam(3x)" : "training(1x)"} | ` +
        `session: ${score.correct}/${score.total} | ` +
        `cumulative: ${newTotalCorrect}/${newTotalAnswered}`
      );
    } else {
      // New record
      const skillScore = weightedTotal > 0
        ? Math.round((weightedCorrect / weightedTotal) * 100)
        : 50;

      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        exam_template_id: examTemplateId,
        section_id: sectionId,
        section_name: score.name,
        skill_score: skillScore,
        total_correct: score.correct,
        total_answered: score.total,
        weighted_correct: weightedCorrect,
        weighted_total: weightedTotal,
      };

      if (isExam) {
        insertPayload.last_exam_score = sectionAccuracy;
        insertPayload.last_exam_date = now;
      } else {
        insertPayload.last_training_score = sectionAccuracy;
        insertPayload.last_training_date = now;
      }

      await admin
        .from("skill_memory")
        .insert(insertPayload);

      console.log(
        `[skill-memory] NEW Section "${score.name}" (${sectionId}): ` +
        `score=0 → ${skillScore} | ` +
        `type=${isExam ? "exam(3x)" : "training(1x)"} | ` +
        `${score.correct}/${score.total}`
      );
    }
  }
}

/** Calculate and store predictive score based on skill memory + exam blueprint */
async function updatePredictiveScore(
  admin: ReturnType<typeof createClient>,
  userId: string,
  examTemplateId: string
) {
  // 1. Fetch exam blueprint sections
  const { data: sections } = await admin
    .from("exam_sections")
    .select("id, name_ar, question_count")
    .eq("exam_template_id", examTemplateId)
    .order("order", { ascending: true });

  if (!sections || sections.length === 0) {
    console.log("[predictive-score] No sections found for template");
    return;
  }

  const totalBlueprintQuestions = sections.reduce((sum: number, s: any) => sum + s.question_count, 0);
  if (totalBlueprintQuestions === 0) return;

  // 2. Fetch skill memory for all sections
  const { data: skillMemory } = await admin
    .from("skill_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_template_id", examTemplateId);

  const skillMap = new Map((skillMemory || []).map((sm: any) => [sm.section_id, sm]));

  // 3. Calculate weighted prediction
  let weightedSum = 0;
  const breakdown: any[] = [];

  for (const section of sections) {
    const weight = section.question_count / totalBlueprintQuestions;
    const sm = skillMap.get(section.id) as any;
    const skillScore = sm ? Number(sm.skill_score) : 50; // default 50 if no data
    const contribution = skillScore * weight;
    weightedSum += contribution;

    breakdown.push({
      section_id: section.id,
      section_name: section.name_ar,
      skill_score: Math.round(skillScore),
      weight: Math.round(weight * 100),
      weighted_contribution: Math.round(contribution * 10) / 10,
    });
  }

  const predictedScore = Math.round(weightedSum);

  // 4. Calculate confidence level
  const { data: sessionCounts } = await admin
    .from("exam_sessions")
    .select("session_type")
    .eq("user_id", userId)
    .eq("exam_template_id", examTemplateId)
    .in("status", ["completed", "submitted"]);

  const trainingCount = (sessionCounts || []).filter((s: any) => s.session_type === "practice").length;
  const examCount = (sessionCounts || []).filter((s: any) => s.session_type === "simulation").length;
  const totalSessions = trainingCount + examCount;

  let confidenceLevel = "low";
  if (totalSessions > 5 && examCount >= 1) {
    confidenceLevel = "high";
  } else if (totalSessions >= 2) {
    confidenceLevel = "medium";
  }

  // 5. Upsert prediction
  const { error } = await admin
    .from("score_predictions")
    .upsert({
      user_id: userId,
      exam_template_id: examTemplateId,
      predicted_score: predictedScore,
      confidence_level: confidenceLevel,
      section_breakdown: breakdown,
      training_session_count: trainingCount,
      exam_session_count: examCount,
      calculated_at: new Date().toISOString(),
    }, { onConflict: "user_id,exam_template_id" });

  if (error) {
    console.error("[predictive-score] Upsert failed:", error);
    return;
  }

  console.log(
    `[predictive-score] User ${userId}: predicted=${predictedScore}%, confidence=${confidenceLevel}, ` +
    `sections=${breakdown.map((b: any) => `${b.section_name}:${b.skill_score}%×${b.weight}%`).join(", ")}`
  );
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

    // Fetch session
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, exam_snapshot, questions_json, last_submit_id, expires_at, answers_json, attempt_token_hash, session_type, exam_template_id")
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

    // Update session — INVALIDATE token
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

    // ── UPDATE SKILL MEMORY ──
    try {
      await updateSkillMemory(
        admin,
        user.id,
        session.exam_template_id,
        session.session_type,
        sectionScores,
        questionsJson,
        answersKeyJson,
        finalAnswers
      );
      console.log(`[submit-exam] Skill memory updated for session ${session_id}, type=${session.session_type}`);
    } catch (smErr) {
      console.error("[submit-exam] Skill memory update failed:", smErr);
    }

    // ── UPDATE PREDICTIVE SCORE ──
    try {
      await updatePredictiveScore(admin, user.id, session.exam_template_id);
    } catch (predErr) {
      console.error("[submit-exam] Predictive score update failed:", predErr);
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
