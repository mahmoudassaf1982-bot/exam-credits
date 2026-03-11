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

// ─── Blueprint Compliance Guard (Semantic Level) ─────────────────────
interface ExamFamilyRules {
  examNamePatterns: RegExp[];
  forbiddenFamilies: { name: string; keywords: RegExp[] }[];
  requiredFamily: string;
}

const EXAM_FAMILY_RULES: ExamFamilyRules[] = [
  {
    examNamePatterns: [/رياضيات/i, /math/i, /الرياضيات/i],
    requiredFamily: "math",
    forbiddenFamilies: [
      { name: "verbal_analogy", keywords: [/تناظر\s*لفظي/i, /تناظر/i, /analogy/i, /يناظر/i] },
      { name: "vocabulary", keywords: [/مرادف/i, /مضاد/i, /synonym/i, /antonym/i, /معنى\s*الكلمة/i] },
      { name: "reading_comprehension", keywords: [/استيعاب\s*مقروء/i, /reading\s*comprehension/i, /فهم\s*المقروء/i, /اقرأ\s*النص/i] },
      { name: "grammar", keywords: [/إعراب/i, /نحو/i, /صرف/i, /بلاغة/i, /الفاعل/i, /المفعول\s*به/i] },
    ],
  },
  {
    examNamePatterns: [/إنجليزي/i, /english/i, /انجليزي/i],
    requiredFamily: "english",
    forbiddenFamilies: [
      { name: "math_calculation", keywords: [/احسب/i, /المعادلة/i, /calculate/i, /equation/i, /∫/i] },
    ],
  },
  {
    examNamePatterns: [/عربي/i, /arabic/i, /العربية/i],
    requiredFamily: "arabic",
    forbiddenFamilies: [
      { name: "math_calculation", keywords: [/احسب/i, /المعادلة/i, /calculate/i, /equation/i] },
    ],
  },
  {
    examNamePatterns: [/كيمياء/i, /chemistry/i],
    requiredFamily: "chemistry",
    forbiddenFamilies: [
      { name: "verbal_analogy", keywords: [/تناظر/i, /analogy/i, /يناظر/i] },
      { name: "grammar", keywords: [/إعراب/i, /نحو/i, /صرف/i] },
    ],
  },
];

interface BlueprintViolation {
  index: number;
  questionText: string;
  violatedFamily: string;
  matchedKeyword: string;
}

function detectExamFamilyRules(examName: string, sectionName: string | null): ExamFamilyRules | null {
  const combined = `${examName} ${sectionName || ""}`;
  for (const rule of EXAM_FAMILY_RULES) {
    if (rule.examNamePatterns.some(p => p.test(combined))) return rule;
  }
  return null;
}

function validateBlueprintCompliance(
  questions: any[],
  examName: string,
  sectionName: string | null
): { valid: any[]; violations: BlueprintViolation[] } {
  const rules = detectExamFamilyRules(examName, sectionName);
  if (!rules) return { valid: questions, violations: [] };
  const violations: BlueprintViolation[] = [];
  const valid = questions.filter((q, i) => {
    const textToCheck = [q.text_ar || q.stem || "", ...(q.options || []).map((o: any) => o.textAr || o.text || ""), q.explanation || "", q.topic_tag || q.topic || ""].join(" ");
    for (const family of rules.forbiddenFamilies) {
      for (const kw of family.keywords) {
        if (kw.test(textToCheck)) {
          violations.push({ index: i, questionText: (q.text_ar || "").substring(0, 80), violatedFamily: family.name, matchedKeyword: kw.source });
          return false;
        }
      }
    }
    return true;
  });
  return { valid, violations };
}

