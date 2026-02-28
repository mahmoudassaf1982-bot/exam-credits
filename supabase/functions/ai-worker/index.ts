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
const MAX_JOBS_PER_RUN = 5;
const MAX_JOB_ATTEMPTS = 3;
const MAX_ITEM_RETRIES = 2;
const BATCH_DELAY_MS = 1500;
const LOCK_TIMEOUT_MINUTES = 5;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MINUTES = 1;
const AI_TIMEOUT_MS = 120_000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(status: number): boolean {
  return status === 429 || status === 503 || status === 504 || status === 0;
}

function exponentialBackoff(attempt: number): number {
  const base = Math.pow(2, attempt) * 1000;
  const jitter = Math.random() * 1000;
  return base + jitter;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────
async function checkCircuitBreaker(admin: any): Promise<boolean> {
  // Use raw SQL for FOR UPDATE lock
  const { data, error } = await admin.rpc("check_circuit_breaker_safe", {});
  // Fallback: if RPC doesn't exist, check via normal query
  if (error) {
    const { data: state } = await admin
      .from("ai_system_state")
      .select("*")
      .eq("id", 1)
      .single();
    if (!state) return false; // allow
    if (state.gemini_circuit_open_until && new Date(state.gemini_circuit_open_until) > new Date()) {
      console.log("[ai-worker] Circuit breaker OPEN until", state.gemini_circuit_open_until);
      return true; // circuit open, don't call API
    }
    return false;
  }
  return data === true;
}

async function recordApiSuccess(admin: any) {
  await admin
    .from("ai_system_state")
    .update({
      gemini_failures_window: 0,
      gemini_circuit_open_until: null,
    })
    .eq("id", 1);
}

async function recordApiFailure(admin: any, statusCode: number) {
  if (!isRetryableError(statusCode)) return;

  const { data: state } = await admin
    .from("ai_system_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (!state) return;

  const newFailures = (state.gemini_failures_window || 0) + 1;
  const update: any = {
    gemini_failures_window: newFailures,
    gemini_last_failure_at: new Date().toISOString(),
  };

  if (newFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    const openUntil = new Date(Date.now() + CIRCUIT_BREAKER_COOLDOWN_MINUTES * 60 * 1000);
    update.gemini_circuit_open_until = openUntil.toISOString();
    console.log(`[ai-worker] Circuit breaker OPENED until ${openUntil.toISOString()} after ${newFailures} failures`);
  }

  await admin.from("ai_system_state").update(update).eq("id", 1);
}

// ─── Atomic Job Claim (via Postgres RPC — FOR UPDATE SKIP LOCKED) ───
async function claimJob(admin: any, workerId: string): Promise<any | null> {
  const { data, error } = await admin.rpc("claim_next_job", { worker_id: workerId });

  if (error) {
    console.log("[ai-worker] claim_next_job RPC error:", error.message);
    return null;
  }

  // RPC returns an array (RETURNS SETOF); take first row or null
  const claimed = Array.isArray(data) ? data[0] ?? null : data;

  if (!claimed) {
    console.log("[ai-worker] No claimable jobs found");
    return null;
  }

  console.log(`[ai-worker] ✅ Claimed job ${claimed.id} type=${claimed.type} attempt=${claimed.attempt_count}`);
  return claimed;
}

// ─── Release Job (Terminal State) ────────────────────────────────────
async function releaseJob(admin: any, jobId: string, status: "succeeded" | "failed" | "canceled", error?: string) {
  const update: any = {
    locked_by: null,
    locked_at: null,
    status,
    finished_at: new Date().toISOString(),
  };
  if (error) update.last_error = error;

  await admin.from("ai_jobs").update(update).eq("id", jobId);
  console.log(`[ai-worker] Job ${jobId} → ${status}${error ? ` (${error.substring(0, 100)})` : ""}`);
}

// ─── Move to DLQ ────────────────────────────────────────────────────
async function moveToDLQ(admin: any, job: any) {
  // Insert into DLQ
  await admin.from("ai_dead_letter_jobs").insert({
    job_id: job.id,
    type: job.type,
    params_json: job.params_json,
    last_error: job.last_error || "Max retries exceeded",
    attempts: job.attempt_count,
    failed_at: new Date().toISOString(),
  });

  // Mark job as failed
  await releaseJob(admin, job.id, "failed", "Moved to DLQ after max retries");
  console.log(`[ai-worker] ☠️ Job ${job.id} moved to DLQ`);
}

// ─── AI Call Helper ──────────────────────────────────────────────────
async function callGemini(
  admin: any,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
  // Check circuit breaker
  const circuitOpen = await checkCircuitBreaker(admin);
  if (circuitOpen) {
    return { ok: false, error: "Circuit breaker open", status: 503 };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      await recordApiFailure(admin, response.status);
      return { ok: false, error: errText.substring(0, 500), status: response.status };
    }

    const data = await response.json();
    await recordApiSuccess(admin);
    return { ok: true, data };
  } catch (e: any) {
    if (e.name === "AbortError") {
      await recordApiFailure(admin, 0);
      return { ok: false, error: "Timeout", status: 0 };
    }
    return { ok: false, error: e.message || "Unknown error", status: 0 };
  }
}

// ─── Job Processors ──────────────────────────────────────────────────

async function processGenerateDraftJob(admin: any, job: any, apiKey: string) {
  const params = job.params_json;

  // ── Crash Recovery: reset stale "running" items back to "pending" ──
  await admin
    .from("ai_job_items")
    .update({ status: "pending", started_at: null })
    .eq("job_id", job.id)
    .eq("status", "running");

  const { data: items } = await admin
    .from("ai_job_items")
    .select("*")
    .eq("job_id", job.id)
    .in("status", ["pending", "failed"])
    .order("item_index", { ascending: true });

  if (!items || items.length === 0) {
    // Check if there are succeeded items — if so, finalize
    await finalizeGenerateJob(admin, job);
    return;
  }

  // Import prompts from generate-questions-draft logic
  const countryId = params.country_id;
  const examTemplateId = params.exam_template_id;
  const difficulty = params.difficulty || "medium";

  const { data: countryData } = await admin.from("countries").select("name_ar").eq("id", countryId).single();
  const countryName = countryData?.name_ar || countryId;

  let examName = "اختبار عام";
  if (examTemplateId) {
    const { data: et } = await admin.from("exam_templates").select("name_ar").eq("id", examTemplateId).single();
    if (et) examName = et.name_ar;
  }

  const contentLang = params.content_language || "ar";
  const model = "google/gemini-2.5-flash";

  // ── E2E Test: skip AI calls, mark items as succeeded immediately ──
  if (params.e2e_test) {
    for (const item of items) {
      await admin.from("ai_job_items").update({
        status: "succeeded",
        output_json: { questions: [{ text_ar: "سؤال اختباري", options: [{id:"a",textAr:"أ"},{id:"b",textAr:"ب"},{id:"c",textAr:"ج"},{id:"d",textAr:"د"}], correct_option_id: "a", explanation: "اختبار", difficulty: "medium", topic: "e2e_test" }] },
        finished_at: new Date().toISOString(),
        attempt_count: item.attempt_count + 1,
      }).eq("id", item.id);
    }
    await admin.from("ai_jobs").update({ progress_done: items.length, progress_failed: 0 }).eq("id", job.id);
    await finalizeGenerateJob(admin, job);
    return;
  }

  let totalDone = job.progress_done;
  let totalFailed = job.progress_failed;
  let allGeneratedQuestions: any[] = [];

  for (const item of items) {
    if (item.attempt_count >= MAX_ITEM_RETRIES && item.status === "failed") {
      continue; // skip permanently failed items
    }

    // Mark item as running
    await admin.from("ai_job_items").update({ status: "running", started_at: new Date().toISOString(), attempt_count: item.attempt_count + 1 }).eq("id", item.id);

    const batchCount = item.input_json.count || 10;

    // Build prompt (simplified version)
    const systemPrompt = contentLang === "en"
      ? `You are an Elite Exam Question Generator. Generate ALL content in ENGLISH ONLY. Return JSON array ONLY. Each item: { "question_text": string, "options": {"A":string,"B":string,"C":string,"D":string}, "correct_answer": "A"|"B"|"C"|"D", "explanation": string, "metadata": {"section":string,"difficulty":"${difficulty}","topic":string} }`
      : `You are an Elite Exam Question Generator. Generate ALL content in ARABIC ONLY. Return JSON array ONLY. Each item: { "question_text": string, "options": {"A":string,"B":string,"C":string,"D":string}, "correct_answer": "A"|"B"|"C"|"D", "explanation": string, "metadata": {"section":string,"difficulty":"${difficulty}","topic":string} }`;

    const userPrompt = `Generate exactly ${batchCount} questions at difficulty "${difficulty}" for "${examName}" (${countryName}). Return JSON array ONLY.`;

    const result = await callGemini(admin, apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    if (!result.ok) {
      if (isRetryableError(result.status || 0) && item.attempt_count < MAX_ITEM_RETRIES) {
        await admin.from("ai_job_items").update({ status: "pending", error: result.error }).eq("id", item.id);
      } else {
        await admin.from("ai_job_items").update({ status: "failed", error: result.error, finished_at: new Date().toISOString() }).eq("id", item.id);
        totalFailed++;
      }
      await admin.from("ai_jobs").update({ progress_failed: totalFailed, last_error: result.error }).eq("id", job.id);
      continue;
    }

    // Parse AI response
    try {
      const rawContent = result.data?.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!arrayMatch) throw new Error("No JSON array found");

      const questions = JSON.parse(arrayMatch[0]);
      const optionIds = ["a", "b", "c", "d"];
      const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

      const draftQuestions = questions.map((q: any, i: number) => {
        const opts = q.options;
        const optionsArr = opts && typeof opts === "object" && !Array.isArray(opts)
          ? [opts.A, opts.B, opts.C, opts.D]
          : Array.isArray(opts) ? opts : [];
        const correctIdx = letterToIndex[q.correct_answer?.toUpperCase()] ?? 0;
        return {
          index: allGeneratedQuestions.length + i,
          text_ar: q.question_text || "",
          options: optionsArr.map((text: string, idx: number) => ({ id: optionIds[idx], textAr: text || "" })),
          correct_option_id: optionIds[correctIdx],
          explanation: q.explanation || "",
          difficulty: q.metadata?.difficulty || difficulty,
          topic: q.metadata?.topic || q.metadata?.section || examName,
          section_id: params.section_id || null,
          content_language: contentLang,
        };
      });

      allGeneratedQuestions = allGeneratedQuestions.concat(draftQuestions);

      await admin.from("ai_job_items").update({
        status: "succeeded",
        output_json: { questions: draftQuestions },
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalDone++;
    } catch (parseError: any) {
      await admin.from("ai_job_items").update({
        status: "failed",
        error: `Parse error: ${parseError.message}`,
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalFailed++;
    }

    await admin.from("ai_jobs").update({ progress_done: totalDone, progress_failed: totalFailed }).eq("id", job.id);

    // Delay between batches
    if (items.indexOf(item) < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Finalize: collect all outputs and create/update draft
  await finalizeGenerateJob(admin, job);
}

// ── Collect all succeeded item outputs and save draft ──
async function finalizeGenerateJob(admin: any, job: any) {
  // Gather questions from ALL succeeded items (including previous runs)
  const { data: succeededItems } = await admin
    .from("ai_job_items")
    .select("output_json")
    .eq("job_id", job.id)
    .eq("status", "succeeded")
    .order("item_index", { ascending: true });

  const allQuestions: any[] = [];
  for (const item of (succeededItems || [])) {
    const qs = item.output_json?.questions;
    if (Array.isArray(qs)) allQuestions.push(...qs);
  }

  // Create or update draft if we have questions and no draft yet
  if (allQuestions.length > 0 && !job.target_draft_id) {
    const p = job.params_json;
    const { data: draft } = await admin
      .from("question_drafts")
      .insert({
        created_by: job.created_by,
        country_id: p.country_id,
        exam_template_id: p.exam_template_id || null,
        section_id: p.section_id || null,
        difficulty: p.difficulty || "medium",
        count: allQuestions.length,
        generator_model: "google/gemini-2.5-flash",
        draft_questions_json: allQuestions,
        status: "pending_review",
      })
      .select("id")
      .single();

    if (draft) {
      await admin.from("ai_jobs").update({ target_draft_id: draft.id }).eq("id", job.id);
      console.log(`[ai-worker] ✅ Draft created: ${draft.id} with ${allQuestions.length} questions`);
    }
  } else if (allQuestions.length > 0 && job.target_draft_id) {
    // Update existing draft with combined questions
    await admin.from("question_drafts").update({
      draft_questions_json: allQuestions,
      count: allQuestions.length,
    }).eq("id", job.target_draft_id);
    console.log(`[ai-worker] ✅ Draft ${job.target_draft_id} updated with ${allQuestions.length} questions`);
  }

  // Determine final status
  const { data: finalItems } = await admin
    .from("ai_job_items")
    .select("status")
    .eq("job_id", job.id);

  const pending = finalItems?.filter((i: any) => i.status === "pending" || i.status === "running").length || 0;
  const failed = finalItems?.filter((i: any) => i.status === "failed").length || 0;

  if (pending > 0) {
    await admin.from("ai_jobs").update({ status: "partial", locked_by: null, locked_at: null }).eq("id", job.id);
  } else if (failed === finalItems?.length) {
    await releaseJob(admin, job.id, "failed", "All items failed");
  } else {
    await releaseJob(admin, job.id, "succeeded");
  }
}

async function processReviewDraftJob(admin: any, job: any, apiKey: string) {
  const draftId = job.target_draft_id;
  if (!draftId) {
    await releaseJob(admin, job.id, "failed", "No target_draft_id");
    return;
  }

  // Delegate to existing review function logic
  const { data: draft } = await admin
    .from("question_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (!draft) {
    await releaseJob(admin, job.id, "failed", "Draft not found");
    return;
  }

  const questions = draft.draft_questions_json as any[];
  if (!questions || questions.length === 0) {
    await releaseJob(admin, job.id, "failed", "Draft has no questions");
    return;
  }

  // ── Crash Recovery: reset stale "running" items back to "pending" ──
  await admin
    .from("ai_job_items")
    .update({ status: "pending", started_at: null })
    .eq("job_id", job.id)
    .eq("status", "running");

  const { data: items } = await admin
    .from("ai_job_items")
    .select("*")
    .eq("job_id", job.id)
    .in("status", ["pending", "failed"])
    .order("item_index", { ascending: true });

  if (!items || items.length === 0) {
    // Finalize with previously succeeded items
    await finalizeReviewJob(admin, job, draftId);
    return;
  }

  const model = "google/gemini-2.5-pro";
  let totalDone = job.progress_done;
  let totalFailed = job.progress_failed;
  const allReviews: any[] = [];

  for (const item of items) {
    if (item.attempt_count >= MAX_ITEM_RETRIES && item.status === "failed") continue;

    await admin.from("ai_job_items").update({ status: "running", started_at: new Date().toISOString(), attempt_count: item.attempt_count + 1 }).eq("id", item.id);

    const batchQuestions = item.input_json.questions || [];
    const systemPrompt = `You are a Senior Exam Quality Reviewer. Review each question and return JSON: { "reviews": [{ "index": number, "ok": boolean, "score": number (0-10), "issues": string[], "suggestions": string[], "duplicate_risk": boolean, "quality_scores": { "confidence_score": number, "clarity_score": number, "difficulty_match": number, "single_answer_confidence": number, "language_quality": number, "language_consistency_score": number }, "corrected": { "text_ar": string, "options": [{"id":"a","textAr":string},{"id":"b","textAr":string},{"id":"c","textAr":string},{"id":"d","textAr":string}], "correct_option_id": string, "explanation": string, "difficulty": string, "topic": string } }] }. Return JSON ONLY.`;

    const userPrompt = `Review these ${batchQuestions.length} questions:\n${JSON.stringify(batchQuestions, null, 2)}\nReturn JSON ONLY.`;

    const result = await callGemini(admin, apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    if (!result.ok) {
      if (isRetryableError(result.status || 0) && item.attempt_count < MAX_ITEM_RETRIES) {
        await admin.from("ai_job_items").update({ status: "pending", error: result.error }).eq("id", item.id);
      } else {
        await admin.from("ai_job_items").update({ status: "failed", error: result.error, finished_at: new Date().toISOString() }).eq("id", item.id);
        totalFailed++;
      }
      await admin.from("ai_jobs").update({ progress_failed: totalFailed, last_error: result.error }).eq("id", job.id);
      continue;
    }

    try {
      const rawContent = result.data?.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(objMatch?.[0] || cleaned);
      const reviews = parsed.reviews || [];

      allReviews.push(...reviews);

      await admin.from("ai_job_items").update({
        status: "succeeded",
        output_json: { reviews },
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalDone++;
    } catch (parseError: any) {
      await admin.from("ai_job_items").update({
        status: "failed",
        error: `Parse error: ${parseError.message}`,
        finished_at: new Date().toISOString(),
      }).eq("id", item.id);
      totalFailed++;
    }

    await admin.from("ai_jobs").update({ progress_done: totalDone, progress_failed: totalFailed }).eq("id", job.id);

    if (items.indexOf(item) < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Finalize review with all outputs (current + previous runs)
  await finalizeReviewJob(admin, job, draftId);
}

// ── Collect all review outputs and save to draft ──
async function finalizeReviewJob(admin: any, job: any, draftId: string) {
  const { data: succeededItems } = await admin
    .from("ai_job_items")
    .select("output_json")
    .eq("job_id", job.id)
    .eq("status", "succeeded")
    .order("item_index", { ascending: true });

  const allReviews: any[] = [];
  for (const item of (succeededItems || [])) {
    const revs = item.output_json?.reviews;
    if (Array.isArray(revs)) allReviews.push(...revs);
  }

  if (allReviews.length > 0) {
    const correctedQuestions = allReviews
      .filter((r: any) => r.corrected)
      .sort((a: any, b: any) => a.index - b.index)
      .map((r: any) => r.corrected);

    const avgConfidence = allReviews.reduce((sum: number, r: any) => sum + (r.quality_scores?.confidence_score || 0), 0) / allReviews.length;

    let decision = "pending_review";
    if (avgConfidence >= 0.85) decision = "approved";
    else if (avgConfidence < 0.70) decision = "needs_fix";

    await admin.from("question_drafts").update({
      corrected_questions_json: correctedQuestions.length > 0 ? correctedQuestions : null,
      reviewer_report_json: {
        overall_ok: allReviews.every((r: any) => r.ok),
        summary: `تمت مراجعة ${allReviews.length} سؤال — ثقة ${Math.round(avgConfidence * 100)}%`,
        issues_count: allReviews.filter((r: any) => !r.ok).length,
        reviews: allReviews,
        quality_gate: { decision, avg_confidence: avgConfidence },
      },
      reviewer_model: "google/gemini-2.5-pro",
      status: decision,
    }).eq("id", draftId);

    // ─── Auto-Publish if approved ────────────────────────────────────
    if (decision === "approved") {
      const { data: settingRow } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "auto_publish_enabled")
        .single();

      const autoPublishEnabled = settingRow?.value !== "false";

      if (autoPublishEnabled) {
        const { data: freshDraft } = await admin.from("question_drafts").select("*").eq("id", draftId).single();
        if (freshDraft) {
          const qToPublish = (correctedQuestions.length > 0 ? correctedQuestions : freshDraft.draft_questions_json) as any[];
          const dbRows = qToPublish.map((q: any) => ({
            country_id: freshDraft.country_id,
            exam_template_id: freshDraft.exam_template_id || null,
            section_id: q.section_id || freshDraft.section_id || null,
            topic: q.topic || "عام",
            difficulty: q.difficulty || freshDraft.difficulty || "medium",
            text_ar: q.text_ar,
            options: q.options,
            correct_option_id: q.correct_option_id,
            explanation: q.explanation || null,
            is_approved: true,
            status: "approved",
            source: "ai",
            draft_id: draftId,
            language: q.content_language || "ar",
          }));

          const { data: inserted, error: insertError } = await admin.from("questions").insert(dbRows).select("id");
          if (insertError) {
            console.error("[ai-worker] Auto-publish insert error:", insertError);
          } else {
            await admin.from("question_drafts").update({
              approved_by: job.created_by,
              approved_at: new Date().toISOString(),
              notes: `✅ نُشر تلقائياً (${inserted?.length || 0} سؤال) — ثقة ${Math.round(avgConfidence * 100)}%`,
            }).eq("id", draftId);
            console.log(`[ai-worker] 🚀 Auto-published ${inserted?.length || 0} questions from draft ${draftId}`);
          }
        }
      }
    }
  }

  // Determine final status
  const { data: finalItems } = await admin.from("ai_job_items").select("status").eq("job_id", job.id);
  const pending = finalItems?.filter((i: any) => i.status === "pending" || i.status === "running").length || 0;
  const failed = finalItems?.filter((i: any) => i.status === "failed").length || 0;

  if (pending > 0) {
    await admin.from("ai_jobs").update({ status: "partial", locked_by: null, locked_at: null }).eq("id", job.id);
  } else if (failed === finalItems?.length) {
    await releaseJob(admin, job.id, "failed", "All review items failed");
  } else {
    await releaseJob(admin, job.id, "succeeded");
  }
}

async function processPublishDraftJob(admin: any, job: any) {
  const draftId = job.target_draft_id || job.params_json?.draft_id;
  if (!draftId) {
    await releaseJob(admin, job.id, "failed", "No draft_id");
    return;
  }

  const { data: draft } = await admin.from("question_drafts").select("*").eq("id", draftId).single();
  if (!draft) { await releaseJob(admin, job.id, "failed", "Draft not found"); return; }
  if (draft.status === "approved" && draft.approved_at) { await releaseJob(admin, job.id, "succeeded"); return; }

  const questions = (draft.corrected_questions_json || draft.draft_questions_json) as any[];
  if (!questions || questions.length === 0) { await releaseJob(admin, job.id, "failed", "No questions"); return; }

  const dbRows = questions.map((q: any) => ({
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
    draft_id: draft.id,
    language: q.content_language || "ar",
  }));

  const { data: inserted, error: insertError } = await admin.from("questions").insert(dbRows).select("id");
  if (insertError) {
    await releaseJob(admin, job.id, "failed", insertError.message);
    return;
  }

  await admin.from("question_drafts").update({
    status: "approved",
    approved_by: job.created_by,
    approved_at: new Date().toISOString(),
  }).eq("id", draftId);

  // Update item
  await admin.from("ai_job_items").update({
    status: "succeeded",
    output_json: { published_count: inserted?.length || 0 },
    finished_at: new Date().toISOString(),
  }).eq("job_id", job.id).eq("item_index", 0);

  await admin.from("ai_jobs").update({ progress_done: 1 }).eq("id", job.id);
  await releaseJob(admin, job.id, "succeeded");

  console.log(`[ai-worker] ✅ Published ${inserted?.length || 0} questions from draft ${draftId}`);
}

// ─── Main Worker Loop ────────────────────────────────────────────────
async function runWorker(admin: any, apiKey: string): Promise<{ processed: number; errors: string[] }> {
  const workerId = `worker-${crypto.randomUUID().substring(0, 8)}`;
  let processed = 0;
  const errors: string[] = [];

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await claimJob(admin, workerId);
    if (!job) {
      console.log(`[ai-worker] No more claimable jobs (processed ${processed})`);
      break;
    }

    // Check max attempts
    if (job.attempt_count > MAX_JOB_ATTEMPTS) {
      await moveToDLQ(admin, job);
      processed++;
      continue;
    }

    try {
      switch (job.type) {
        case "generate_draft":
          await processGenerateDraftJob(admin, job, apiKey);
          break;
        case "review_draft":
          await processReviewDraftJob(admin, job, apiKey);
          break;
        case "publish_draft":
          await processPublishDraftJob(admin, job);
          break;
        default:
          await releaseJob(admin, job.id, "failed", `Unknown job type: ${job.type}`);
      }
      processed++;
    } catch (e: any) {
      const errorMsg = e.message || "Unknown error";
      errors.push(`Job ${job.id}: ${errorMsg}`);
      console.error(`[ai-worker] Error processing job ${job.id}:`, e);

      // Set job back to partial for retry
      const backoff = exponentialBackoff(job.attempt_count);
      await admin.from("ai_jobs").update({
        status: "partial",
        locked_by: null,
        locked_at: null,
        last_error: errorMsg,
        next_run_at: new Date(Date.now() + backoff).toISOString(),
      }).eq("id", job.id);

      processed++;
    }
  }

  return { processed, errors };
}

// ─── HTTP Handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);

    // Optional: validate auth for manual triggers
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userSupabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userSupabase.auth.getUser();
      if (userData?.user) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
        if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    console.log("[ai-worker] 🚀 Worker run starting...");
    const result = await runWorker(admin, apiKey);
    console.log(`[ai-worker] ✅ Worker run complete: processed=${result.processed}`);

    return jsonResponse({
      ok: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (e) {
    console.error("[ai-worker] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
