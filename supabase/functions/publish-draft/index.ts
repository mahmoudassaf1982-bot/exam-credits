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
    const userId = userData.user.id;

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminSupabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const { draft_id, approved_indices } = await req.json();
    if (!draft_id) return jsonResponse({ error: "draft_id required" }, 400);

    const { data: draft, error: draftError } = await adminSupabase
      .from("question_drafts")
      .select("*")
      .eq("id", draft_id)
      .single();

    if (draftError || !draft) return jsonResponse({ error: "Draft not found" }, 404);
    if (draft.status === "approved") return jsonResponse({ error: "Draft already published" }, 400);

    // Use corrected version if available, otherwise fall back to original draft
    const questions = (draft.corrected_questions_json || draft.draft_questions_json) as any[];
    if (!Array.isArray(questions) || questions.length === 0) {
      return jsonResponse({ error: "Draft has no questions" }, 400);
    }

    // Filter to only approved indices if provided, else publish all
    const toPublish = Array.isArray(approved_indices) && approved_indices.length > 0
      ? questions.filter((_: any, i: number) => approved_indices.includes(i))
      : questions;

    if (toPublish.length === 0) {
      return jsonResponse({ error: "No questions selected for publishing" }, 400);
    }

    // ── Duplicate Guard ──────────────────────────────────────────────
    let guardedQuestions = toPublish;
    let duplicateRejectedCount = 0;
    let guardEmbeddings: Record<number, number[]> = {};

    try {
      const guardPayload = {
        questions: toPublish.map((q: any) => ({
          text_ar: q.text_ar,
          topic: q.topic || q.topic_tag,
          topic_tag: q.topic_tag || q.topic,
          section_id: q.section_id || draft.section_id,
        })),
        exam_template_id: draft.exam_template_id,
        section_id: draft.section_id,
        draft_id: draft.id,
      };

      const guardUrl = `${supabaseUrl}/functions/v1/duplicate-guard`;
      const guardResponse = await fetch(guardUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(guardPayload),
      });

      if (guardResponse.ok) {
        const guardData = await guardResponse.json();
        if (guardData.ok && Array.isArray(guardData.results)) {
          const acceptedIndices = new Set<number>();
          for (const r of guardData.results) {
            if (r.action === "accepted") {
              acceptedIndices.add(r.index);
              if (r.embedding) {
                guardEmbeddings[r.index] = r.embedding;
              }
            }
          }
          guardedQuestions = toPublish.filter((_: any, i: number) => acceptedIndices.has(i));
          duplicateRejectedCount = toPublish.length - guardedQuestions.length;

          if (duplicateRejectedCount > 0) {
            console.log(`[publish-draft] Duplicate Guard rejected ${duplicateRejectedCount}/${toPublish.length} questions`);
          }
        }
      } else {
        console.warn("[publish-draft] Duplicate Guard returned non-ok, proceeding without dedup:", guardResponse.status);
      }
    } catch (guardErr) {
      console.warn("[publish-draft] Duplicate Guard call failed, proceeding without dedup:", guardErr);
    }

    if (guardedQuestions.length === 0) {
      // All questions were duplicates
      await adminSupabase
        .from("question_drafts")
        .update({ status: "duplicate_rejected", notes: `All ${toPublish.length} questions rejected as duplicates` })
        .eq("id", draft_id);

      return jsonResponse({
        ok: false,
        draft_id,
        error: "All questions were detected as duplicates",
        error_ar: "جميع الأسئلة مكررة ولم يتم نشرها",
        duplicate_rejected_count: duplicateRejectedCount,
        published_count: 0,
      });
    }

    // Build rows for questions table
    const dbRows = guardedQuestions.map((q: any, idx: number) => {
      const row: any = {
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
      };

      // Find the original index to attach embedding
      const origIdx = toPublish.indexOf(q);
      if (origIdx >= 0 && guardEmbeddings[origIdx]) {
        row.embedding = `[${guardEmbeddings[origIdx].join(",")}]`;
      }

      return row;
    });

    const { data: inserted, error: insertError } = await adminSupabase
      .from("questions")
      .insert(dbRows)
      .select("id");

    if (insertError) {
      console.error("[publish-draft] Insert error:", insertError);
      return jsonResponse({ error: "Failed to publish questions", details: insertError.message }, 500);
    }

    // Mark draft as approved
    const { error: updateError } = await adminSupabase
      .from("question_drafts")
      .update({
        status: "approved",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        notes: duplicateRejectedCount > 0
          ? `${duplicateRejectedCount} duplicate(s) filtered, ${guardedQuestions.length} published`
          : null,
      })
      .eq("id", draft_id);

    if (updateError) {
      console.error("[publish-draft] Update error:", updateError);
    }

    const publishedCount = inserted?.length || 0;
    console.log("[publish-draft] ✅ Published", publishedCount, "questions from draft:", draft_id,
      duplicateRejectedCount > 0 ? `(${duplicateRejectedCount} duplicates filtered)` : "");

    return jsonResponse({
      ok: true,
      draft_id,
      published_count: publishedCount,
      duplicate_rejected_count: duplicateRejectedCount,
      published_ids: inserted?.map((q: any) => q.id) || [],
    });
  } catch (e) {
    console.error("[publish-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
