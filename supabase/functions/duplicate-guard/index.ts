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

const TEXT_SIMILARITY_THRESHOLD = 0.85;
const CONCEPT_SIMILARITY_THRESHOLD = 0.78;
const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

// ─── Generate embedding via OpenAI API ───────────────────────────────
async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[] | null> {
  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[duplicate-guard] OpenAI API error:", response.status, errText.substring(0, 300));
      return null;
    }

    const data = await response.json();
    return data?.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("[duplicate-guard] Embedding generation failed:", e);
    return null;
  }
}

// ─── Build rich text for embedding ───────────────────────────────────
function buildEmbeddingText(question: {
  text_ar: string;
  topic?: string;
  section_id?: string;
}): string {
  const parts = [question.text_ar];
  if (question.topic) parts.push(`[topic: ${question.topic}]`);
  if (question.section_id) parts.push(`[section: ${question.section_id}]`);
  return parts.join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);
    }

    const adminSupabase = createClient(supabaseUrl, serviceKey);

    const { questions, exam_template_id, section_id, draft_id } =
      await req.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      return jsonResponse({ error: "questions array required" }, 400);
    }
    if (!exam_template_id) {
      return jsonResponse({ error: "exam_template_id required" }, 400);
    }

    console.log(
      `[duplicate-guard] Checking ${questions.length} questions for exam=${exam_template_id}, section=${section_id || "all"}`
    );

    const results: {
      index: number;
      action: "accepted" | "rejected";
      rejection_reason?: string;
      similarity_score: number;
      concept_match_score: number;
      matched_question_id?: string;
      matched_question_text?: string;
      embedding?: number[];
    }[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const embeddingText = buildEmbeddingText({
        text_ar: q.text_ar,
        topic: q.topic || q.topic_tag,
        section_id: q.section_id || section_id,
      });

      // Step 1: Generate embedding
      const embedding = await generateEmbedding(embeddingText, OPENAI_API_KEY);

      if (!embedding) {
        // If embedding fails, accept the question but without dedup
        console.warn(`[duplicate-guard] Embedding failed for question ${i}, accepting without dedup`);
        results.push({
          index: i,
          action: "accepted",
          similarity_score: 0,
          concept_match_score: 0,
        });
        continue;
      }

      // Step 2: Vector similarity search using the DB function
      const embeddingStr = `[${embedding.join(",")}]`;
      const { data: matches, error: matchError } = await adminSupabase.rpc(
        "match_similar_questions",
        {
          query_embedding: embeddingStr,
          p_exam_template_id: exam_template_id,
          p_section_id: q.section_id || section_id || null,
          match_threshold: CONCEPT_SIMILARITY_THRESHOLD,
          match_count: 5,
        }
      );

      if (matchError) {
        console.error(`[duplicate-guard] Match error for question ${i}:`, matchError);
        results.push({
          index: i,
          action: "accepted",
          similarity_score: 0,
          concept_match_score: 0,
          embedding,
        });
        continue;
      }

      // Step 3: Evaluate matches
      let bestTextSim = 0;
      let bestConceptSim = 0;
      let bestMatchId: string | undefined;
      let bestMatchText: string | undefined;
      let rejectionReason: string | undefined;

      if (matches && matches.length > 0) {
        for (const match of matches) {
          const sim = match.similarity || 0;

          // Text duplicate check
          if (sim >= TEXT_SIMILARITY_THRESHOLD) {
            if (sim > bestTextSim) {
              bestTextSim = sim;
              bestMatchId = match.id;
              bestMatchText = match.text_ar;
              rejectionReason = `text_duplicate (similarity=${sim.toFixed(3)})`;
            }
          }

          // Concept duplicate check: same topic + high similarity
          const sameTopicOrSection =
            (q.topic || q.topic_tag) &&
            match.topic &&
            (q.topic || q.topic_tag).toLowerCase().trim() ===
              match.topic.toLowerCase().trim();

          if (sameTopicOrSection && sim >= CONCEPT_SIMILARITY_THRESHOLD) {
            if (sim > bestConceptSim) {
              bestConceptSim = sim;
              if (!rejectionReason) {
                bestMatchId = match.id;
                bestMatchText = match.text_ar;
                rejectionReason = `concept_duplicate (similarity=${sim.toFixed(3)}, same_topic="${match.topic}")`;
              }
            }
          }

          // Update best scores
          if (sim > bestTextSim && sim < TEXT_SIMILARITY_THRESHOLD) {
            bestTextSim = sim;
          }
        }
      }

      const isDuplicate = !!rejectionReason;

      results.push({
        index: i,
        action: isDuplicate ? "rejected" : "accepted",
        rejection_reason: rejectionReason,
        similarity_score: Math.max(bestTextSim, bestConceptSim),
        concept_match_score: bestConceptSim,
        matched_question_id: bestMatchId,
        matched_question_text: bestMatchText,
        embedding: isDuplicate ? undefined : embedding,
      });

      // Step 4: Log
      await adminSupabase.from("duplicate_guard_logs").insert({
        question_draft_id: draft_id || null,
        question_text: q.text_ar?.substring(0, 500),
        exam_template_id,
        section_id: q.section_id || section_id || null,
        similarity_score: Math.max(bestTextSim, bestConceptSim),
        concept_match_score: bestConceptSim,
        matched_question_id: bestMatchId || null,
        matched_question_text: bestMatchText?.substring(0, 500) || null,
        action: isDuplicate ? "rejected" : "accepted",
        rejection_reason: rejectionReason || null,
      });
    }

    const accepted = results.filter((r) => r.action === "accepted");
    const rejected = results.filter((r) => r.action === "rejected");

    console.log(
      `[duplicate-guard] ✅ Results: ${accepted.length} accepted, ${rejected.length} rejected out of ${questions.length}`
    );

    return jsonResponse({
      ok: true,
      total: questions.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      results,
    });
  } catch (e) {
    console.error("[duplicate-guard] Error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500
    );
  }
});
