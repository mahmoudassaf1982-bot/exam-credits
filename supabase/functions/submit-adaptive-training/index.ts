import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function difficultyWeight(difficulty: string): number {
  switch (difficulty) {
    case "hard": return 1.5;
    case "medium": return 1.0;
    case "easy": return 0.7;
    default: return 1.0;
  }
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
    const body = await req.json();
    const {
      session_id,
      answers,          // Record<questionId, optionId>
      cat_session_data, // Full CAT state from client
    } = body;

    if (!session_id || !answers || !cat_session_data) {
      return new Response(
        JSON.stringify({ error: "session_id, answers, cat_session_data مطلوبين" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, exam_snapshot, questions_json, exam_template_id, session_type")
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
        JSON.stringify({ error: "غير مصرح" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.status === "completed" || session.status === "submitted") {
      // Already submitted, return existing
      const { data: existingSub } = await admin
        .from("exam_submissions")
        .select("result_json")
        .eq("session_id", session_id)
        .single();

      if (existingSub?.result_json) {
        const result = existingSub.result_json as Record<string, unknown>;
        return new Response(
          JSON.stringify({ ...result, already_submitted: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch answer keys for server-side verification
    const { data: keyRow } = await admin
      .from("exam_answer_keys")
      .select("answers_key_json")
      .eq("session_id", session_id)
      .single();

    if (!keyRow) {
      return new Response(
        JSON.stringify({ error: "مفاتيح الإجابات غير موجودة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const answersKeyJson = keyRow.answers_key_json as Record<string, Record<string, { correct_option_id: string; explanation?: string }>>;
    const questionsJson = session.questions_json as Record<string, any[]>;
    const snapshot = session.exam_snapshot as { sections: { id: string; name_ar: string }[] };

    // Server-side scoring (re-verify all answers)
    let totalCorrect = 0;
    let totalQuestions = 0;
    let totalAttempted = 0;
    const sectionScores: Record<string, { correct: number; total: number; name: string }> = {};
    const reviewQuestions: Record<string, any[]> = {};

    // Re-verify per-question correctness from cat_session_data
    const verifiedAnswers: {
      questionId: string;
      isCorrect: boolean;
      difficulty: string;
      timeSpentMs: number;
      topic: string;
    }[] = [];

    for (const section of (snapshot?.sections || [])) {
      const sectionKeys = answersKeyJson[section.id] || {};
      const sectionQs = questionsJson[section.id] || [];
      let sCorrect = 0;
      const sTotal = sectionQs.length;

      const reviewQs: any[] = [];

      for (const q of sectionQs) {
        const key = sectionKeys[q.id];
        const userAnswer = answers[q.id];

        // Only count questions that were actually served by CAT
        const catAnswer = (cat_session_data.answers || []).find((a: any) => a.questionId === q.id);
        if (!catAnswer) continue;

        totalQuestions++;
        const isCorrect = key ? userAnswer === key.correct_option_id : false;

        if (userAnswer) {
          totalAttempted++;
          if (isCorrect) {
            sCorrect++;
            totalCorrect++;
          }
        }

        verifiedAnswers.push({
          questionId: q.id,
          isCorrect,
          difficulty: q.difficulty || "medium",
          timeSpentMs: catAnswer.timeSpentMs || 0,
          topic: q.topic || "",
        });

        reviewQs.push({
          ...q,
          correct_option_id: key?.correct_option_id || "",
          explanation: key?.explanation || null,
        });
      }

      if (reviewQs.length > 0) {
        sectionScores[section.id] = { correct: sCorrect, total: reviewQs.length, name: section.name_ar };
        reviewQuestions[section.id] = reviewQs;
      }
    }

    // If no questions scored (might happen if questionsJson structure differs), 
    // use CAT data directly for scoring
    if (totalQuestions === 0 && cat_session_data.answers?.length > 0) {
      const allKeys = Object.values(answersKeyJson).reduce((acc, sectionKeys) => ({ ...acc, ...sectionKeys }), {});
      
      for (const catAnswer of cat_session_data.answers) {
        totalQuestions++;
        const key = (allKeys as any)[catAnswer.questionId];
        const userAnswer = answers[catAnswer.questionId];
        const isCorrect = key ? userAnswer === key.correct_option_id : false;

        if (userAnswer) {
          totalAttempted++;
          if (isCorrect) totalCorrect++;
        }

        verifiedAnswers.push({
          questionId: catAnswer.questionId,
          isCorrect,
          difficulty: catAnswer.difficulty || "medium",
          timeSpentMs: catAnswer.timeSpentMs || 0,
          topic: catAnswer.topic || "",
        });
      }

      // Build section scores from verified data
      const sectionId = snapshot?.sections?.[0]?.id || "adaptive";
      const sectionName = snapshot?.sections?.[0]?.name_ar || "تدريب تكيّفي";
      sectionScores[sectionId] = { correct: totalCorrect, total: totalQuestions, name: sectionName };
    }

    const percentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Re-calculate ability score server-side
    const DIFFICULTY_WEIGHTS: Record<string, number> = { easy: 30, medium: 50, hard: 80 };
    let weightedCorrect = 0;
    let totalWeight = 0;
    for (const a of verifiedAnswers) {
      const w = DIFFICULTY_WEIGHTS[a.difficulty] || 50;
      totalWeight += w;
      if (a.isCorrect) weightedCorrect += w;
    }
    const weightedAccuracy = totalWeight > 0 ? (weightedCorrect / totalWeight) * 100 : 50;
    const fastCorrect = verifiedAnswers.filter(a => a.isCorrect && a.timeSpentMs < 30000).length;
    const speedBonus = Math.min(10, verifiedAnswers.length > 0 ? (fastCorrect / verifiedAnswers.length) * 15 : 0);
    const hardCorrect = verifiedAnswers.filter(a => a.isCorrect && a.difficulty === "hard").length;
    const difficultyBonus = Math.min(8, hardCorrect * 3);
    const serverAbilityScore = Math.min(100, Math.max(0, Math.round(weightedAccuracy + speedBonus + difficultyBonus)));

    // Build topic performance
    const topicPerformance: Record<string, { correct: number; total: number }> = {};
    for (const a of verifiedAnswers) {
      if (!topicPerformance[a.topic]) topicPerformance[a.topic] = { correct: 0, total: 0 };
      topicPerformance[a.topic].total++;
      if (a.isCorrect) topicPerformance[a.topic].correct++;
    }

    const weakTopics = Object.entries(topicPerformance)
      .filter(([, p]) => p.total >= 2 && (p.correct / p.total) < 0.5)
      .map(([topic, p]) => ({ topic, accuracy: Math.round((p.correct / p.total) * 100), attempted: p.total }));

    const strongTopics = Object.entries(topicPerformance)
      .filter(([, p]) => p.total >= 2 && (p.correct / p.total) >= 0.7)
      .map(([topic, p]) => ({ topic, accuracy: Math.round((p.correct / p.total) * 100), attempted: p.total }));

    const avgResponseTimeMs = verifiedAnswers.length > 0
      ? Math.round(verifiedAnswers.reduce((s, a) => s + a.timeSpentMs, 0) / verifiedAnswers.length)
      : 0;

    // Build CAT session JSON for storage
    const catSessionJson = {
      ability_score: serverAbilityScore,
      accuracy_rate: percentage,
      avg_response_time_ms: avgResponseTimeMs,
      difficulty_progression: cat_session_data.difficultyProgression || [],
      questions_served: verifiedAnswers.map(a => a.questionId),
      per_question_data: verifiedAnswers.map(a => ({
        question_id: a.questionId,
        is_correct: a.isCorrect,
        difficulty: a.difficulty,
        time_spent_ms: a.timeSpentMs,
        topic: a.topic,
        selected_option: answers[a.questionId] || null,
      })),
      topic_performance: topicPerformance,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      speed_rating: avgResponseTimeMs < 25000 ? "سريع" : avgResponseTimeMs < 45000 ? "متوسط" : "بطيء",
      accuracy_rating: percentage >= 80 ? "ممتاز" : percentage >= 60 ? "جيد" : percentage >= 40 ? "متوسط" : "يحتاج تحسين",
    };

    const scoreData = {
      total_correct: totalCorrect,
      total_questions: totalQuestions,
      total_attempted: totalAttempted,
      percentage,
      section_scores: sectionScores,
      ability_score: serverAbilityScore,
    };

    const resultPayload = {
      score: scoreData,
      review_questions: reviewQuestions,
      cat_summary: catSessionJson,
    };

    // Insert submission
    const idempotencyKey = `cat-${session_id}-${Date.now()}`;
    const { data: submission, error: subErr } = await admin
      .from("exam_submissions")
      .insert({
        session_id,
        user_id: user.id,
        idempotency_key: idempotencyKey,
        result_json: resultPayload,
      })
      .select("id")
      .single();

    if (subErr) {
      console.error("Submission error:", subErr);
      return new Response(
        JSON.stringify({ error: "فشل في حفظ النتيجة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update session with CAT data
    await admin
      .from("exam_sessions")
      .update({
        status: "completed",
        answers_json: answers,
        score_json: scoreData,
        review_questions_json: reviewQuestions,
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        last_submit_id: submission.id,
        cat_session_json: catSessionJson,
      })
      .eq("id", session_id);

    // ── Update skill memory per section ──
    try {
      // Map verified answers to section-based performance for skill_memory
      // Use the actual section_id from the questions pool
      const sectionQuestionMap: Record<string, { correct: number; total: number; weighted_correct: number; weighted_total: number }> = {};
      
      for (const a of verifiedAnswers) {
        // Try to find the original section from questionsJson
        let foundSection = "";
        for (const [secId, secQs] of Object.entries(questionsJson)) {
          if ((secQs as any[]).find((q: any) => q.id === a.questionId)) {
            foundSection = secId;
            break;
          }
        }
        if (!foundSection) foundSection = snapshot?.sections?.[0]?.id || "adaptive";

        if (!sectionQuestionMap[foundSection]) {
          sectionQuestionMap[foundSection] = { correct: 0, total: 0, weighted_correct: 0, weighted_total: 0 };
        }
        const dw = difficultyWeight(a.difficulty);
        sectionQuestionMap[foundSection].total++;
        sectionQuestionMap[foundSection].weighted_total += dw;
        if (a.isCorrect) {
          sectionQuestionMap[foundSection].correct++;
          sectionQuestionMap[foundSection].weighted_correct += dw;
        }
      }

      // Update skill_memory for each section
      const now = new Date().toISOString();
      for (const [sectionId, data] of Object.entries(sectionQuestionMap)) {
        if (sectionId === "adaptive") continue; // Skip virtual section

        const { data: existing } = await admin
          .from("skill_memory")
          .select("*")
          .eq("user_id", user.id)
          .eq("exam_template_id", session.exam_template_id)
          .eq("section_id", sectionId)
          .single();

        const sectionName = sectionScores[sectionId]?.name || sectionId;

        if (existing) {
          const newWC = (Number((existing as any).weighted_correct) || 0) + data.weighted_correct;
          const newWT = (Number((existing as any).weighted_total) || 0) + data.weighted_total;
          const newTC = (existing as any).total_correct + data.correct;
          const newTA = (existing as any).total_answered + data.total;
          const newSkill = newWT > 0 ? Math.round((newWC / newWT) * 100) : Number((existing as any).skill_score);

          await admin.from("skill_memory").update({
            skill_score: newSkill,
            total_correct: newTC,
            total_answered: newTA,
            weighted_correct: newWC,
            weighted_total: newWT,
            section_name: sectionName,
            last_training_score: data.total > 0 ? Math.round((data.correct / data.total) * 100) : null,
            last_training_date: now,
          }).eq("id", (existing as any).id);
        } else {
          const skillScore = data.weighted_total > 0 ? Math.round((data.weighted_correct / data.weighted_total) * 100) : 50;
          await admin.from("skill_memory").insert({
            user_id: user.id,
            exam_template_id: session.exam_template_id,
            section_id: sectionId,
            section_name: sectionName,
            skill_score: skillScore,
            total_correct: data.correct,
            total_answered: data.total,
            weighted_correct: data.weighted_correct,
            weighted_total: data.weighted_total,
            last_training_score: data.total > 0 ? Math.round((data.correct / data.total) * 100) : null,
            last_training_date: now,
          });
        }
      }
      console.log(`[submit-adaptive] Skill memory updated`);
    } catch (smErr) {
      console.error("[submit-adaptive] Skill memory error:", smErr);
    }

    // ── Update predictive score ──
    try {
      const { data: allSections } = await admin
        .from("exam_sections")
        .select("id, name_ar, question_count")
        .eq("exam_template_id", session.exam_template_id)
        .order("order", { ascending: true });

      if (allSections && allSections.length > 0) {
        const totalBlueprint = allSections.reduce((s: number, sec: any) => s + sec.question_count, 0);
        const { data: skillMemory } = await admin
          .from("skill_memory")
          .select("*")
          .eq("user_id", user.id)
          .eq("exam_template_id", session.exam_template_id);

        const skillMap = new Map((skillMemory || []).map((sm: any) => [sm.section_id, sm]));
        let weightedSum = 0;
        const breakdown: any[] = [];

        for (const sec of allSections) {
          const weight = sec.question_count / totalBlueprint;
          const sm = skillMap.get(sec.id) as any;
          const skillScore = sm ? Number(sm.skill_score) : 50;
          weightedSum += skillScore * weight;
          breakdown.push({
            section_id: sec.id,
            section_name: sec.name_ar,
            skill_score: Math.round(skillScore),
            weight: Math.round(weight * 100),
          });
        }

        const { data: sessionCounts } = await admin
          .from("exam_sessions")
          .select("session_type")
          .eq("user_id", user.id)
          .eq("exam_template_id", session.exam_template_id)
          .in("status", ["completed", "submitted"]);

        const trainingCount = (sessionCounts || []).filter((s: any) => 
          s.session_type === "practice" || s.session_type === "adaptive_training"
        ).length;
        const examCount = (sessionCounts || []).filter((s: any) => s.session_type === "simulation").length;
        const totalSessions = trainingCount + examCount;
        let confidence = "low";
        if (totalSessions > 5 && examCount >= 1) confidence = "high";
        else if (totalSessions >= 2) confidence = "medium";

        await admin.from("score_predictions").upsert({
          user_id: user.id,
          exam_template_id: session.exam_template_id,
          predicted_score: Math.round(weightedSum),
          confidence_level: confidence,
          section_breakdown: breakdown,
          training_session_count: trainingCount,
          exam_session_count: examCount,
          calculated_at: now,
        }, { onConflict: "user_id,exam_template_id" });

        console.log(`[submit-adaptive] Predictive score updated: ${Math.round(weightedSum)}%`);
      }
    } catch (predErr) {
      console.error("[submit-adaptive] Prediction error:", predErr);
    }

    // ── Calibrate question difficulty ──
    try {
      for (const a of verifiedAnswers) {
        const { data: q } = await admin
          .from("questions")
          .select("attempts_count, correct_count, difficulty, difficulty_source, last_calibrated_attempts")
          .eq("id", a.questionId)
          .single();

        if (!q) continue;

        const newAttempts = (q.attempts_count || 0) + 1;
        const newCorrect = (q.correct_count || 0) + (a.isCorrect ? 1 : 0);
        const newAccuracy = newAttempts > 0 ? newCorrect / newAttempts : 0;

        await admin.from("questions").update({
          attempts_count: newAttempts,
          correct_count: newCorrect,
          accuracy: Math.round(newAccuracy * 10000) / 10000,
        }).eq("id", a.questionId);
      }
    } catch (calErr) {
      console.error("[submit-adaptive] Calibration error:", calErr);
    }

    const now = new Date().toISOString();

    console.log(
      `[submit-adaptive] Session ${session_id}: ability=${serverAbilityScore}, ` +
      `accuracy=${percentage}%, correct=${totalCorrect}/${totalQuestions}, ` +
      `weak=${weakTopics.length}, strong=${strongTopics.length}`
    );

    return new Response(
      JSON.stringify(resultPayload),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Submit adaptive training error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
