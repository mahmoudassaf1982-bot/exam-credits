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

const AUTO_PUBLISH_THRESHOLD = 0.85;
const NEEDS_REVIEW_THRESHOLD = 0.70;

// ─── Types ───────────────────────────────────────────────────────────
interface QualityScores {
  confidence_score: number;
  clarity_score: number;
  difficulty_match: number;
  single_answer_confidence: number;
  language_quality: number;
  language_consistency_score: number;
  blueprint_compliance_score: number;
}

interface ReviewItem {
  index: number;
  ok: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  duplicate_risk: boolean;
  quality_scores: QualityScores;
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

// ─── Language Detection Helpers ──────────────────────────────────────
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_REGEX = /[a-zA-Z]/;

function detectContentLanguage(questions: any[]): "en" | "ar" {
  // Check first question's content_language field if set
  if (questions[0]?.content_language) return questions[0].content_language;
  // Heuristic: sample text from first 3 questions
  const sampleText = questions.slice(0, 3).map(q => q.text_ar || "").join(" ");
  const arabicChars = (sampleText.match(new RegExp(ARABIC_REGEX.source, "g")) || []).length;
  const latinChars = (sampleText.match(new RegExp(LATIN_REGEX.source, "g")) || []).length;
  return latinChars > arabicChars ? "en" : "ar";
}

function checkLanguageConsistency(text: string, expectedLang: "en" | "ar"): number {
  if (!text || text.trim().length === 0) return 1.0;
  const arabicChars = (text.match(new RegExp(ARABIC_REGEX.source, "g")) || []).length;
  const latinChars = (text.match(new RegExp(LATIN_REGEX.source, "g")) || []).length;
  const total = arabicChars + latinChars;
  if (total === 0) return 1.0;

  if (expectedLang === "en") {
    // English content: Arabic chars = contamination
    return Math.max(0, 1 - (arabicChars / total) * 2);
  } else {
    // Arabic content: Latin chars are OK for formulas/numbers, but heavy Latin = bad
    const latinRatio = latinChars / total;
    return latinRatio > 0.4 ? Math.max(0, 1 - latinRatio) : 1.0;
  }
}

function computeQuestionLanguageScore(q: any, expectedLang: "en" | "ar"): number {
  const texts = [
    q.text_ar || "",
    ...(q.options || []).map((o: any) => o.textAr || ""),
    q.explanation || "",
  ];
  const scores = texts.filter(t => t.length > 0).map(t => checkLanguageConsistency(t, expectedLang));
  if (scores.length === 0) return 1.0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─── Prompts ─────────────────────────────────────────────────────────
function buildSystemPrompt(contentLang: "en" | "ar"): string {
  const langRule = contentLang === "en"
    ? `
🚨 LANGUAGE CONSISTENCY CHECK — ENGLISH ONLY 🚨
The questions being reviewed are ENGLISH-language questions.
- ALL question text, options, and explanations MUST be in English
- If ANY Arabic text is found in an English question → set language_consistency_score to 0.0 and ok=false
- Corrected versions MUST also be in ENGLISH ONLY
- Auto-FAIL any question with Arabic content mixed into English questions`
    : `
🚨 LANGUAGE CONSISTENCY CHECK — ARABIC ONLY 🚨
The questions being reviewed are ARABIC-language questions.
- ALL question text, options, and explanations MUST be in Arabic
- English is only acceptable for: proper nouns, mathematical formulas, technical terms with no Arabic equivalent
- If heavy English mixing is detected → lower language_consistency_score significantly
- Corrected versions MUST also be in ARABIC`;

  return `You are a Senior Exam Quality Reviewer, Auto-Corrector, AND Quality Gate Evaluator for SARIS Exams.
${langRule}

For EACH question, you must:
1. REVIEW: Check for issues (ambiguity, wrong answer, grammar, difficulty mismatch, hint in stem, weak distractors, duplicates, LANGUAGE CONSISTENCY, BLUEPRINT COMPLIANCE)
2. AUTO-FIX: Return a CORRECTED version with ALL issues resolved (in the CORRECT language)
3. QUALITY GATE: Return structured quality scores (0.0 to 1.0 each)

Quality Scores to evaluate:
- confidence_score: Overall confidence that the question is correct, well-formed, and exam-ready (0.0-1.0)
- clarity_score: How clear and unambiguous the question stem and options are (0.0-1.0)
- difficulty_match: How well the actual difficulty matches the requested difficulty level (0.0-1.0)
- single_answer_confidence: How confident that exactly ONE option is definitively correct (0.0-1.0)
- language_quality: Grammar, formal academic tone, spelling correctness (0.0-1.0)
- language_consistency_score: Whether the question is entirely in the expected language (0.0-1.0). 0.0 = wrong language or heavy mixing. 1.0 = pure correct language.
- blueprint_compliance_score: Whether the question belongs to the correct exam type and section (0.0-1.0). 0.0 = wrong question family (e.g., verbal analogy in a math exam). 1.0 = perfectly matches the exam blueprint.

🚨 BLUEPRINT COMPLIANCE CHECK 🚨
- If generating for a MATH exam: questions MUST be mathematical. Verbal analogies, vocabulary, grammar, reading comprehension = score 0.0
- If generating for an ENGLISH exam: questions MUST be English language. Pure math calculations = score 0.0  
- If generating for an ARABIC exam: questions MUST be Arabic language. Pure math calculations = score 0.0
- If a question belongs to a DIFFERENT exam family than requested → set blueprint_compliance_score to 0.0, ok=false, and add issue "Blueprint violation: [family] question in [exam_type] exam"

Return a JSON object with:
{
  "reviews": [
    {
      "index": number,
      "ok": boolean,
      "score": number (0-10),
      "issues": string[],
      "suggestions": string[],
      "duplicate_risk": boolean,
      "quality_scores": {
        "confidence_score": number (0.0-1.0),
        "clarity_score": number (0.0-1.0),
        "difficulty_match": number (0.0-1.0),
        "single_answer_confidence": number (0.0-1.0),
        "language_quality": number (0.0-1.0),
        "language_consistency_score": number (0.0-1.0),
        "blueprint_compliance_score": number (0.0-1.0)
      },
      "corrected": {
        "text_ar": string,
        "options": [{"id": "a", "textAr": string}, {"id": "b", "textAr": string}, {"id": "c", "textAr": string}, {"id": "d", "textAr": string}],
        "correct_option_id": string (a/b/c/d),
        "explanation": string,
        "difficulty": string (easy/medium/hard),
        "topic": string
      }
    }
  ]
}

IMPORTANT:
- "corrected" and "quality_scores" must ALWAYS be present for every question.
- Be strict but fair. Score honestly. A perfect question should get 0.95+, not 1.0.
- confidence_score is the MOST important metric — it gates auto-publishing.
- blueprint_compliance_score: If a question is the WRONG TYPE for this exam → score = 0.0 and auto-FAIL
- language_consistency_score: If a question meant to be English contains Arabic instructions → score = 0.0 and add issue "Language mismatch: Arabic found in English question"
Return JSON ONLY.`;
}

function buildBatchUserPrompt(
  batch: any[],
  difficulty: string,
  existingTexts: string,
  contentLang: "en" | "ar"
): string {
  const langLabel = contentLang === "en" ? "ENGLISH" : "ARABIC";
  return `Review, auto-correct, and score these ${batch.length} questions (requested difficulty: ${difficulty}, expected language: ${langLabel}):

${JSON.stringify(batch, null, 2)}

CRITICAL: These questions MUST be entirely in ${langLabel}. Any language mixing = language_consistency_score near 0.

${existingTexts ? `\nExisting approved questions for duplicate check:\n${existingTexts.substring(0, 4000)}` : ""}

Return JSON ONLY with the "reviews" array including quality_scores (with language_consistency_score) for each.`;
}

function ensureQualityScores(review: any): QualityScores {
  const qs = review.quality_scores || {};
  return {
    confidence_score: typeof qs.confidence_score === 'number' ? qs.confidence_score : (review.score || 5) / 10,
    clarity_score: typeof qs.clarity_score === 'number' ? qs.clarity_score : (review.score || 5) / 10,
    difficulty_match: typeof qs.difficulty_match === 'number' ? qs.difficulty_match : 0.7,
    single_answer_confidence: typeof qs.single_answer_confidence === 'number' ? qs.single_answer_confidence : (review.ok ? 0.9 : 0.5),
    language_quality: typeof qs.language_quality === 'number' ? qs.language_quality : 0.7,
    language_consistency_score: typeof qs.language_consistency_score === 'number' ? qs.language_consistency_score : 0.8,
    blueprint_compliance_score: typeof qs.blueprint_compliance_score === 'number' ? qs.blueprint_compliance_score : 0.9,
  };
}

async function reviewBatch(
  batch: any[],
  batchIndex: number,
  totalBatches: number,
  difficulty: string,
  existingTexts: string,
  apiKey: string,
  contentLang: "en" | "ar"
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

  const systemPrompt = buildSystemPrompt(contentLang);
  const userPrompt = buildBatchUserPrompt(questionsForReview, difficulty, existingTexts, contentLang);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[review-batch] Retry ${attempt}/${MAX_RETRIES} for batch ${batchIndex + 1}/${totalBatches}`);
        await sleep(RETRY_DELAY_MS * attempt);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

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
        if (attempt < MAX_RETRIES) continue;
        return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: `Rate limited after ${MAX_RETRIES} retries` };
      }

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        if (attempt < MAX_RETRIES) continue;
        return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: `AI error ${aiResponse.status}: ${errText.substring(0, 300)}` };
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
        return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: "Failed to parse AI output: " + cleaned.substring(0, 200) };
      }

      const reviews: ReviewItem[] = (parsed.reviews || []).map((r: any) => ({
        ...r,
        quality_scores: ensureQualityScores(r),
      }));

      return { batch_index: batchIndex, total_batches: totalBatches, reviews, ok: true };
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.warn(`[review-batch] Timeout on batch ${batchIndex + 1}`);
        if (attempt < MAX_RETRIES) continue;
        return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: "Timeout after retries" };
      }
      if (attempt < MAX_RETRIES) continue;
      return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: e.message || "Unknown error" };
    }
  }

  return { batch_index: batchIndex, total_batches: totalBatches, reviews: [], ok: false, error: "Exhausted retries" };
}

// ─── Post-Review Language Verification ───────────────────────────────
function applyLanguageVerification(reviews: ReviewItem[], questions: any[], contentLang: "en" | "ar"): ReviewItem[] {
  return reviews.map(r => {
    const q = questions.find((q: any) => q.index === r.index);
    if (!q) return r;

    // Server-side language consistency check (independent of AI scoring)
    const serverLangScore = computeQuestionLanguageScore(
      r.corrected || q,
      contentLang
    );

    // Take the minimum of AI score and server-computed score
    const finalLangScore = Math.min(r.quality_scores.language_consistency_score, serverLangScore);

    if (finalLangScore < 0.5) {
      // Auto-fail questions with severe language mixing
      const langIssue = contentLang === "en"
        ? "Language mismatch: Arabic text found in English question"
        : "Language mismatch: Excessive English text in Arabic question";

      return {
        ...r,
        ok: false,
        quality_scores: {
          ...r.quality_scores,
          language_consistency_score: finalLangScore,
          confidence_score: Math.min(r.quality_scores.confidence_score, 0.3),
        },
        issues: r.issues.includes(langIssue) ? r.issues : [...r.issues, langIssue],
      };
    }

    return {
      ...r,
      quality_scores: {
        ...r.quality_scores,
        language_consistency_score: finalLangScore,
      },
    };
  });
}

// ─── Quality Gate Decision ───────────────────────────────────────────
function computeQualityGateDecision(allReviews: ReviewItem[], failedBatches: number[]) {
  if (allReviews.length === 0 || failedBatches.length > 0) {
    return { decision: "needs_fix" as const, avg_confidence: 0, auto_publishable: 0, needs_review_count: 0, needs_fix_count: allReviews.length, language_failures: 0, blueprint_failures: 0 };
  }

  let autoPublishable = 0;
  let needsReviewCount = 0;
  let needsFixCount = 0;
  let totalConfidence = 0;
  let languageFailures = 0;
  let blueprintFailures = 0;

  for (const r of allReviews) {
    const conf = r.quality_scores?.confidence_score ?? 0;
    const langScore = r.quality_scores?.language_consistency_score ?? 1;
    const blueprintScore = r.quality_scores?.blueprint_compliance_score ?? 1;
    totalConfidence += conf;

    // Blueprint failure overrides everything
    if (blueprintScore < 0.5) {
      needsFixCount++;
      blueprintFailures++;
    // Language failure overrides confidence
    } else if (langScore < 0.5) {
      needsFixCount++;
      languageFailures++;
    } else if (conf >= AUTO_PUBLISH_THRESHOLD) {
      autoPublishable++;
    } else if (conf >= NEEDS_REVIEW_THRESHOLD) {
      needsReviewCount++;
    } else {
      needsFixCount++;
    }
  }

  const avgConfidence = Math.round((totalConfidence / allReviews.length) * 100) / 100;

  let decision: "approved" | "pending_review" | "needs_fix";
  if (needsFixCount > 0) {
    decision = "needs_fix";
  } else if (needsReviewCount > 0) {
    decision = "pending_review";
  } else {
    decision = avgConfidence >= AUTO_PUBLISH_THRESHOLD ? "approved" : "pending_review";
  }

  return { decision, avg_confidence: avgConfidence, auto_publishable: autoPublishable, needs_review_count: needsReviewCount, needs_fix_count: needsFixCount, language_failures: languageFailures };
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

    // Detect content language from draft questions
    const contentLang = detectContentLanguage(questions);
    console.log(`[review-questions-draft] Detected content language: ${contentLang}`);

    const { data: existingQuestions } = await adminSupabase
      .from("questions")
      .select("text_ar")
      .eq("country_id", draft.country_id)
      .eq("status", "approved")
      .eq("is_approved", true)
      .limit(200);

    const existingTexts = (existingQuestions || []).map((q: any) => q.text_ar).join("\n---\n");

    const batches = chunkArray(questions, BATCH_SIZE);
    const totalBatches = batches.length;

    console.log(`[review-questions-draft] Starting batched review: ${questions.length} questions → ${totalBatches} batches, lang=${contentLang}`);

    await adminSupabase
      .from("question_drafts")
      .update({ status: "pending_review", notes: `مراجعة جارية: 0/${totalBatches} دفعات` })
      .eq("id", draft_id);

    const allReviews: ReviewItem[] = [];
    const batchResults: BatchResult[] = [];
    const failedBatches: number[] = [];

    for (let bi = 0; bi < totalBatches; bi++) {
      console.log(`[review-questions-draft] Processing batch ${bi + 1}/${totalBatches} (${batches[bi].length} questions)`);

      const result = await reviewBatch(batches[bi], bi, totalBatches, draft.difficulty, existingTexts, LOVABLE_API_KEY, contentLang);
      batchResults.push(result);

      if (result.ok) {
        allReviews.push(...result.reviews);
      } else {
        failedBatches.push(bi);
        console.error(`[review-questions-draft] Batch ${bi + 1} failed: ${result.error}`);
      }

      const progressNote = `مراجعة جارية: ${bi + 1}/${totalBatches} دفعات${failedBatches.length > 0 ? ` (${failedBatches.length} فشلت)` : ''}`;
      await adminSupabase.from("question_drafts").update({ notes: progressNote }).eq("id", draft_id);

      if (bi < totalBatches - 1) await sleep(1500);
    }

    // ─── Server-side Language Verification ───────────────────────────
    const verifiedReviews = applyLanguageVerification(allReviews, questions, contentLang);

    // ─── Quality Gate ────────────────────────────────────────────────
    const qualityGate = computeQualityGateDecision(verifiedReviews, failedBatches);

    const totalIssues = verifiedReviews.filter(r => !r.ok).length;
    const avgScore = verifiedReviews.length > 0
      ? Math.round((verifiedReviews.reduce((sum, r) => sum + (r.score || 0), 0) / verifiedReviews.length) * 10) / 10
      : 0;

    const mergedReport = {
      overall_ok: totalIssues === 0 && failedBatches.length === 0,
      summary: `${verifiedReviews.length} سؤال | الثقة: ${qualityGate.avg_confidence} | التقييم: ${avgScore}/10 | ✅${qualityGate.auto_publishable} ⚠️${qualityGate.needs_review_count} ❌${qualityGate.needs_fix_count}${qualityGate.language_failures > 0 ? ` | 🔤${qualityGate.language_failures} لغة` : ''}`,
      issues_count: totalIssues,
      reviews: verifiedReviews,
      content_language: contentLang,
      batch_stats: {
        total_batches: totalBatches,
        completed_batches: totalBatches - failedBatches.length,
        failed_batches: failedBatches,
        batch_size: BATCH_SIZE,
      },
      quality_gate: {
        decision: qualityGate.decision,
        avg_confidence: qualityGate.avg_confidence,
        auto_publishable: qualityGate.auto_publishable,
        needs_review_count: qualityGate.needs_review_count,
        needs_fix_count: qualityGate.needs_fix_count,
        language_failures: qualityGate.language_failures,
        thresholds: { auto_publish: AUTO_PUBLISH_THRESHOLD, needs_review: NEEDS_REVIEW_THRESHOLD },
      },
    };

    const correctedQuestions = questions.map((originalQ: any, i: number) => {
      const review = verifiedReviews.find((r: any) => r.index === i);
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

    const newStatus = qualityGate.decision;

    const langWarning = qualityGate.language_failures > 0 ? ` | ${qualityGate.language_failures} أسئلة فشلت في فحص اللغة` : '';

    const { error: updateError } = await adminSupabase
      .from("question_drafts")
      .update({
        reviewer_report_json: mergedReport,
        reviewer_model: REVIEWER_MODEL,
        corrected_questions_json: correctedQuestions,
        status: newStatus,
        notes: newStatus === "approved"
          ? `✅ اجتاز بوابة الجودة تلقائياً — الثقة: ${qualityGate.avg_confidence}${langWarning}`
          : newStatus === "pending_review"
            ? `⚠️ يحتاج مراجعة بشرية — الثقة: ${qualityGate.avg_confidence}${langWarning}`
            : `❌ يحتاج إصلاح — ${qualityGate.needs_fix_count} أسئلة تحت الحد${langWarning}`,
      })
      .eq("id", draft_id);

    if (updateError) {
      console.error("[review-questions-draft] Update error:", updateError);
      return jsonResponse({ error: "Failed to save review", details: updateError.message }, 500);
    }

    // ─── Auto-Publish if approved ────────────────────────────────────
    let autoPublished = false;
    let publishedCount = 0;
    if (newStatus === "approved") {
      // Check platform setting
      const { data: settingRow } = await adminSupabase
        .from("platform_settings")
        .select("value")
        .eq("key", "auto_publish_enabled")
        .single();

      const autoPublishEnabled = settingRow?.value !== "false"; // default true

      if (autoPublishEnabled) {
        const questionsToPublish = correctedQuestions;
        const dbRows = questionsToPublish.map((q: any) => ({
          country_id: draft.country_id,
          exam_template_id: draft.exam_template_id || null,
          section_id: q.section_id || draft.section_id || null,
          topic: q.topic || "عام",
          difficulty: q.difficulty || draft.difficulty || "medium",
          text_ar: q.text_ar,
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation || null,
          is_approved: true,
          status: "approved",
          source: "ai",
          draft_id: draft_id,
          language: q.content_language || contentLang || "ar",
        }));

        const { data: inserted, error: insertError } = await adminSupabase
          .from("questions")
          .insert(dbRows)
          .select("id");

        if (insertError) {
          console.error("[review-questions-draft] Auto-publish insert error:", insertError);
        } else {
          publishedCount = inserted?.length || 0;
          autoPublished = true;

          // Update draft with approval info
          await adminSupabase.from("question_drafts").update({
            approved_by: userData.user.id,
            approved_at: new Date().toISOString(),
            notes: `✅ نُشر تلقائياً (${publishedCount} سؤال) — الثقة: ${qualityGate.avg_confidence}${langWarning}`,
          }).eq("id", draft_id);

          console.log(`[review-questions-draft] 🚀 Auto-published ${publishedCount} questions from draft ${draft_id}`);
        }
      }
    }

    console.log(`[review-questions-draft] ✅ Review complete. Decision: ${newStatus}. Lang: ${contentLang}. Lang failures: ${qualityGate.language_failures}`);

    return jsonResponse({
      ok: true,
      draft_id,
      status: newStatus,
      report: mergedReport,
      quality_gate: mergedReport.quality_gate,
      auto_published: autoPublished,
      published_count: publishedCount,
    });
  } catch (e) {
    console.error("[review-questions-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
