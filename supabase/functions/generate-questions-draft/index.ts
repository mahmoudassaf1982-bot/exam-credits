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

// ─── Content Language Detection ──────────────────────────────────────
// Maps exam section/subject names to their content language
function detectContentLanguage(examName: string, sectionId?: string | null): "en" | "ar" {
  const englishPatterns = [
    /english/i, /إنجليزي/i, /انجليزي/i, /انقليزي/i, /لغة إنجليزية/i,
    /sat/i, /ielts/i, /toefl/i, /grammar/i, /vocabulary/i, /reading comprehension/i,
  ];
  const combined = `${examName} ${sectionId || ""}`;
  for (const p of englishPatterns) {
    if (p.test(combined)) return "en";
  }
  return "ar";
}

function buildPrompts(
  examName: string,
  countryName: string,
  difficulty: string,
  count: number,
  contentLang: "en" | "ar"
): { system: string; user: string } {
  if (contentLang === "en") {
    // ── FULL ENGLISH GENERATION ──────────────────────────────────
    const system = `You are an Elite Exam Question Generator for SARIS Exams platform.
You MUST generate ALL content in ENGLISH ONLY.

🚨 HARD LANGUAGE LOCK — ENGLISH ONLY 🚨
- Question text: ENGLISH ONLY
- All 4 options (A,B,C,D): ENGLISH ONLY
- Explanation: ENGLISH ONLY
- Topic name: ENGLISH ONLY
- Instructions: ENGLISH ONLY
- NO Arabic characters allowed AT ALL — not even a single Arabic word
- If you output ANY Arabic text, the entire batch will be REJECTED

Rules:
- Academic English, clear and exam-grade
- Each question: max 2 lines stem
- Exactly 4 options (A, B, C, D)
- Exactly one correct answer
- Smart distractors (plausible, reflect common mistakes)
- No answer hinted in stem
- Concise explanation (1-3 sentences) in English
- Return JSON array ONLY, no markdown

Context: ${examName} - ${countryName}`;

    const diffMap: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
    const diffLabel = diffMap[difficulty] || "Medium";

    const user = `Generate exactly ${count} questions at difficulty "${diffLabel}" for "${examName}" (${countryName}).

CRITICAL: Every single character of output must be English. Zero Arabic allowed.

Return JSON array with this schema per item:
{
  "question_text": string (ENGLISH ONLY),
  "options": { "A": string, "B": string, "C": string, "D": string },
  "correct_answer": "A" | "B" | "C" | "D",
  "explanation": string (ENGLISH ONLY),
  "metadata": { "section": string, "difficulty": "${difficulty}", "topic": string (ENGLISH ONLY) }
}
⚠️ Return JSON array ONLY.`;

    return { system, user };
  }

  // ── FULL ARABIC GENERATION ──────────────────────────────────────
  const diffMap: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
  const diffAr = diffMap[difficulty] || "متوسط";

  const system = `You are an Elite Exam Question Generator for SARIS Exams platform.
You MUST generate ALL content in ARABIC ONLY.

🚨 HARD LANGUAGE LOCK — ARABIC ONLY 🚨
- Question text: ARABIC ONLY
- All 4 options: ARABIC ONLY
- Explanation: ARABIC ONLY
- Topic name: ARABIC ONLY
- NO English words allowed (except proper nouns, formulas, or technical terms that have no Arabic equivalent)

Rules:
- Academic Arabic, clear and exam-grade
- Each question: max 2 lines stem
- Exactly 4 options (A, B, C, D)
- Exactly one correct answer
- Smart distractors (plausible, reflect common mistakes)
- No answer hinted in stem
- Concise explanation (1-3 sentences)
- Return JSON array ONLY, no markdown

Context: ${examName} - ${countryName}`;

  const user = `Generate exactly ${count} questions at difficulty "${diffAr}" for "${examName}" (${countryName}).
Return JSON array with this schema per item:
{
  "question_text": string (Arabic),
  "options": { "A": string, "B": string, "C": string, "D": string },
  "correct_answer": "A" | "B" | "C" | "D",
  "explanation": string,
  "metadata": { "section": string, "difficulty": "${difficulty}", "topic": string }
}
⚠️ Return JSON array ONLY.`;

  return { system, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.user.id;

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminSupabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden: admin only" }, 403);

    const params = await req.json();
    const { country_id, exam_template_id, section_id, difficulty, count, content_language: explicitLang } = params;

    if (!country_id || !count || count < 1 || count > 50) {
      return jsonResponse({ error: "Invalid params: country_id and count (1-50) required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Build context
    const { data: countryData } = await adminSupabase.from("countries").select("name_ar").eq("id", country_id).single();
    const countryName = countryData?.name_ar || country_id;

    let examName = "اختبار عام";
    if (exam_template_id) {
      const { data: et } = await adminSupabase.from("exam_templates").select("name_ar").eq("id", exam_template_id).single();
      if (et) examName = et.name_ar;
    }

    // Determine content language: explicit param > auto-detect from exam/section name
    const contentLang: "en" | "ar" = explicitLang === "en" ? "en" : explicitLang === "ar" ? "ar" : detectContentLanguage(examName, section_id);

    const generatorModel = "google/gemini-2.5-flash";

    // ── Resolve allowed topics for the section ──
    let allowedTopics: string[] = [];
    let sectionName: string | null = null;

    if (section_id) {
      // 1. Try exam_profiles.profile_json
      if (exam_template_id) {
        const { data: profile } = await adminSupabase
          .from("exam_profiles")
          .select("profile_json")
          .eq("exam_template_id", exam_template_id)
          .eq("status", "approved")
          .single();

        if (profile?.profile_json?.official_spec?.sections) {
          const sec = profile.profile_json.official_spec.sections.find(
            (s: any) => s.section_id === section_id
          );
          if (sec) {
            allowedTopics = Array.isArray(sec.topics) ? sec.topics.filter((t: string) => t) : [];
            sectionName = sec.name || sec.section_id;
          }
        }
      }

      // 2. Fallback: exam_sections.topic_filter_json
      if (allowedTopics.length === 0) {
        const { data: dbSection } = await adminSupabase
          .from("exam_sections")
          .select("name_ar, topic_filter_json")
          .eq("id", section_id)
          .single();
        if (dbSection) {
          const raw = dbSection.topic_filter_json;
          allowedTopics = Array.isArray(raw) ? raw.filter((t: string) => typeof t === "string" && t) : [];
          sectionName = sectionName || dbSection.name_ar;
        }
      }

      // ── HARD BLOCK: section specified but no topics ──
      if (allowedTopics.length === 0) {
        return jsonResponse({
          error: `Section "${sectionName || section_id}" has no allowed_topics defined. Cannot generate without topic constraints.`,
          error_ar: `القسم "${sectionName || section_id}" ليس له مواضيع محددة. لا يمكن التوليد بدون قيود مواضيع.`,
        }, 400);
      }
    }

    // Build topic constraint for prompt
    let topicConstraint = "";
    if (allowedTopics.length > 0) {
      const topicList = allowedTopics.map((t, i) => `${i + 1}. ${t}`).join("\n");
      topicConstraint = contentLang === "en"
        ? `\n🚨 HARD TOPIC CONSTRAINT 🚨\nSection: ${sectionName}\nGenerate ONLY from these topics:\n${topicList}\nEvery question MUST include "topic_tag" matching one of the above.\n`
        : `\n🚨 قيد المواضيع الصارم 🚨\nالقسم: ${sectionName}\nولّد فقط من هذه المواضيع:\n${topicList}\nكل سؤال يجب أن يتضمن "topic_tag" يطابق أحد المواضيع أعلاه.\n`;
    }

    const { system: systemPrompt, user: userPrompt } = buildPrompts(examName, countryName, difficulty, count, contentLang);
    // Inject topic constraint into system prompt
    const finalSystemPrompt = systemPrompt + topicConstraint;
    const topicTagSchema = allowedTopics.length > 0
      ? `\nEach question JSON MUST also include: "topic_tag": string (one of: ${allowedTopics.map(t => `"${t}"`).join(", ")})`
      : "";
    const finalUserPrompt = userPrompt + topicTagSchema;

    console.log(`[generate-questions-draft] Generating ${count} questions, lang=${contentLang}, section=${sectionName || 'none'}, topics=${allowedTopics.length}, model=${generatorModel}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: generatorModel,
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: finalUserPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-questions-draft] AI error:", aiResponse.status, errText.substring(0, 500));
      return jsonResponse({
        error: aiResponse.status === 429 ? "Rate limited" : aiResponse.status === 402 ? "Insufficient credits" : "AI error",
        details: errText.substring(0, 500),
      }, aiResponse.status === 429 || aiResponse.status === 402 ? aiResponse.status : 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return jsonResponse({ error: "Failed to parse AI output", raw_excerpt: cleaned.substring(0, 500) }, 500);
    }

    let questions: any[];
    try {
      questions = JSON.parse(arrayMatch[0]);
    } catch {
      return jsonResponse({ error: "Invalid JSON from AI", raw_excerpt: arrayMatch[0].substring(0, 500) }, 500);
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return jsonResponse({ error: "No questions generated" }, 500);
    }

    const optionIds = ["a", "b", "c", "d"];
    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const draftQuestions = questions.map((q: any, i: number) => {
      const opts = q.options;
      const optionsArr = opts && typeof opts === "object" && !Array.isArray(opts)
        ? [opts.A, opts.B, opts.C, opts.D]
        : Array.isArray(opts) ? opts : [];

      const correctIdx = letterToIndex[q.correct_answer?.toUpperCase()] ?? 0;
      return {
        index: i,
        text_ar: q.question_text || "",
        options: optionsArr.map((text: string, idx: number) => ({ id: optionIds[idx], textAr: text || "" })),
        correct_option_id: optionIds[correctIdx],
        explanation: q.explanation || "",
        difficulty: q.metadata?.difficulty || difficulty,
        topic: q.topic_tag || q.metadata?.topic || q.metadata?.section || examName,
        topic_tag: q.topic_tag || q.metadata?.topic || "",
        section_id: section_id || null,
        content_language: contentLang,
      };
    });

    // ── Post-generation topic validation ──
    let topicViolationCount = 0;
    let finalQuestions = draftQuestions;
    if (allowedTopics.length > 0) {
      const normalizedTopics = new Set(allowedTopics.map(t => t.trim().toLowerCase()));
      const validQuestions = draftQuestions.filter((q: any) => {
        const tag = (q.topic_tag || "").trim().toLowerCase();
        if (!tag || !normalizedTopics.has(tag)) {
          topicViolationCount++;
          return false;
        }
        return true;
      });

      if (validQuestions.length === 0) {
        return jsonResponse({
          error: "All generated questions violated topic constraints",
          error_ar: "جميع الأسئلة المولدة خالفت قيود المواضيع",
          allowed_topics: allowedTopics,
          topic_violation_count: topicViolationCount,
        }, 422);
      }

      finalQuestions = validQuestions;
      if (topicViolationCount > 0) {
        console.log(`[generate-questions-draft] ⚠️ Filtered ${topicViolationCount} off-topic questions`);
      }
    }

    const { data: draft, error: insertError } = await adminSupabase
      .from("question_drafts")
      .insert({
        created_by: userId,
        country_id,
        exam_template_id: exam_template_id || null,
        section_id: section_id || null,
        difficulty,
        count: finalQuestions.length,
        generator_model: generatorModel,
        draft_questions_json: finalQuestions,
        status: "pending_review",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[generate-questions-draft] DB error:", insertError);
      return jsonResponse({ error: "Failed to save draft", details: insertError.message }, 500);
    }

    console.log("[generate-questions-draft] ✅ Created draft:", draft.id, "with", finalQuestions.length, "questions, lang:", contentLang, "topic_violations:", topicViolationCount);

    return jsonResponse({
      ok: true,
      draft_id: draft.id,
      question_count: finalQuestions.length,
      content_language: contentLang,
      topic_violation_count: topicViolationCount,
      allowed_topics: allowedTopics.length > 0 ? allowedTopics : undefined,
    });
  } catch (e) {
    console.error("[generate-questions-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
