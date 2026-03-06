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

    // Get reference questions with embeddings
    const { data: refQuestions, error: refErr } = await adminSupabase
      .from("questions")
      .select("id, text_ar, topic, section_id, exam_template_id, difficulty")
      .eq("status", "approved")
      .is("deleted_at", null)
      .not("embedding", "is", null)
      .limit(20);

    if (refErr || !refQuestions || refQuestions.length === 0) {
      return jsonResponse({ error: "No approved questions with embeddings found" }, 404);
    }

    // Pick specific reference questions
    const lineRef = refQuestions.find(q => q.text_ar.includes("معادلة الخط المستقيم الذي ميله 2"));
    const sqrt81Ref = refQuestions.find(q => q.text_ar.includes("الجذر التربيعي للعدد 81"));
    const sqrt144Ref = refQuestions.find(q => q.text_ar.includes("جذر(144)"));
    const fractionRef = refQuestions.find(q => q.text_ar.includes("0.75 إلى كسر"));
    const evenRef = refQuestions.find(q => q.text_ar.includes("أعداد زوجية"));

    const primaryRef = lineRef || refQuestions[0];

    console.log(`[test-guard] Found ${refQuestions.length} reference questions`);
    console.log(`[test-guard] Primary ref: "${primaryRef.text_ar.substring(0, 60)}..." topic=${primaryRef.topic}`);

    const testCases: any[] = [];

    // ─── CASE A: Exact text duplicate ───
    testCases.push({
      name: "CASE_A_EXACT_DUPLICATE",
      description: "Exact same text → must reject as text_duplicate",
      question: {
        text_ar: primaryRef.text_ar,
        topic: primaryRef.topic,
        topic_tag: primaryRef.topic,
        section_id: primaryRef.section_id,
      },
      expected_action: "rejected",
      expected_reason: "text_duplicate",
    });

    // ─── CASE B1: Line equation - same concept, scenario wording ───
    if (lineRef) {
      testCases.push({
        name: "CASE_B1_LINE_EQUATION_REPHRASE",
        description: "Same concept (line with slope 2 through origin) rephrased as scenario",
        question: {
          text_ar: "إذا كان ميل خط مستقيم يساوي 2 ويقطع محور الصادات عند نقطة الأصل، فما المعادلة التي تمثل هذا الخط المستقيم؟",
          topic: lineRef.topic,
          topic_tag: lineRef.topic,
          section_id: lineRef.section_id,
        },
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      });
    }

    // ─── CASE B2: √81 - same question, different format ───
    if (sqrt81Ref) {
      testCases.push({
        name: "CASE_B2_SQRT81_REPHRASE",
        description: "Same question (√81) with different wording structure",
        question: {
          text_ar: "احسب قيمة الجذر التربيعي للعدد واحد وثمانين",
          topic: sqrt81Ref.topic,
          topic_tag: sqrt81Ref.topic,
          section_id: sqrt81Ref.section_id,
        },
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      });
    }

    // ─── CASE B3: Fraction 0.75 - closer rephrase ───
    if (fractionRef) {
      testCases.push({
        name: "CASE_B3_FRACTION_075_REPHRASE",
        description: "Same concept (convert 0.75 to simplest fraction) with minimal rewording",
        question: {
          text_ar: "حوّل العدد العشري 0.75 إلى كسر اعتيادي واختصره إلى أبسط صورة",
          topic: fractionRef.topic,
          topic_tag: fractionRef.topic,
          section_id: fractionRef.section_id,
        },
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      });
    }

    // ─── CASE C: Genuinely different question ───
    testCases.push({
      name: "CASE_C_VALID_NEW",
      description: "Completely different concept → should be accepted",
      question: {
        text_ar: "ما هو المضاعف المشترك الأصغر للعددين 15 و 20 باستخدام التحليل إلى عوامل أولية؟",
        topic: "المضاعفات_والعوامل",
        topic_tag: "المضاعفات_والعوامل",
        section_id: primaryRef.section_id,
      },
      expected_action: "accepted",
      expected_reason: null,
    });

    // ─── CASE D: Different topic, same section → accepted ───
    testCases.push({
      name: "CASE_D_DIFF_TOPIC_SAME_SECTION",
      description: "Different mathematical topic entirely → should be accepted",
      question: {
        text_ar: "ما هي مساحة المثلث الذي قاعدته 10 سم وارتفاعه 6 سم؟",
        topic: "مساحات_الأشكال_الهندسية",
        topic_tag: "مساحات_الأشكال_الهندسية",
        section_id: primaryRef.section_id,
      },
      expected_action: "accepted",
      expected_reason: null,
    });

    const results: any[] = [];
    const examTemplateId = primaryRef.exam_template_id;

    for (const tc of testCases) {
      console.log(`\n[test-guard] ── ${tc.name} ──`);
      console.log(`[test-guard] ${tc.description}`);

      try {
        const guardResponse = await fetch(`${supabaseUrl}/functions/v1/duplicate-guard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            questions: [tc.question],
            exam_template_id: examTemplateId,
            section_id: tc.question.section_id,
            draft_id: null,
          }),
        });

        const guardData = await guardResponse.json();

        if (!guardResponse.ok || !guardData.ok) {
          results.push({ case: tc.name, status: "ERROR", description: tc.description, error: guardData.error });
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
          expected: `${tc.expected_action} (${tc.expected_reason || "any"})`,
          actual: `${actualAction} (${result?.rejection_reason || "none"})`,
          similarity_score: result?.similarity_score,
          concept_match_score: result?.concept_match_score,
          matched_question_id: result?.matched_question_id,
        });

        console.log(`[test-guard] ${passed ? "✅" : "❌"} ${tc.name}: expected=${tc.expected_action}, actual=${actualAction}`);
      } catch (e) {
        results.push({ case: tc.name, status: "ERROR", error: e instanceof Error ? e.message : String(e) });
      }
    }

    const passCount = results.filter(r => r.status === "PASS ✅").length;
    const failCount = results.filter(r => r.status === "FAIL ❌").length;

    return jsonResponse({
      ok: true,
      summary: { passed: passCount, failed: failCount, errors: results.filter(r => r.status === "ERROR").length, total: results.length },
      results,
    });
  } catch (e) {
    console.error("[test-guard] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
