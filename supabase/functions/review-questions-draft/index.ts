import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userSupabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminSupabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const { draft_id } = await req.json();
    if (!draft_id) return jsonResponse({ error: "draft_id required" }, 400);

    // Fetch draft
    const { data: draft, error: draftError } = await adminSupabase
      .from("question_drafts")
      .select("*")
      .eq("id", draft_id)
      .single();

    if (draftError || !draft) return jsonResponse({ error: "Draft not found" }, 404);

    const questions = draft.draft_questions_json as any[];
    if (!Array.isArray(questions) || questions.length === 0) {
      return jsonResponse({ error: "Draft has no questions" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Fetch some existing approved questions for duplicate check
    const { data: existingQuestions } = await adminSupabase
      .from("questions")
      .select("text_ar")
      .eq("country_id", draft.country_id)
      .eq("status", "approved")
      .eq("is_approved", true)
      .limit(200);

    const existingTexts = (existingQuestions || []).map((q: any) => q.text_ar).join("\n---\n");

    const reviewerModel = "google/gemini-2.5-pro";

    const questionsForReview = questions.map((q: any, i: number) => ({
      index: i,
      text_ar: q.text_ar,
      options: q.options,
      correct_option_id: q.correct_option_id,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic,
    }));

    const systemPrompt = `You are a Senior Exam Quality Reviewer AND Auto-Corrector for SARIS Exams. Your job is to review AND fix AI-generated exam questions.

For EACH question, you must:
1. REVIEW: Check for issues (ambiguity, wrong answer, grammar, difficulty mismatch, hint in stem, weak distractors, duplicates)
2. AUTO-FIX: Return a CORRECTED version of the question with ALL issues resolved

Corrections include:
- Fix Arabic grammar and formal language
- Fix incorrect correct_option_id if the marked answer is wrong
- Improve weak distractors to be more plausible
- Rewrite ambiguous stems for clarity
- Adjust difficulty if mismatched
- Fix explanation to match the correct answer
- Remove any hints to the answer from the stem

Return a JSON object with:
{
  "overall_ok": boolean,
  "summary": string (1-2 sentences overall assessment),
  "issues_count": number,
  "reviews": [
    {
      "index": number,
      "ok": boolean,
      "score": number (0-10),
      "issues": string[] (list of specific issues found, empty if ok),
      "suggestions": string[] (what was changed/improved),
      "duplicate_risk": boolean,
      "corrected": {
        "text_ar": string (corrected question text),
        "options": [{"id": "a", "textAr": string}, {"id": "b", "textAr": string}, {"id": "c", "textAr": string}, {"id": "d", "textAr": string}],
        "correct_option_id": string (a/b/c/d),
        "explanation": string (corrected explanation),
        "difficulty": string (easy/medium/hard),
        "topic": string
      }
    }
  ]
}

IMPORTANT: The "corrected" field must ALWAYS be present for every question, even if ok=true (return improved/polished version).
Be strict but fair. Fix real issues. Polish language even for "ok" questions.`;

    const userPrompt = `Review and auto-correct these ${questionsForReview.length} questions (requested difficulty: ${draft.difficulty}):

${JSON.stringify(questionsForReview, null, 2)}

${existingTexts ? `\n\nExisting approved questions for duplicate check:\n${existingTexts.substring(0, 8000)}` : ""}

Return JSON ONLY.`;

    console.log("[review-questions-draft] Reviewing+correcting draft:", draft_id, "with", reviewerModel);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: reviewerModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[review-questions-draft] AI error:", aiResponse.status);
      return jsonResponse({
        error: aiResponse.status === 429 ? "Rate limited" : "AI review error",
        details: errText.substring(0, 500),
      }, aiResponse.status === 429 || aiResponse.status === 402 ? aiResponse.status : 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let report: any;
    try {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      report = JSON.parse(objMatch?.[0] || cleaned);
    } catch {
      report = { overall_ok: false, summary: "Failed to parse reviewer output", issues_count: -1, reviews: [], raw_excerpt: cleaned.substring(0, 1000) };
    }

    // Extract corrected questions from the review report
    const correctedQuestions = questions.map((originalQ: any, i: number) => {
      const review = report.reviews?.find((r: any) => r.index === i);
      if (review?.corrected) {
        return {
          ...originalQ,
          text_ar: review.corrected.text_ar || originalQ.text_ar,
          options: review.corrected.options || originalQ.options,
          correct_option_id: review.corrected.correct_option_id || originalQ.correct_option_id,
          explanation: review.corrected.explanation || originalQ.explanation,
          difficulty: review.corrected.difficulty || originalQ.difficulty,
          topic: review.corrected.topic || originalQ.topic,
        };
      }
      return originalQ;
    });

    // Determine new status
    const hasIssues = report.issues_count > 0 || report.overall_ok === false;
    const newStatus = hasIssues ? "needs_fix" : "pending_review";

    // Update draft with review results AND corrected version
    const { error: updateError } = await adminSupabase
      .from("question_drafts")
      .update({
        reviewer_report_json: report,
        reviewer_model: reviewerModel,
        corrected_questions_json: correctedQuestions,
        status: newStatus,
      })
      .eq("id", draft_id);

    if (updateError) {
      console.error("[review-questions-draft] Update error:", updateError);
      return jsonResponse({ error: "Failed to save review", details: updateError.message }, 500);
    }

    console.log("[review-questions-draft] ✅ Review+correction complete. Status:", newStatus, "Issues:", report.issues_count);

    return jsonResponse({
      ok: true,
      draft_id,
      status: newStatus,
      report,
      corrected_count: correctedQuestions.length,
    });
  } catch (e) {
    console.error("[review-questions-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
