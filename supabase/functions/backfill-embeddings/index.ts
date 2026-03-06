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

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 1500;
const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);
    }

    const adminSupabase = createClient(supabaseUrl, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const maxQuestions = body.max_questions || 500;
    const batchSize = Math.min(body.batch_size || BATCH_SIZE, 100);

    const { count: totalMissing } = await adminSupabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .is("deleted_at", null);

    console.log(`[backfill] Total questions missing embeddings: ${totalMissing}`);
    console.log(`[backfill] Will process up to ${maxQuestions}, batch size: ${batchSize}`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let batchNum = 0;

    while (processed < maxQuestions) {
      batchNum++;

      const { data: questions, error: fetchErr } = await adminSupabase
        .from("questions")
        .select("id, text_ar, topic, section_id")
        .is("embedding", null)
        .is("deleted_at", null)
        .limit(batchSize);

      if (fetchErr) {
        console.error(`[backfill] Fetch error in batch ${batchNum}:`, fetchErr);
        break;
      }

      if (!questions || questions.length === 0) {
        console.log(`[backfill] No more questions to process. Done.`);
        break;
      }

      console.log(`[backfill] Batch ${batchNum}: processing ${questions.length} questions`);

      const texts = questions.map((q) => {
        const parts = [q.text_ar];
        if (q.topic) parts.push(`[topic: ${q.topic}]`);
        if (q.section_id) parts.push(`[section: ${q.section_id}]`);
        return parts.join(" ");
      });

      try {
        const embResponse = await fetch(OPENAI_EMBEDDINGS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts,
          }),
        });

        if (!embResponse.ok) {
          const errText = await embResponse.text();
          console.error(`[backfill] OpenAI API error (batch ${batchNum}): ${embResponse.status}`, errText.substring(0, 300));

          if (embResponse.status === 429) {
            console.log(`[backfill] Rate limited. Waiting 10s...`);
            await sleep(10000);
            continue;
          }
          failed += questions.length;
          processed += questions.length;
          continue;
        }

        const embData = await embResponse.json();
        const embeddings = embData?.data;

        if (!Array.isArray(embeddings) || embeddings.length !== questions.length) {
          console.error(`[backfill] Unexpected embeddings count: got ${embeddings?.length}, expected ${questions.length}`);
          failed += questions.length;
          processed += questions.length;
          continue;
        }

        for (let i = 0; i < questions.length; i++) {
          const embedding = embeddings[i]?.embedding;
          if (!embedding) {
            failed++;
            processed++;
            continue;
          }

          const embStr = `[${embedding.join(",")}]`;
          const { error: updateErr } = await adminSupabase
            .from("questions")
            .update({ embedding: embStr })
            .eq("id", questions[i].id);

          if (updateErr) {
            console.error(`[backfill] Update error for ${questions[i].id}:`, updateErr.message);
            failed++;
          } else {
            succeeded++;
          }
          processed++;
        }

        console.log(`[backfill] Batch ${batchNum} done: ${succeeded} ok, ${failed} failed (${processed} total)`);
      } catch (apiErr) {
        console.error(`[backfill] API exception in batch ${batchNum}:`, apiErr);
        failed += questions.length;
        processed += questions.length;
      }

      if (processed < maxQuestions) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    const remainingCount = (totalMissing || 0) - succeeded;

    console.log(`\n[backfill] ═══════════════════════════════`);
    console.log(`[backfill] Run complete:`);
    console.log(`[backfill]   Processed: ${processed}`);
    console.log(`[backfill]   Succeeded: ${succeeded}`);
    console.log(`[backfill]   Failed: ${failed}`);
    console.log(`[backfill]   Remaining: ${remainingCount > 0 ? remainingCount : 0}`);
    console.log(`[backfill] ═══════════════════════════════`);

    return jsonResponse({
      ok: true,
      processed,
      succeeded,
      failed,
      total_missing_before: totalMissing,
      remaining: remainingCount > 0 ? remainingCount : 0,
      batches_run: batchNum,
    });
  } catch (e) {
    console.error("[backfill] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
