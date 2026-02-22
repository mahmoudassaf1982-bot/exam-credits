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

    // User client to get the authenticated user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin/service client for DB operations
    const admin = createClient(supabaseUrl, serviceKey);

    const { exam_template_id, session_type } = await req.json();
    if (!exam_template_id || !session_type) {
      return new Response(
        JSON.stringify({ error: "exam_template_id و session_type مطلوبان" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Fetch exam template
    const { data: template, error: tErr } = await admin
      .from("exam_templates")
      .select("*")
      .eq("id", exam_template_id)
      .eq("is_active", true)
      .single();

    if (tErr || !template) {
      return new Response(
        JSON.stringify({ error: "قالب الاختبار غير موجود أو غير مفعّل" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Fetch exam sections
    const { data: sections } = await admin
      .from("exam_sections")
      .select("*")
      .eq("exam_template_id", exam_template_id)
      .order("order", { ascending: true });

    if (!sections || sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "لا توجد أقسام لهذا الاختبار" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Determine points cost
    let pointsCost = 0;
    if (session_type === "simulation") {
      pointsCost = template.simulation_cost_points;
    } else if (session_type === "practice") {
      pointsCost = template.practice_cost_points;
    } else if (session_type === "analysis") {
      pointsCost = template.analysis_cost_points;
    }

    // 4. Check if user is diamond
    const { data: profile } = await admin
      .from("profiles")
      .select("is_diamond")
      .eq("id", user.id)
      .single();

    const isDiamond = profile?.is_diamond ?? false;

    // 5. Check wallet balance & deduct points (if not diamond)
    if (!isDiamond && pointsCost > 0) {
      const { data: wallet } = await admin
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (!wallet || wallet.balance < pointsCost) {
        return new Response(
          JSON.stringify({
            error: "رصيد النقاط غير كافٍ",
            required: pointsCost,
            current: wallet?.balance ?? 0,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Deduct points
      await admin
        .from("wallets")
        .update({ balance: wallet.balance - pointsCost })
        .eq("user_id", user.id);

      // Record transaction
      await admin.from("transactions").insert({
        user_id: user.id,
        type: "debit",
        amount: pointsCost,
        reason:
          session_type === "simulation"
            ? "exam_attempt_session"
            : session_type === "practice"
            ? "practice_session"
            : "exam_analysis",
        meta_json: { exam_template_id, session_type },
      });
    }

    // 6. Assemble questions for each section
    const assembledQuestions: Record<string, unknown[]> = {};
    let totalQuestionCount = 0;

    for (const section of sections) {
      const questionCount = section.question_count || 20;
      const difficultyMix = (section.difficulty_mix_json as Record<string, number>) || {
        easy: 30,
        medium: 50,
        hard: 20,
      };
      const topicFilters = (section.topic_filter_json as string[]) || [];

      // Calculate count per difficulty
      const total = difficultyMix.easy + difficultyMix.medium + difficultyMix.hard;
      const easyCount = Math.round((difficultyMix.easy / total) * questionCount);
      const hardCount = Math.round((difficultyMix.hard / total) * questionCount);
      const mediumCount = questionCount - easyCount - hardCount;

      const difficulties: { level: string; count: number }[] = [
        { level: "easy", count: easyCount },
        { level: "medium", count: mediumCount },
        { level: "hard", count: hardCount },
      ];

      const sectionQuestions: unknown[] = [];

      for (const { level, count } of difficulties) {
        if (count <= 0) continue;

        let query = admin
          .from("questions")
          .select("id, text_ar, options, correct_option_id, explanation, difficulty, topic")
          .eq("is_approved", true)
          .eq("country_id", template.country_id)
          .eq("difficulty", level);

        // Apply topic filters if specified
        if (topicFilters.length > 0) {
          query = query.in("topic", topicFilters);
        }

        // Apply section filter if questions have section_id
        if (section.id) {
          // Try section-specific first, fall back to any
          const { data: sectionSpecific } = await query
            .eq("section_id", section.id)
            .limit(count);

          if (sectionSpecific && sectionSpecific.length > 0) {
            sectionQuestions.push(...sectionSpecific);
            continue;
          }
        }

        // Fallback: get questions without section restriction
        const { data: questions } = await query.limit(count);
        if (questions) {
          sectionQuestions.push(...questions);
        }
      }

      // Shuffle questions within section
      for (let i = sectionQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sectionQuestions[i], sectionQuestions[j]] = [sectionQuestions[j], sectionQuestions[i]];
      }

      assembledQuestions[section.id] = sectionQuestions;
      totalQuestionCount += sectionQuestions.length;
    }

    // 7. Build exam snapshot (frozen copy of template + sections)
    const examSnapshot = {
      template: {
        id: template.id,
        name_ar: template.name_ar,
        slug: template.slug,
        country_id: template.country_id,
        default_time_limit_sec: template.default_time_limit_sec,
        default_question_count: template.default_question_count,
      },
      sections: sections.map((s: Record<string, unknown>) => ({
        id: s.id,
        name_ar: s.name_ar,
        order: s.order,
        question_count: s.question_count,
        time_limit_sec: s.time_limit_sec,
        difficulty_mix_json: s.difficulty_mix_json,
      })),
    };

    // 8. Create exam session
    const { data: session, error: sessionErr } = await admin
      .from("exam_sessions")
      .insert({
        user_id: user.id,
        exam_template_id,
        session_type,
        status: "in_progress",
        exam_snapshot: examSnapshot,
        questions_json: assembledQuestions,
        answers_json: {},
        time_limit_sec: template.default_time_limit_sec,
        points_cost: isDiamond ? 0 : pointsCost,
      })
      .select("id")
      .single();

    if (sessionErr) {
      console.error("Session creation error:", sessionErr);
      return new Response(
        JSON.stringify({ error: "فشل في إنشاء جلسة الاختبار", details: sessionErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        session_id: session.id,
        total_questions: totalQuestionCount,
        sections_count: sections.length,
        points_deducted: isDiamond ? 0 : pointsCost,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Assemble exam error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
