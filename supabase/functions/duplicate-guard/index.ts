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
const CONCEPT_SIMILARITY_THRESHOLD = 0.72; // Lowered from 0.78 for better concept detection
const CONCEPT_SAME_TOPIC_BOOST = 0.06;     // Boost when topic matches
const CONCEPT_SAME_SECTION_BOOST = 0.02;   // Boost when section matches
const CONCEPT_FINAL_THRESHOLD = 0.78;      // Effective threshold after boosts
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
  // Must match the format used by backfill-embeddings for consistent similarity
  const parts = [question.text_ar];
  if (question.topic) parts.push(`[topic: ${question.topic}]`);
  if (question.section_id) parts.push(`[section: ${question.section_id}]`);
  return parts.join(" ");
}

// ─── Extract numeric/operation patterns from Arabic math text ────────
function extractMathPatterns(text: string): string[] {
  const patterns: string[] = [];
  // Extract numbers
  const nums = text.match(/\d+(\.\d+)?/g);
  if (nums) patterns.push(...nums.sort().map(n => `num:${n}`));
  // Detect operations
  if (/جذر|√/u.test(text)) patterns.push("op:sqrt");
  if (/كسر|عشري/u.test(text)) patterns.push("op:fraction");
  if (/ميل|خط مستقيم|معادلة/u.test(text)) patterns.push("op:line_eq");
  if (/طرح|أكل|أعط|بقي/u.test(text)) patterns.push("op:subtract");
  if (/جمع|مجموع|ناتج جمع/u.test(text)) patterns.push("op:add");
  if (/ضرب|حاصل ضرب/u.test(text)) patterns.push("op:multiply");
  if (/قسمة|حاصل قسمة/u.test(text)) patterns.push("op:divide");
  return patterns;
}

// ─── Compute pattern overlap score ───────────────────────────────────
function patternOverlapScore(patternsA: string[], patternsB: string[]): number {
  if (patternsA.length === 0 || patternsB.length === 0) return 0;
  const setA = new Set(patternsA);
  const setB = new Set(patternsB);
  let intersection = 0;
  for (const p of setA) if (setB.has(p)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
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
        console.warn(`[duplicate-guard] Embedding failed for question ${i}, accepting without dedup`);
        results.push({
          index: i,
          action: "accepted",
          similarity_score: 0,
          concept_match_score: 0,
        });
        continue;
      }

      // Step 2: Vector similarity search — use lower threshold to catch more candidates
      const embeddingStr = `[${embedding.join(",")}]`;
      const { data: matches, error: matchError } = await adminSupabase.rpc(
        "match_similar_questions",
        {
          query_embedding: embeddingStr,
          p_exam_template_id: exam_template_id,
          p_section_id: null, // Search across all sections for better recall
          match_threshold: CONCEPT_SIMILARITY_THRESHOLD,
          match_count: 10,
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

      // Step 3: Extract patterns from incoming question
      const incomingPatterns = extractMathPatterns(q.text_ar);

      // Step 4: Evaluate matches with boosted scoring
      let bestTextSim = 0;
      let bestConceptScore = 0;
      let bestMatchId: string | undefined;
      let bestMatchText: string | undefined;
      let rejectionReason: string | undefined;

      if (matches && matches.length > 0) {
        for (const match of matches) {
          const rawSim = match.similarity || 0;

          // ── Text duplicate: pure embedding similarity ──
          if (rawSim >= TEXT_SIMILARITY_THRESHOLD) {
            if (rawSim > bestTextSim) {
              bestTextSim = rawSim;
              bestMatchId = match.id;
              bestMatchText = match.text_ar;
              rejectionReason = `text_duplicate (similarity=${rawSim.toFixed(3)})`;
            }
            continue; // Already caught as text dup, skip concept check
          }

          // ── Concept duplicate: boosted scoring ──
          let conceptScore = rawSim;
          const boostReasons: string[] = [];

          // Boost 1: Same topic
          const incomingTopic = (q.topic || q.topic_tag || "").toLowerCase().trim();
          const matchTopic = (match.topic || "").toLowerCase().trim();
          if (incomingTopic && matchTopic && incomingTopic === matchTopic) {
            conceptScore += CONCEPT_SAME_TOPIC_BOOST;
            boostReasons.push("same_topic");
          }

          // Boost 2: Same section
          const incomingSection = q.section_id || section_id || "";
          const matchSection = match.section_id || "";
          if (incomingSection && matchSection && incomingSection === matchSection) {
            conceptScore += CONCEPT_SAME_SECTION_BOOST;
            boostReasons.push("same_section");
          }

          // Boost 3: Pattern overlap (numbers, operations)
          const matchPatterns = extractMathPatterns(match.text_ar || "");
          const patternScore = patternOverlapScore(incomingPatterns, matchPatterns);
          if (patternScore >= 0.5) {
            conceptScore += patternScore * 0.04; // Up to 0.04 boost
            boostReasons.push(`pattern_overlap=${patternScore.toFixed(2)}`);
          }

          console.log(
            `[duplicate-guard]   Match: sim=${rawSim.toFixed(3)}, boosted=${conceptScore.toFixed(3)}, ` +
            `boosts=[${boostReasons.join(",")}], text="${(match.text_ar || "").substring(0, 50)}..."`
          );

          if (conceptScore >= CONCEPT_FINAL_THRESHOLD && conceptScore > bestConceptScore) {
            bestConceptScore = conceptScore;
            if (!rejectionReason) {
              bestMatchId = match.id;
              bestMatchText = match.text_ar;
              rejectionReason = `concept_duplicate (raw_sim=${rawSim.toFixed(3)}, boosted=${conceptScore.toFixed(3)}, boosts=[${boostReasons.join(",")}])`;
            }
          }

          // Track best raw similarity
          if (rawSim > bestTextSim) bestTextSim = rawSim;
        }
      }

      const isDuplicate = !!rejectionReason;

      results.push({
        index: i,
        action: isDuplicate ? "rejected" : "accepted",
        rejection_reason: rejectionReason,
        similarity_score: Math.max(bestTextSim, bestConceptScore),
        concept_match_score: bestConceptScore,
        matched_question_id: bestMatchId,
        matched_question_text: bestMatchText,
        embedding: isDuplicate ? undefined : embedding,
      });

      // Step 5: Log
      await adminSupabase.from("duplicate_guard_logs").insert({
        question_draft_id: draft_id || null,
        question_text: q.text_ar?.substring(0, 500),
        exam_template_id,
        section_id: q.section_id || section_id || null,
        similarity_score: Math.max(bestTextSim, bestConceptScore),
        concept_match_score: bestConceptScore,
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
