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

    // Step 1: Get a real question from the bank to use as reference
    const { data: refQuestions, error: refErr } = await adminSupabase
      .from("questions")
      .select("id, text_ar, topic, section_id, exam_template_id, difficulty")
      .eq("status", "approved")
      .not("deleted_at", "is", null)
      .is("deleted_at", null)
      .limit(1);

    if (refErr || !refQuestions || refQuestions.length === 0) {
      // Try without status filter
      const { data: anyQ, error: anyErr } = await adminSupabase
        .from("questions")
        .select("id, text_ar, topic, section_id, exam_template_id, difficulty")
        .is("deleted_at", null)
        .limit(1);

      if (anyErr || !anyQ || anyQ.length === 0) {
        return jsonResponse({ error: "No questions found in the bank to test against" }, 404);
      }
      refQuestions!.push(...anyQ);
    }

    const ref = refQuestions![0];
    console.log(`[test-guard] Reference question: "${ref.text_ar?.substring(0, 80)}..." (id=${ref.id})`);

    // Build test cases
    const testCases = [
      {
        name: "CASE_A_EXACT_DUPLICATE",
        description: "Exact same text as existing question",
        question: {
          text_ar: ref.text_ar,
          topic: ref.topic,
          topic_tag: ref.topic,
          section_id: ref.section_id,
        },
        expected_action: "rejected",
        expected_reason: "text_duplicate",
      },
      {
        name: "CASE_B_CONCEPT_DUPLICATE",
        description: "Same concept, different wording",
        question: {
          text_ar: rewordQuestion(ref.text_ar),
          topic: ref.topic,
          topic_tag: ref.topic,
          section_id: ref.section_id,
        },
        expected_action: "rejected",
        expected_reason: "concept_duplicate",
      },
      {
        name: "CASE_C_VALID_NEW",
        description: "Completely different question, same section",
        question: {
          text_ar: "ما هو الفرق بين المتغير المستقل والمتغير التابع في التجربة العلمية؟ وكيف يمكن التمييز بينهما في سياق البحث التجريبي المنهجي؟",
          topic: "منهجية_البحث_العلمي_التجريبي",
          topic_tag: "منهجية_البحث_العلمي_التجريبي",
          section_id: ref.section_id,
        },
        expected_action: "accepted",
        expected_reason: null,
      },
    ];

    const results: any[] = [];

    for (const tc of testCases) {
      console.log(`\n[test-guard] ── Running: ${tc.name} ──`);
      console.log(`[test-guard] Description: ${tc.description}`);
      console.log(`[test-guard] Text: "${tc.question.text_ar.substring(0, 80)}..."`);

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
            exam_template_id: ref.exam_template_id,
            section_id: ref.section_id,
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
            expected_action: tc.expected_action,
          });
          console.error(`[test-guard] ❌ ${tc.name}: Guard returned error`, guardData.error);
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
      reference_question: {
        id: ref.id,
        text_preview: ref.text_ar?.substring(0, 100),
        topic: ref.topic,
        exam_template_id: ref.exam_template_id,
        section_id: ref.section_id,
      },
      summary: { passed: passCount, failed: failCount, errors: errorCount, total: results.length },
      results,
    });
  } catch (e) {
    console.error("[test-guard] Fatal error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/** Simple rewording: adds prefixes/suffixes and shuffles phrasing */
function rewordQuestion(original: string): string {
  // Add Arabic rephrasing markers
  let reworded = original;

  // Common rewording patterns
  const replacements: [RegExp, string][] = [
    [/^ما هو /u, "ما المقصود بـ "],
    [/^ما هي /u, "ما التي تُعرف بأنها "],
    [/^أي /u, "أي واحد من التالي يُعتبر "],
    [/^كم /u, "ما مقدار "],
    [/\?|؟$/u, "؟ اختر الإجابة الأنسب."],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(reworded)) {
      reworded = reworded.replace(pattern, replacement);
      break;
    }
  }

  // If no pattern matched, add a prefix
  if (reworded === original) {
    reworded = "بناءً على ما درسته، " + original;
  }

  return reworded;
}
