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

// ─── Constants ───────────────────────────────────────────────────────
const BATCH_SIZE = 10;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const REVIEWER_MODEL = "google/gemini-2.5-pro";

// ─── Types ───────────────────────────────────────────────────────────
interface ReviewItem {
  index: number;
  ok: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  duplicate_risk: boolean;
  corrected: {
    text_ar: string;
    options: { id: string; textAr: string }[];
    correct_option_id: string;
    explanation: string;
    difficulty: string;
    topic: string;
  };
}

interface BatchResult {
  batch_index: number;
  total_batches: number;
  reviews: ReviewItem[];
  ok: boolean;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function buildSystemPrompt(): string {
  return `You are a Senior Exam Quality Reviewer AND Auto-Corrector for SARIS Exams. Your job is to review AND fix AI-generated exam questions.

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
Be strict but fair. Fix real issues. Polish language even for "ok" questions.
Return JSON ONLY.`;
}

function buildBatchUserPrompt(
  batch: any[],
  difficulty: string,
  existingTexts: string
): string {
  return `Review and auto-correct these ${batch.length} questions (requested difficulty: ${difficulty}):

${JSON.stringify(batch, null, 2)}

${existingTexts ? `\nExisting approved questions for duplicate check:\n${existingTexts.substring(0, 4000)}` : ""}

Return JSON ONLY with the "reviews" array.`;
}

async function reviewBatch(
  batch: any[],
  batchIndex: number,
  totalBatches: number,
  difficulty: string,
  existingTexts: string,
  apiKey: string
): Promise<BatchResult> {
  const questionsForReview = batch.map((q: any) => ({
    index: q.index,
    text_ar: q.text_ar,
    options: q.options,
    correct_option_id: q.correct_option_id,
    explanation: q.explanation,
    difficulty: q.difficulty,
    topic: q.topic,
  }));

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildBatchUserPrompt(questionsForReview, difficulty, existingTexts);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[review-batch] Retry ${attempt}/${MAX_RETRIES} for batch ${batchIndex + 1}/${totalBatches}`);
        await sleep(RETRY_DELAY_MS * attempt);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout per batch

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: REVIEWER_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (aiResponse.status === 429) {
        const errText = await aiResponse.text();
        if (attempt < MAX_RETRIES) {
          console.warn(`[review-batch] Rate limited on batch ${batchIndex + 1}, retrying...`);
          continue;
        }
        return {
          batch_index: batchIndex,
          total_batches: totalBatches,
          reviews: [],
          ok: false,
          error: `Rate limited after ${MAX_RETRIES} retries`,
        };
      }

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        if (attempt < MAX_RETRIES) continue;
        return {
          batch_index: batchIndex,
          total_batches: totalBatches,
          reviews: [],
          ok: false,
          error: `AI error ${aiResponse.status}: ${errText.substring(0, 300)}`,
        };
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

      let parsed: any;
      try {
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(objMatch?.[0] || cleaned);
      } catch {
        if (attempt < MAX_RETRIES) continue;
        return {
          batch_index: batchIndex,
          total_batches: totalBatches,
          reviews: [],
          ok: false,
          error: "Failed to parse AI output: " + cleaned.substring(0, 200),
        };
      }

      const reviews: ReviewItem[] = parsed.reviews || [];
      return {
        batch_index: batchIndex,
        total_batches: totalBatches,
        reviews,
        ok: true,
      };
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.warn(`[review-batch] Timeout on batch ${batchIndex + 1}`);
        if (attempt < MAX_RETRIES) continue;
        return {
          batch_index: batchIndex,
          total_batches: totalBatches,
          reviews: [],
          ok: false,
          error: "Timeout after retries",
        };
      }
      if (attempt < MAX_RETRIES) continue;
      return {
        batch_index: batchIndex,
        total_batches: totalBatches,
        reviews: [],
        ok: false,
        error: e.message || "Unknown error",
      };
    }
  }

  return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: "Exhausted retries" };
}

// ─── Main Handler ────────────────────────────────────────────────────
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

    // Fetch existing approved questions for duplicate check
    const { data: existingQuestions } = await adminSupabase
      .from("questions")
      .select("text_ar")
      .eq("country_id", draft.country_id)
      .eq("status", "approved")
      .eq("is_approved", true)
      .limit(200);

    const existingTexts = (existingQuestions || []).map((q: any) => q.text_ar).join("\n---\n");

    // ─── Split into batches ──────────────────────────────────────────
    const batches = chunkArray(questions, BATCH_SIZE);
    const totalBatches = batches.length;

    console.log(`[review-questions-draft] Starting batched review: ${questions.length} questions → ${totalBatches} batches of ≤${BATCH_SIZE}`);

    // Update draft status to show review in progress
    await adminSupabase
      .from("question_drafts")
      .update({
        status: "pending_review",
        notes: `مراجعة جارية: 0/${totalBatches} دفعات`,
      })
      .eq("id", draft_id);

    // ─── Process batches sequentially ────────────────────────────────
    const allReviews: ReviewItem[] = [];
    const batchResults: BatchResult[] = [];
    const failedBatches: number[] = [];

    for (let bi = 0; bi < totalBatches; bi++) {
      console.log(`[review-questions-draft] Processing batch ${bi + 1}/${totalBatches} (${batches[bi].length} questions)`);

      const result = await reviewBatch(
        batches[bi],
        bi,
        totalBatches,
        draft.difficulty,
        existingTexts,
        LOVABLE_API_KEY
      );

      batchResults.push(result);

      if (result.ok) {
        allReviews.push(...result.reviews);
      } else {
        failedBatches.push(bi);
        console.error(`[review-questions-draft] Batch ${bi + 1} failed: ${result.error}`);
      }

      // ─── Partial save: update progress after each batch ──────────
      const progressNote = `مراجعة جارية: ${bi + 1}/${totalBatches} دفعات${failedBatches.length > 0 ? ` (${failedBatches.length} فشلت)` : ''}`;
      await adminSupabase
        .from("question_drafts")
        .update({ notes: progressNote })
        .eq("id", draft_id);

      // Rate limit guard: small delay between batches
      if (bi < totalBatches - 1) {
        await sleep(1500);
      }
    }

    // ─── Merge results ───────────────────────────────────────────────

    // Build merged report
    const totalIssues = allReviews.filter(r => !r.ok).length;
    const avgScore = allReviews.length > 0
      ? Math.round((allReviews.reduce((sum, r) => sum + (r.score || 0), 0) / allReviews.length) * 10) / 10
      : 0;

    const mergedReport = {
      overall_ok: totalIssues === 0 && failedBatches.length === 0,
      summary: failedBatches.length > 0
        ? `تمت مراجعة ${allReviews.length}/${questions.length} سؤال. فشلت ${failedBatches.length} دفعات. متوسط التقييم: ${avgScore}/10`
        : totalIssues > 0
          ? `${totalIssues} مشكلة في ${allReviews.length} سؤال. متوسط التقييم: ${avgScore}/10`
          : `جميع الأسئلة سليمة (${allReviews.length} سؤال). متوسط التقييم: ${avgScore}/10`,
      issues_count: totalIssues,
      reviews: allReviews,
      batch_stats: {
        total_batches: totalBatches,
        completed_batches: totalBatches - failedBatches.length,
        failed_batches: failedBatches,
        batch_size: BATCH_SIZE,
      },
    };

    // Build corrected questions array
    const correctedQuestions = questions.map((originalQ: any, i: number) => {
      const review = allReviews.find((r: any) => r.index === i);
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

    // Determine final status
    const hasIssues = totalIssues > 0 || failedBatches.length > 0;
    const newStatus = hasIssues ? "needs_fix" : "pending_review";

    // Final save
    const { error: updateError } = await adminSupabase
      .from("question_drafts")
      .update({
        reviewer_report_json: mergedReport,
        reviewer_model: REVIEWER_MODEL,
        corrected_questions_json: correctedQuestions,
        status: newStatus,
        notes: failedBatches.length > 0
          ? `اكتملت المراجعة مع ${failedBatches.length} دفعات فاشلة`
          : `اكتملت المراجعة بنجاح — ${totalBatches} دفعات`,
      })
      .eq("id", draft_id);

    if (updateError) {
      console.error("[review-questions-draft] Update error:", updateError);
      return jsonResponse({ error: "Failed to save review", details: updateError.message }, 500);
    }

    console.log(`[review-questions-draft] ✅ Review complete. ${allReviews.length}/${questions.length} reviewed. Status: ${newStatus}. Failed batches: ${failedBatches.length}`);

    return jsonResponse({
      ok: true,
      draft_id,
      status: newStatus,
      report: mergedReport,
      corrected_count: correctedQuestions.length,
    });
  } catch (e) {
    console.error("[review-questions-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
