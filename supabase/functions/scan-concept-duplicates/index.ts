import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extract math patterns for boosted scoring
function extractMathPatterns(text: string): string[] {
  const patterns: string[] = [];
  const nums = text.match(/\d+(\.\d+)?/g);
  if (nums) patterns.push(...nums.sort().map(n => `num:${n}`));
  if (/جذر|√/u.test(text)) patterns.push("op:sqrt");
  if (/كسر|عشري/u.test(text)) patterns.push("op:fraction");
  if (/ميل|خط مستقيم|معادلة/u.test(text)) patterns.push("op:line_eq");
  if (/طرح|أكل|أعط|بقي/u.test(text)) patterns.push("op:subtract");
  if (/جمع|مجموع|ناتج جمع/u.test(text)) patterns.push("op:add");
  if (/ضرب|حاصل ضرب/u.test(text)) patterns.push("op:multiply");
  if (/قسمة|حاصل قسمة/u.test(text)) patterns.push("op:divide");
  return patterns;
}

function patternOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const p of setA) if (setB.has(p)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // 1. Get all active questions with embeddings
    const { data: questions, error: qErr } = await db
      .from("questions")
      .select("id, text_ar, topic, section_id, exam_template_id, difficulty, embedding, explanation, status")
      .is("deleted_at", null)
      .eq("status", "approved")
      .not("embedding", "is", null)
      .order("created_at", { ascending: true });

    if (qErr) return jsonResponse({ error: qErr.message }, 500);
    if (!questions || questions.length === 0) return jsonResponse({ error: "No questions with embeddings found" }, 404);

    console.log(`[scan-concept-dup] Scanning ${questions.length} active questions with embeddings`);

    // Track which questions are already clustered
    const clustered = new Set<string>();
    const clusters: {
      cluster_id: number;
      anchor_id: string;
      anchor_text: string;
      anchor_topic: string;
      anchor_section_id: string | null;
      members: {
        id: string;
        text_ar: string;
        topic: string;
        section_id: string | null;
        raw_similarity: number;
        boosted_score: number;
        boost_reasons: string[];
        difficulty: string;
        has_explanation: boolean;
      }[];
    }[] = [];

    let clusterCount = 0;

    // 2. For each question, find similar ones via RPC
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (clustered.has(q.id)) continue;

      // Use match_similar_questions RPC with low threshold
      const { data: matches, error: matchErr } = await db.rpc("match_similar_questions", {
        query_embedding: q.embedding,
        p_exam_template_id: q.exam_template_id,
        p_section_id: null,
        match_threshold: 0.55,
        match_count: 20,
      });

      if (matchErr || !matches || matches.length === 0) continue;

      // Filter out self and already-clustered
      const qPatterns = extractMathPatterns(q.text_ar);
      const members: typeof clusters[0]["members"] = [];

      for (const m of matches) {
        if (m.id === q.id || clustered.has(m.id)) continue;

        const rawSim = m.similarity || 0;

        // Apply boosted scoring (same logic as duplicate-guard)
        let boosted = rawSim;
        const boostReasons: string[] = [];

        const qTopic = (q.topic || "").toLowerCase().trim();
        const mTopic = (m.topic || "").toLowerCase().trim();
        if (qTopic && mTopic && qTopic === mTopic) {
          boosted += 0.10;
          boostReasons.push("same_topic");
        }

        if (q.section_id && m.section_id && q.section_id === m.section_id) {
          boosted += 0.03;
          boostReasons.push("same_section");
        }

        const mPatterns = extractMathPatterns(m.text_ar || "");
        const pScore = patternOverlapScore(qPatterns, mPatterns);
        if (pScore >= 0.3) {
          boosted += pScore * 0.06;
          boostReasons.push(`pattern=${pScore.toFixed(2)}`);
        }

        // Only report if boosted >= 0.70 AND has topic match (meaningful concept overlap)
        const hasTopicMatch = boostReasons.includes("same_topic");
        if (boosted >= 0.70 && hasTopicMatch) {
          // Find the full question to check explanation
          const fullQ = questions.find(fq => fq.id === m.id);
          members.push({
            id: m.id,
            text_ar: (m.text_ar || "").substring(0, 200),
            topic: m.topic,
            section_id: m.section_id,
            raw_similarity: parseFloat(rawSim.toFixed(4)),
            boosted_score: parseFloat(boosted.toFixed(4)),
            boost_reasons: boostReasons,
            difficulty: m.difficulty,
            has_explanation: !!fullQ?.explanation,
          });
        }
      }

      if (members.length > 0) {
        clusterCount++;
        clustered.add(q.id);
        members.forEach(m => clustered.add(m.id));

        clusters.push({
          cluster_id: clusterCount,
          anchor_id: q.id,
          anchor_text: q.text_ar.substring(0, 200),
          anchor_topic: q.topic,
          anchor_section_id: q.section_id,
          members,
        });
      }

      // Progress logging every 50 questions
      if ((i + 1) % 50 === 0) {
        console.log(`[scan-concept-dup] Processed ${i + 1}/${questions.length}, clusters found: ${clusterCount}`);
      }
    }

    // 3. Summary
    const totalInClusters = clusters.reduce((sum, c) => sum + c.members.length + 1, 0);
    const highSimClusters = clusters.filter(c => c.members.some(m => m.boosted_score >= 0.85));
    const mediumSimClusters = clusters.filter(c => 
      !c.members.some(m => m.boosted_score >= 0.85) && c.members.some(m => m.boosted_score >= 0.75)
    );
    const lowSimClusters = clusters.filter(c => 
      !c.members.some(m => m.boosted_score >= 0.75)
    );

    console.log(`[scan-concept-dup] ✅ Scan complete: ${clusters.length} clusters, ${totalInClusters} questions involved`);

    return jsonResponse({
      ok: true,
      summary: {
        total_questions_scanned: questions.length,
        total_clusters: clusters.length,
        total_questions_in_clusters: totalInClusters,
        high_similarity_clusters: highSimClusters.length,
        medium_similarity_clusters: mediumSimClusters.length,
        low_similarity_clusters: lowSimClusters.length,
        questions_not_in_any_cluster: questions.length - totalInClusters,
      },
      recommended_actions: {
        high_sim: `${highSimClusters.length} clusters with score ≥ 0.85 — strong concept duplicates, recommend keeping best version`,
        medium_sim: `${mediumSimClusters.length} clusters with score 0.75–0.85 — review manually before action`,
        low_sim: `${lowSimClusters.length} clusters with score 0.70–0.75 — informational, likely acceptable variation`,
      },
      clusters,
    });
  } catch (e) {
    console.error("[scan-concept-dup] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
