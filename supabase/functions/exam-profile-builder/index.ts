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

function generateWorkerId(): string {
  return crypto.randomUUID();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithJitter(attempt: number): number {
  const base = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
  const jitter = Math.random() * 1000;
  return base + jitter;
}

function tryParseJSON(raw: string): { ok: boolean; data: any; error?: string } {
  // Strip markdown fences
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // Try direct parse
  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {}
  // Try extracting object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return { ok: true, data: JSON.parse(objMatch[0]) };
    } catch {}
  }
  return { ok: false, data: null, error: "Failed to parse JSON from AI response" };
}

function repairAndValidateDNA(raw: any): { ok: boolean; data: any; error?: string } {
  if (!raw || typeof raw !== "object") return { ok: false, data: null, error: "Not an object" };
  // Ensure required fields with defaults
  const defaults: Record<string, any> = {
    thinking_style: "mixed",
    time_pressure_level: "medium",
    reasoning_depth_level: 3,
    avg_steps_per_question: 2,
    trap_density: "medium",
    wording_complexity: "medium",
    calculation_load: "low",
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (raw[k] === undefined || raw[k] === null) raw[k] = v;
  }
  // Validate difficulty_mix sums to 100
  if (raw.difficulty_mix_default) {
    const sum = (raw.difficulty_mix_default.easy || 0) + (raw.difficulty_mix_default.medium || 0) + (raw.difficulty_mix_default.hard || 0);
    if (sum !== 100) {
      const scale = 100 / (sum || 1);
      raw.difficulty_mix_default.easy = Math.round((raw.difficulty_mix_default.easy || 30) * scale);
      raw.difficulty_mix_default.medium = Math.round((raw.difficulty_mix_default.medium || 50) * scale);
      raw.difficulty_mix_default.hard = 100 - raw.difficulty_mix_default.easy - raw.difficulty_mix_default.medium;
    }
  } else {
    raw.difficulty_mix_default = { easy: 30, medium: 50, hard: 20 };
  }
  // Validate cognitive_mix sums to 100
  if (Array.isArray(raw.cognitive_mix)) {
    const cSum = raw.cognitive_mix.reduce((s: number, c: any) => s + (c.pct || 0), 0);
    if (cSum !== 100 && cSum > 0) {
      const scale = 100 / cSum;
      raw.cognitive_mix = raw.cognitive_mix.map((c: any, i: number, arr: any[]) => {
        if (i === arr.length - 1) {
          const rest = arr.slice(0, -1).reduce((s: number, x: any) => s + Math.round((x.pct || 0) * scale), 0);
          return { ...c, pct: 100 - rest };
        }
        return { ...c, pct: Math.round((c.pct || 0) * scale) };
      });
    }
  }
  if (!raw.quality_gate_thresholds) {
    raw.quality_gate_thresholds = { min_confidence: 0.85, min_clarity: 0.8, min_language_quality: 0.8 };
  }
  if (!raw.expected_time_per_question_seconds) {
    raw.expected_time_per_question_seconds = { easy: 45, medium: 90, hard: 120 };
  }
  if (!raw.distractor_style) {
    raw.distractor_style = { type: "plausible", notes: "" };
  }
  return { ok: true, data: raw };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userSupabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { action, exam_template_id, sample_questions_text, job_id: retryJobId } = body;

    if (!exam_template_id) return jsonResponse({ error: "exam_template_id required" }, 400);

    // Get template info
    const { data: tmpl } = await admin
      .from("exam_templates")
      .select("id, name_ar, country_id, default_question_count, default_time_limit_sec, target_easy_pct, target_medium_pct, target_hard_pct, available_languages")
      .eq("id", exam_template_id)
      .single();

    if (!tmpl) return jsonResponse({ error: "Template not found" }, 404);

    // Get sections
    const { data: sections } = await admin
      .from("exam_sections")
      .select("id, name_ar, question_count, difficulty_mix_json, topic_filter_json")
      .eq("exam_template_id", exam_template_id)
      .order("order");

    // Get existing profile
    const { data: existingProfile } = await admin
      .from("exam_profiles")
      .select("*")
      .eq("exam_template_id", exam_template_id)
      .single();

    let profile = existingProfile?.profile_json || {
      exam_identity: { exam_template_id: tmpl.id, exam_name: tmpl.name_ar, country_id: tmpl.country_id, schema_version: "dna_v1" },
      official_spec: {},
      psychometric_dna: {},
      generation_rules: { options_count: 4, single_correct_answer: true, stem_max_lines: 2, stem_max_chars: 200, no_answer_in_stem: true, language_match_required: true },
      adaptive_rules: { strategy_required: false, mode: "difficulty_only" },
    };

    // ─── FETCH SPEC (deterministic, no AI) ─────────────────────────────
    if (action === "fetch_spec") {
      const languages = Array.isArray(tmpl.available_languages) ? tmpl.available_languages : ["ar"];
      profile.official_spec = {
        total_questions: tmpl.default_question_count,
        duration_minutes: Math.round(tmpl.default_time_limit_sec / 60),
        languages,
        sections: (sections || []).map((s: any) => ({
          section_id: s.id,
          name_ar: s.name_ar,
          question_count: s.question_count,
          topics: s.topic_filter_json || [],
          difficulty_mix: s.difficulty_mix_json || { easy: tmpl.target_easy_pct, medium: tmpl.target_medium_pct, hard: tmpl.target_hard_pct },
        })),
      };
      profile.psychometric_dna = {
        ...profile.psychometric_dna,
        difficulty_mix_default: { easy: tmpl.target_easy_pct, medium: tmpl.target_medium_pct, hard: tmpl.target_hard_pct },
      };
      profile.exam_identity = { exam_template_id: tmpl.id, exam_name: tmpl.name_ar, country_id: tmpl.country_id, schema_version: "dna_v1" };

      // Upsert profile as draft
      if (existingProfile) {
        await admin.from("exam_profiles").update({ profile_json: profile, status: "draft" }).eq("id", existingProfile.id);
      } else {
        await admin.from("exam_profiles").insert({ exam_template_id, profile_json: profile, status: "draft" });
      }

      return jsonResponse({ ok: true, profile, message: "تم جلب المواصفات وحفظها كمسودة" });
    }

    // ─── INFER DNA (AI-powered, with atomic locking + retries) ──────────
    if (action === "infer_dna") {
      if (!apiKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

      const workerId = generateWorkerId();
      let jobId = retryJobId;

      // Create or reuse ai_jobs entry
      if (!jobId) {
        const { data: newJob, error: jobErr } = await admin.from("ai_jobs").insert({
          type: "profile_builder",
          operation: "infer_dna",
          status: "queued",
          priority: 3,
          created_by: userId,
          idempotency_key: `profile_infer_dna_${exam_template_id}_${Date.now()}`,
          params_json: { exam_template_id, sample_questions_text: sample_questions_text || null },
          progress_total: 1,
          next_run_at: new Date().toISOString(),
        }).select("id").single();
        if (jobErr || !newJob) return jsonResponse({ error: "Failed to create job", details: jobErr?.message }, 500);
        jobId = newJob.id;
      }

      // Atomic lock
      const { data: locked } = await admin.rpc("lock_profile_job", { p_job_id: jobId, p_worker_id: workerId });
      if (!locked) {
        return jsonResponse({ ok: false, job_id: jobId, message: "Job is already locked by another worker or not ready for retry" }, 409);
      }

      // Build AI prompt context
      let contextInfo = `Exam: ${tmpl.name_ar}\nCountry: ${tmpl.country_id}\nTotal Questions: ${tmpl.default_question_count}\nDuration: ${Math.round(tmpl.default_time_limit_sec / 60)} minutes\n`;
      contextInfo += `Sections:\n${(sections || []).map((s: any) => `  - ${s.name_ar} (${s.question_count} questions)`).join("\n")}\n`;

      if (sample_questions_text) {
        contextInfo += `\nSample official questions:\n${sample_questions_text}\n`;
      }

      const { data: sampleQs } = await admin
        .from("questions")
        .select("text_ar, difficulty, topic")
        .eq("exam_template_id", String(exam_template_id))
        .eq("status", "approved")
        .is("deleted_at", null)
        .limit(20);

      if (sampleQs && sampleQs.length > 0) {
        contextInfo += `\nExisting approved questions sample:\n${sampleQs.map((q: any) => `[${q.difficulty}] ${q.text_ar}`).join("\n")}\n`;
      }

      const systemPrompt = `You are a psychometric exam analysis expert. Analyze the exam information and return a JSON object with the psychometric DNA profile. Return ONLY valid JSON, no markdown.

Return this exact structure:
{
  "thinking_style": "direct" | "reasoning" | "mixed",
  "time_pressure_level": "low" | "medium" | "high",
  "reasoning_depth_level": 1-5,
  "avg_steps_per_question": 1-4,
  "trap_density": "low" | "medium" | "high",
  "distractor_style": { "type": "plausible" | "common_mistakes" | "partial_answers", "notes": "string" },
  "wording_complexity": "low" | "medium" | "high",
  "calculation_load": "low" | "medium" | "high",
  "difficulty_mix_default": { "easy": number, "medium": number, "hard": number },
  "expected_time_per_question_seconds": { "easy": number, "medium": number, "hard": number },
  "cognitive_mix": [{ "type": "recall" | "comprehension" | "application" | "analysis", "pct": number }],
  "quality_gate_thresholds": { "min_confidence": 0.85, "min_clarity": 0.8, "min_language_quality": 0.8 }
}

difficulty_mix_default percentages must sum to 100. cognitive_mix percentages must sum to 100.`;

      // ─── RETRY LOOP (max 3 attempts with exponential backoff + jitter) ───
      const MAX_ATTEMPTS = 3;
      let lastError = "";
      let dna: any = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          const delay = backoffWithJitter(attempt);
          console.log(`[exam-profile-builder] Attempt ${attempt + 1}/${MAX_ATTEMPTS}, waiting ${Math.round(delay)}ms`);
          await sleep(delay);
        }

        // Update attempt count
        await admin.from("ai_jobs").update({
          attempt_count: attempt + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);

        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: contextInfo },
              ],
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            lastError = `AI API error (${response.status}): ${errText.substring(0, 200)}`;
            console.error(`[exam-profile-builder] Attempt ${attempt + 1} failed: ${lastError}`);
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData?.choices?.[0]?.message?.content || "";

          // Strict JSON parse
          const parseResult = tryParseJSON(rawContent);
          if (!parseResult.ok) {
            lastError = `JSON parse failed: ${parseResult.error}`;
            console.error(`[exam-profile-builder] Attempt ${attempt + 1} JSON parse failed`);
            continue;
          }

          // Validate and repair
          const repairResult = repairAndValidateDNA(parseResult.data);
          if (!repairResult.ok) {
            lastError = `DNA validation failed: ${repairResult.error}`;
            console.error(`[exam-profile-builder] Attempt ${attempt + 1} validation failed`);
            continue;
          }

          dna = repairResult.data;
          break; // Success
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Unknown fetch error";
          console.error(`[exam-profile-builder] Attempt ${attempt + 1} exception: ${lastError}`);
        }
      }

      // ─── RESULT HANDLING ─────────────────────────────────────────────
      if (dna) {
        // SUCCESS: Update profile first, then job
        profile.psychometric_dna = { ...profile.psychometric_dna, ...dna };

        // 1. Persist to exam_profiles FIRST
        if (existingProfile) {
          const { error: profileErr } = await admin.from("exam_profiles").update({ profile_json: profile, status: "draft" }).eq("id", existingProfile.id);
          if (profileErr) {
            // Profile update failed — mark job as needs_review
            await admin.from("ai_jobs").update({
              status: "failed",
              last_error: `Profile persistence failed: ${profileErr.message}`,
              locked_by: null, locked_at: null,
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", jobId);
            return jsonResponse({ error: "Profile persistence failed", details: profileErr.message }, 500);
          }
        } else {
          const { error: profileErr } = await admin.from("exam_profiles").insert({ exam_template_id, profile_json: profile, status: "draft" });
          if (profileErr) {
            await admin.from("ai_jobs").update({
              status: "failed",
              last_error: `Profile persistence failed: ${profileErr.message}`,
              locked_by: null, locked_at: null,
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", jobId);
            return jsonResponse({ error: "Profile persistence failed", details: profileErr.message }, 500);
          }
        }

        // 2. Mark job as succeeded ONLY after profile is persisted
        await admin.from("ai_jobs").update({
          status: "succeeded",
          locked_by: null, locked_at: null,
          progress_done: 1,
          finished_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);

        return jsonResponse({ ok: true, job_id: jobId, profile, dna, message: "تم استنتاج DNA وحفظه كمسودة" });
      } else {
        // FAILURE: All retries exhausted
        await admin.from("ai_jobs").update({
          status: "needs_review",
          locked_by: null, locked_at: null,
          last_error: lastError,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);

        return jsonResponse({ ok: false, job_id: jobId, error: lastError, message: "فشل استنتاج DNA بعد 3 محاولات — يحتاج مراجعة يدوية" }, 500);
      }
    }

    return jsonResponse({ error: "Invalid action. Use fetch_spec or infer_dna" }, 400);
  } catch (e) {
    console.error("[exam-profile-builder] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
