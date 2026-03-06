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

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
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
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { type, draft_id, exam_session_id, params, priority } = body;

    const validTypes = ["generate_draft", "review_draft", "quality_gate", "publish_draft"];
    if (!type || !validTypes.includes(type)) {
      return jsonResponse({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, 400);
    }

    // ─── GENERATION GUARDIAN GATE ─────────────────────────────────
    const examTemplateId = params?.exam_template_id;
    let profileSnapshot: any = null;

    if (examTemplateId && (type === "generate_draft" || type === "generate_questions_draft")) {
      const guardianRes = await fetch(`${supabaseUrl}/functions/v1/generation-guardian`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exam_template_id: examTemplateId,
          section_id: params?.section_id,
          difficulty: params?.difficulty,
          count: params?.count,
        }),
      });

      const guardianData = await guardianRes.json();

      if (!guardianRes.ok || guardianData.guardian_status === "blocked") {
        console.warn("[ai-enqueue] Guardian BLOCKED:", guardianData.reason);
        return jsonResponse({
          error: `Guardian blocked: ${guardianData.reason}`,
          error_ar: "الحارس منع التوليد: التحقق فشل",
          guardian_checks: guardianData.checks,
        }, 400);
      }

      // Fetch profile snapshot (already validated by Guardian)
      const { data: profile } = await admin
        .from("exam_profiles")
        .select("profile_json")
        .eq("exam_template_id", examTemplateId)
        .single();

      profileSnapshot = profile?.profile_json;
    } else if (examTemplateId) {
      // Non-generation jobs: just fetch profile if exists
      const { data: profile } = await admin
        .from("exam_profiles")
        .select("profile_json, status")
        .eq("exam_template_id", examTemplateId)
        .single();

      if (profile?.status === "approved") {
        profileSnapshot = profile.profile_json;
      }
    }

    // Build canonical params for idempotency
    const canonicalParams = JSON.stringify(params || {}, Object.keys(params || {}).sort());
    const idempotencyInput = `${type}|${draft_id || ""}|${userId}|${canonicalParams}|v1`;
    const idempotencyKey = await sha256(idempotencyInput);

    // Determine progress_total based on type and params
    let progressTotal = 1;
    if (type === "generate_draft") {
      progressTotal = params?.count || 10;
    } else if (type === "review_draft" && draft_id) {
      // Fetch draft to get question count
      const { data: draft } = await admin
        .from("question_drafts")
        .select("count")
        .eq("id", draft_id)
        .single();
      progressTotal = draft?.count || 10;
    }

    // UPSERT with idempotency + FREEZE profile snapshot
    const { data: job, error: upsertError } = await admin
      .from("ai_jobs")
      .upsert(
        {
          type,
          status: "queued",
          priority: priority || 5,
          created_by: userId,
          idempotency_key: idempotencyKey,
          target_draft_id: draft_id || null,
          target_exam_session_id: exam_session_id || null,
          params_json: params || {},
          progress_total: progressTotal,
          progress_done: 0,
          progress_failed: 0,
          next_run_at: new Date().toISOString(),
          profile_snapshot_json: profileSnapshot, // IMMUTABLE snapshot
        },
        {
          onConflict: "idempotency_key",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("[ai-enqueue] Upsert error:", upsertError);
      return jsonResponse({ error: "Failed to enqueue job", details: upsertError.message }, 500);
    }

    // Check if items already exist for this job (detect new vs existing)
    const { count: existingItems } = await admin
      .from("ai_job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);

    if (!existingItems || existingItems === 0) {
      // Create job items based on type
      const items: any[] = [];

      if (type === "generate_draft") {
        // For generation: one item per batch of questions
        const count = params?.count || 10;
        const batchSize = 10;
        const totalBatches = Math.ceil(count / batchSize);
        for (let i = 0; i < totalBatches; i++) {
          const batchCount = Math.min(batchSize, count - i * batchSize);
          items.push({
            job_id: job.id,
            item_index: i,
            status: "pending",
            input_json: { batch_index: i, count: batchCount, ...params },
          });
        }
      } else if (type === "review_draft" && draft_id) {
        // For review: one item per batch of questions
        const { data: draft } = await admin
          .from("question_drafts")
          .select("draft_questions_json, count")
          .eq("id", draft_id)
          .single();
        const questions = (draft?.draft_questions_json as any[]) || [];
        const batchSize = 10;
        const totalBatches = Math.ceil(questions.length / batchSize);
        for (let i = 0; i < totalBatches; i++) {
          const batch = questions.slice(i * batchSize, (i + 1) * batchSize);
          items.push({
            job_id: job.id,
            item_index: i,
            status: "pending",
            input_json: { batch_index: i, questions: batch },
          });
        }
      } else if (type === "publish_draft" && draft_id) {
        items.push({
          job_id: job.id,
          item_index: 0,
          status: "pending",
          input_json: { draft_id, ...params },
        });
      } else {
        // Generic single-item job
        items.push({
          job_id: job.id,
          item_index: 0,
          status: "pending",
          input_json: params || {},
        });
      }

      if (items.length > 0) {
        const { error: itemsError } = await admin.from("ai_job_items").insert(items);
        if (itemsError) {
          console.error("[ai-enqueue] Items insert error:", itemsError);
        }
        // Update progress_total to match actual items
        await admin
          .from("ai_jobs")
          .update({ progress_total: items.length })
          .eq("id", job.id);
      }
    }

    console.log(`[ai-enqueue] ✅ Job enqueued: ${job.id} type=${type} status=${job.status}`);

    return jsonResponse({
      ok: true,
      job_id: job.id,
      status: job.status,
      type: job.type,
      is_new: !existingItems || existingItems === 0,
    });
  } catch (e) {
    console.error("[ai-enqueue] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
