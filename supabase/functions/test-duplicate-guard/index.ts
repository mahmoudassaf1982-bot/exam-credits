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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceKey);

    // Get diverse reference questions with embeddings
    const { data: refQuestions, error: refErr } = await adminSupabase
      .from("questions")
      .select("id, text_ar, topic, section_id, exam_template_id, difficulty")
      .eq("status", "approved")
      .is("deleted_at", null)
      .not("embedding", "is", null)
      .limit(10);

    if (refErr || !refQuestions || refQuestions.length === 0) {
      return jsonResponse({ error: "No approved questions with embeddings found" }, 404);
    }

    // Pick specific reference questions for strong tests
    const mathRef = refQuestions.find(q => q.text_ar.includes("معادلة الخط المستقيم")) || refQuestions[0];
    const sqrtRef = refQuestions.find(q => q.text_ar.includes("جذر(144)")) || refQuestions[1] || refQuestions[0];
    const fractionRef = refQuestions.find(q => q.text_ar.includes("0.75 إلى كسر")) || refQuestions[2] || refQuestions[0];
    const appleRef = refQuestions.find(q => q.text_ar.includes("تفاحات")) || refQuestions[3] || refQuestions[0];

    console.log(`[test-guard] Using ${refQuestions.length} reference questions`);
    console.log(`[test-guard] Math ref: "${mathRef.text_ar.substring(0, 60)}..." topic=${mathRef.topic}`);

    // Build test cases
    const testCases = [
      // ─── CASE A: Exact text duplicate ───
      {
        name: "CASE_A_EXACT_DUPLICATE",
        description: "Exact same text → must reject as text_duplicate",
        question: {
          text_ar: mathRef.text_ar,
          topic: mathRef.topic,
          topic_tag: mathRef.topic,
          section_id: mathRef.section_id,
        },
        ref_id: mathRef.id,
        expected_action: "rejected",
        expected_reason: "text_duplicate",
      },

      // ─── CASE B1: Same math concept, scenario wording ───
      {
        name: "CASE_B1_CONCEPT_LINE_EQUATION",
        description: "Same concept (line through origin with slope 2) expressed as scenario",
        question: {
          text_ar: "إذا كان ميل خط مستقيم يساوي 2 ويقطع محور الصادات عند نقطة الأصل، فما المعادلة التي تمثل هذا الخط المستقيم؟",
          topic: mathRef.topic,
          topic_tag: mathRef.topic,
          section_id: mathRef.section_id,
        },
        ref_id: mathRef.id,
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      },

      // ─── CASE B2: Same square root computation, different format ───
      {
        name: "CASE_B2_CONCEPT_SQRT_SUM",
        description: "Same computation (√144 + √81) with different sentence structure",
        question: {
          text_ar: "احسب ناتج جمع الجذر التربيعي للعدد 144 مع الجذر التربيعي للعدد 81",
          topic: sqrtRef.topic,
          topic_tag: sqrtRef.topic,
          section_id: sqrtRef.section_id,
        },
        ref_id: sqrtRef.id,
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      },

      // ─── CASE B3: Same decimal-to-fraction concept with scenario ───
      {
        name: "CASE_B3_CONCEPT_FRACTION_CONVERSION",
        description: "Same concept (convert 0.75 to simplest fraction) as word problem",
        question: {
          text_ar: "عبّر عن العدد العشري 0.75 على شكل كسر عادي مختصر إلى أبسط صورة ممكنة",
          topic: fractionRef.topic,
          topic_tag: fractionRef.topic,
          section_id: fractionRef.section_id,
        },
        ref_id: fractionRef.id,
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      },

      // ─── CASE B4: Same subtraction concept with different scenario ───
      {
        name: "CASE_B4_CONCEPT_SUBTRACTION_SCENARIO",
        description: "Same subtraction (8-3=5) with different objects/scenario",
        question: {
          text_ar: "كان عند سارة 8 أقلام ملونة، فأعطت صديقتها 3 أقلام منها. كم قلماً بقي عند سارة؟",
          topic: appleRef.topic,
          topic_tag: appleRef.topic,
          section_id: appleRef.section_id,
        },
        ref_id: appleRef.id,
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      },

      // ─── CASE C: Genuinely different question ───
      {
        name: "CASE_C_VALID_NEW",
        description: "Completely different concept, should be accepted",
        question: {
          text_ar: "ما هو المضاعف المشترك الأصغر للعددين 12 و 18؟ وكيف يمكن إيجاده باستخدام التحليل إلى عوامل أولية؟",
          topic: "المضاعفات_والعوامل",
          topic_tag: "المضاعفات_والعوامل",
          section_id: mathRef.section_id,
        },
        ref_id: null,
        expected_action: "accepted",
        expected_reason: null,
      },
    ];

    const results: any[] = [];

    for (const tc of testCases) {
      console.log(`\n[test-guard] ── ${tc.name} ──`);
      console.log(`[test-guard] ${tc.description}`);
      console.log(`[test-guard] Text: "${tc.question.text_ar.substring(0, 70)}..."`);

      try {
        const guardUrl = `${supabaseUrl}/functions/v1/duplicate-guard`;
        const guardResponse = await fetch(guardUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            questions: [tc.question],
            exam_template_id: mathRef.exam_template_id,
            section_id: tc.question.section_id,
            draft_id: null,
          }),
        });

        const guardData = await guardResponse.json();

        if (!guardResponse.ok || !guardData.ok) {
          results.push({
            case: tc.name,
            status: "ERROR",
            description: tc.description,
            error: guardData.error || `HTTP ${guardResponse.status}`,
          });
          console.error(`[test-guard] ❌ ${tc.name}: Error`, guardData.error);
          continue;
        }

        const result = guardData.results?.[0];
        const actualAction = result?.action;
        const passed =
          actualAction === tc.expected_action &&
          (tc.expected_reason === null || (result?.rejection_reason || "").includes(tc.expected_reason));

        results.push({
          case: tc.name,
          status: passed ? "PASS ✅" : "FAIL ❌",
          description: tc.description,
          expected_action: tc.expected_action,
          expected_reason: tc.expected_reason,
          actual_action: actualAction,
          actual_reason: result?.rejection_reason || null,
          similarity_score: result?.similarity_score,
          concept_match_score: result?.concept_match_score,
          matched_question_id: result?.matched_question_id,
          ref_question_id: tc.ref_id,
        });

        console.log(`[test-guard] ${passed ? "✅ PASS" : "❌ FAIL"}: ${tc.name}`);
        console.log(`[test-guard]   Expected: ${tc.expected_action} (${tc.expected_reason})`);
        console.log(`[test-guard]   Actual:   ${actualAction} (${result?.rejection_reason || "none"})`);
        console.log(`[test-guard]   Similarity: ${result?.similarity_score}, Concept: ${result?.concept_match_score}`);
      } catch (e) {
        results.push({
          case: tc.name,
          status: "ERROR",
          description: tc.description,
          error: e instanceof Error ? e.message : String(e),
        });
        console.error(`[test-guard] ❌ ${tc.name}: Exception`, e);
      }
    }

    const passCount = results.filter((r) => r.status === "PASS ✅").length;
    const failCount = results.filter((r) => r.status === "FAIL ❌").length;
    const errorCount = results.filter((r) => r.status === "ERROR").length;

    console.log(`\n[test-guard] ═══════════════════════════════`);
    console.log(`[test-guard] Summary: ${passCount} passed, ${failCount} failed, ${errorCount} errors`);
    console.log(`[test-guard] ═══════════════════════════════`);

    return jsonResponse({
      ok: true,
      reference_questions: refQuestions.slice(0, 5).map(q => ({
        id: q.id,
        text_preview: q.text_ar?.substring(0, 80),
        topic: q.topic,
        section_id: q.section_id,
      })),
      summary: { passed: passCount, failed: failCount, errors: errorCount, total: results.length },
      results,
    });
  } catch (e) {
    console.error("[test-guard] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