function buildBlueprintPromptConstraint(examName: string, sectionName: string | null): string {
  const rules = detectExamFamilyRules(examName, sectionName);
  if (!rules) return "";
  return `\n🚨 BLUEPRINT COMPLIANCE — MANDATORY 🚨\nThis is a ${rules.requiredFamily.toUpperCase()} exam section.\nFORBIDDEN question families:\n${rules.forbiddenFamilies.map(f => `- ${f.name}: DO NOT generate`).join("\n")}\nEvery question MUST be a pure ${rules.requiredFamily} question.\n`;
}

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
  "section_id": string,
  "topic_tag": string,
  "stem": string (ENGLISH ONLY),
  "options": [{"id":"A","text":string},{"id":"B","text":string},{"id":"C","text":string},{"id":"D","text":string}],
  "correct_option_id": "A" | "B" | "C" | "D",
  "explanation": string (ENGLISH ONLY),
  "difficulty": "${difficulty}"
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
  "section_id": string,
  "topic_tag": string,
  "stem": string (Arabic),
  "options": [{"id":"A","text":string},{"id":"B","text":string},{"id":"C","text":string},{"id":"D","text":string}],
  "correct_option_id": "A" | "B" | "C" | "D",
  "explanation": string,
  "difficulty": "${difficulty}"
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
      const topicsJson = JSON.stringify(allowedTopics);
      topicConstraint = contentLang === "en"
        ? `\nYou are generating exam questions for a specific section.\nSECTION_ID: ${section_id}\nALLOWED_TOPICS: ${topicsJson}\n\nSTRICT RULES (MANDATORY):\n1) You MUST generate questions ONLY from ALLOWED_TOPICS.\n2) You MUST NOT generate content outside these topics.\n3) If a question would belong to another topic, DO NOT generate it.\n4) Each question MUST include:\n   - "section_id": "${section_id}" (must match SECTION_ID)\n   - "topic_tag": (must be exactly one of ALLOWED_TOPICS)\n\nIf you cannot comply, return:\n{ "error": "topic_violation" }\n`
        : `\nأنت تولّد أسئلة اختبار لقسم محدد.\nSECTION_ID: ${section_id}\nALLOWED_TOPICS: ${topicsJson}\n\nقواعد صارمة (إلزامية):\n1) يجب توليد أسئلة فقط من ALLOWED_TOPICS.\n2) يُمنع توليد محتوى خارج هذه المواضيع.\n3) إذا كان السؤال ينتمي لموضوع آخر، لا تولّده.\n4) كل سؤال يجب أن يتضمن:\n   - "section_id": "${section_id}" (يطابق SECTION_ID)\n   - "topic_tag": (يطابق أحد ALLOWED_TOPICS تماماً)\n\nإذا لم تستطع الالتزام، أرجع:\n{ "error": "topic_violation" }\n`;
    }

    const { system: systemPrompt, user: userPrompt } = buildPrompts(examName, countryName, difficulty, count, contentLang);
    // Inject topic constraint + blueprint constraint into system prompt
    const blueprintConstraint = buildBlueprintPromptConstraint(examName, sectionName);
    const finalSystemPrompt = systemPrompt + topicConstraint + blueprintConstraint;
    const topicTagSchema = allowedTopics.length > 0
      ? `\nEach question JSON MUST also include: "topic_tag": string (one of: ${allowedTopics.map(t => `"${t}"`).join(", ")})`
      : "";
    const finalUserPrompt = userPrompt + topicTagSchema;

    console.log(`[generate-questions-draft] Generating ${count} questions, lang=${contentLang}, section=${sectionName || 'none'}, topics=${allowedTopics.length}, model=${generatorModel}`);

    // ── 3-step retry: generate → validate topics → retry up to 2x ──
    const MAX_TOPIC_RETRIES = 2;
    let retryAttempt = 0;
    let finalQuestions: any[] = [];
    let totalTopicViolations = 0;
    let lastViolationDetails: { index: number; givenTag: string }[] = [];

    while (retryAttempt <= MAX_TOPIC_RETRIES) {
      // Step 1: Generate
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

      // Check for AI-reported topic_violation
      if (cleaned.includes('"topic_violation"')) {
        console.log(`[generate-questions-draft] ⚠️ AI reported topic_violation — retry ${retryAttempt + 1}/${MAX_TOPIC_RETRIES}`);
        totalTopicViolations++;
        retryAttempt++;
        if (retryAttempt <= MAX_TOPIC_RETRIES) continue;
        break;
      }

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

      // Parse questions
      const draftQuestions = questions.map((q: any, i: number) => {
        let optionsArr: { id: string; textAr: string }[];
        if (Array.isArray(q.options)) {
          optionsArr = q.options.map((o: any) => ({
            id: (o.id || "").toLowerCase(),
            textAr: o.text || o.textAr || "",
          }));
        } else if (q.options && typeof q.options === "object") {
          optionsArr = ["A", "B", "C", "D"].map(l => ({
            id: l.toLowerCase(),
            textAr: q.options[l] || "",
          }));
        } else {
          optionsArr = [];
        }

        const rawCorrect = (q.correct_option_id || q.correct_answer || "A").toUpperCase();
        const correctId = rawCorrect.toLowerCase();

        return {
          index: i,
          text_ar: q.stem || q.question_text || "",
          options: optionsArr,
          correct_option_id: correctId,
          explanation: q.explanation || "",
          difficulty: q.difficulty || difficulty,
          topic: q.topic_tag || q.topic || examName,
          topic_tag: q.topic_tag || "",
          section_id: q.section_id || section_id || null,
          content_language: contentLang,
        };
      });

      // Step 2: Validate topic_tags
      if (allowedTopics.length > 0) {
        const normalizedTopics = new Set(allowedTopics.map(t => t.trim().toLowerCase()));
        const violations: { index: number; givenTag: string }[] = [];
        const validQuestions = draftQuestions.filter((q: any, i: number) => {
          const tag = (q.topic_tag || "").trim().toLowerCase();
          if (!tag || !normalizedTopics.has(tag)) {
            violations.push({ index: i, givenTag: q.topic_tag || "(empty)" });
            return false;
          }
          return true;
        });

        totalTopicViolations += violations.length;
        lastViolationDetails = violations;

        if (violations.length > 0) {
          console.log(`[generate-questions-draft] ⚠️ Topic violations: ${violations.length}/${draftQuestions.length} — attempt ${retryAttempt + 1}/${MAX_TOPIC_RETRIES + 1}`,
            JSON.stringify(violations.slice(0, 5)));
        }

        // If all invalid and retries remain → retry
        if (validQuestions.length === 0 && retryAttempt < MAX_TOPIC_RETRIES) {
          retryAttempt++;
          continue;
        }

        // Partial success or final attempt
        finalQuestions = validQuestions;
      } else {
        finalQuestions = draftQuestions;
      }

      break; // success or partial — exit retry loop
    }

    // ── BLUEPRINT COMPLIANCE GUARD (Semantic Level) ──
    // Catches questions belonging to forbidden families even if topic_tag is correct
    const { valid: blueprintValid, violations: blueprintViolations } = validateBlueprintCompliance(finalQuestions, examName, sectionName);
    if (blueprintViolations.length > 0) {
      console.warn(`[generate-questions-draft] 🚫 BLUEPRINT violations: ${blueprintViolations.length} questions rejected`,
        JSON.stringify(blueprintViolations.slice(0, 5)));
      finalQuestions = blueprintValid;
    }

    // Step 3: If still no valid questions after all retries → needs_review
    if (finalQuestions.length === 0 && allowedTopics.length > 0) {
      const mismatchLog = `Topic enforcement FAILED after ${retryAttempt} retries. ${totalTopicViolations} total violations. Allowed: [${allowedTopics.join(", ")}]. Sample: ${JSON.stringify(lastViolationDetails.slice(0, 5))}`;
      console.error(`[generate-questions-draft] ❌ ${mismatchLog}`);
      return jsonResponse({
        error: "All generated questions violated topic constraints after retries",
        error_ar: "جميع الأسئلة المولدة خالفت قيود المواضيع بعد المحاولات",
        status: "needs_review",
        allowed_topics: allowedTopics,
        topic_violation_count: totalTopicViolations,
        topic_violation_details: lastViolationDetails.slice(0, 10),
        retries_exhausted: retryAttempt,
      }, 422);
    }

    if (totalTopicViolations > 0) {
      console.log(`[generate-questions-draft] ⚠️ Final: ${finalQuestions.length} valid questions, ${totalTopicViolations} total violations filtered across ${retryAttempt + 1} attempts`);
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

    console.log("[generate-questions-draft] ✅ Created draft:", draft.id, "with", finalQuestions.length, "questions, lang:", contentLang, "topic_violations:", totalTopicViolations);

    return jsonResponse({
      ok: true,
      draft_id: draft.id,
      question_count: finalQuestions.length,
      content_language: contentLang,
      topic_violation_count: totalTopicViolations,
      retries_used: retryAttempt,
      allowed_topics: allowedTopics.length > 0 ? allowedTopics : undefined,
    });
  } catch (e) {
    console.error("[generate-questions-draft] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
