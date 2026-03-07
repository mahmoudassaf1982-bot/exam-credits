import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface SourceEvidence {
  url: string;
  title: string;
  snippet: string;
  relevance_score: number;
}

interface FieldConfidence {
  value: number | null;
  confidence: number;
  source_snippet?: string;
}

interface SectionConfidence {
  name: { value: string; confidence: number };
  question_count: { value: number | null; confidence: number };
}

interface ParsedResult {
  total_questions: FieldConfidence;
  total_time_minutes: FieldConfidence;
  sections: SectionConfidence[];
  parsing_status: "complete" | "incomplete_structure" | "inconsistent_data";
  inconsistency_notes: string[];
  sources: { name: string; url: string; description: string; evidence_snippet: string }[];
  raw_topics_by_section?: Record<string, string[]>;
  difficulty_mix_by_section?: Record<string, { easy: number; medium: number; hard: number }>;
}

async function searchTavily(query: string, apiKey: string): Promise<TavilyResult[]> {
  console.log(`[tavily] Searching: "${query}"`);
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[tavily] Error ${res.status}: ${errText}`);
    if (res.status === 401 || res.status === 403) throw new Error("مفتاح Tavily غير صالح");
    if (res.status === 429) throw new Error("تم تجاوز حد طلبات Tavily، حاول لاحقاً");
    throw new Error(`Tavily error: ${res.status}`);
  }
  const data = await res.json();
  return (data.results || []) as TavilyResult[];
}

function detectTruncation(text: string): boolean {
  const trimmed = text.trim();
  // Check raw JSON
  if (trimmed.endsWith("}") || trimmed.endsWith("]")) {
    try { JSON.parse(trimmed); return false; } catch { /* continue */ }
  }
  // Check if it contains a code block with valid JSON
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { JSON.parse(codeBlockMatch[1].trim()); return false; } catch { /* continue */ }
  }
  // If no valid JSON found at all, it's likely truncated or malformed
  return !trimmed.includes('"parsing_status"');
}

function extractJsonFromResponse(raw: string): any {
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  return JSON.parse(jsonStr);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { examTemplateId, action, sections: submittedSections } = await req.json();
    if (!examTemplateId) throw new Error("examTemplateId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    let performedBy: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      performedBy = user?.id || null;
    }

    // ─── ACTION: save — apply reviewed sections ───
    if (action === "save") {
      if (!submittedSections || !Array.isArray(submittedSections) || submittedSections.length === 0) {
        throw new Error("يجب تقديم أقسام للحفظ");
      }

      await supabase.from("exam_sections").delete().eq("exam_template_id", examTemplateId);

      const sectionsToInsert = submittedSections.map((s: any, i: number) => ({
        exam_template_id: examTemplateId,
        name_ar: s.name_ar,
        question_count: s.question_count || 20,
        time_limit_sec: s.time_limit_sec || null,
        order: i + 1,
        difficulty_mix_json: s.difficulty_mix_json || { easy: 30, medium: 50, hard: 20 },
        topic_filter_json: s.topic_filter_json || [],
      }));

      const { error: insertErr } = await supabase.from("exam_sections").insert(sectionsToInsert);
      if (insertErr) throw new Error("فشل في حفظ الأقسام: " + insertErr.message);

      const totalQuestions = submittedSections.reduce((s: number, sec: any) => s + (sec.question_count || 0), 0);
      const totalTimeSec = submittedSections.reduce((s: number, sec: any) => s + (sec.time_limit_sec || 0), 0);
      await supabase.from("exam_templates").update({
        default_question_count: totalQuestions,
        default_time_limit_sec: totalTimeSec,
      }).eq("id", examTemplateId);

      await supabase.from("exam_standards").delete().eq("exam_template_id", examTemplateId);
      const standardsToInsert = submittedSections.map((s: any) => ({
        exam_template_id: examTemplateId,
        section_name: s.name_ar,
        question_count: s.question_count || 20,
        time_limit_minutes: s.time_limit_sec ? Math.round(s.time_limit_sec / 60) : null,
        difficulty_distribution: s.difficulty_mix_json || { easy: 30, medium: 50, hard: 20 },
        topics: s.topic_filter_json || [],
      }));
      await supabase.from("exam_standards").insert(standardsToInsert);

      await supabase.from("sync_audit_log").insert({
        exam_template_id: examTemplateId,
        action: "ai_sync_save",
        details: { sections_count: submittedSections.length, total_questions: totalQuestions, total_time_sec: totalTimeSec },
        performed_by: performedBy,
      });

      return new Response(
        JSON.stringify({ success: true, message: "تم حفظ الأقسام بنجاح" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: fetch (default) — Tavily research + two-stage AI parsing ───
    const { data: exam, error: examErr } = await supabase
      .from("exam_templates")
      .select("*, countries:country_id(name_ar, name)")
      .eq("id", examTemplateId)
      .single();

    if (examErr || !exam) throw new Error("Exam template not found");

    const countryName = (exam as any).countries?.name_ar || "غير معروف";
    const countryNameEn = (exam as any).countries?.name || "";
    const examName = exam.name_ar;

    const { data: currentSections } = await supabase
      .from("exam_sections")
      .select("*")
      .eq("exam_template_id", examTemplateId)
      .order("order");

    const storedStandards = {
      total_questions: exam.default_question_count,
      total_time_sec: exam.default_time_limit_sec,
      sections: (currentSections || []).map((s: any) => ({
        name_ar: s.name_ar,
        question_count: s.question_count,
        time_limit_sec: s.time_limit_sec,
      })),
    };

    console.log(`[ai-sync-exam] Researching: ${examName} (${countryName})`);

    // ─── Step 1: Tavily web search ───
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    let tavilyResults: TavilyResult[] = [];
    let tavilyUsed = false;

    if (TAVILY_API_KEY) {
      try {
        const queries = [
          `${examName} ${countryNameEn || countryName} exam structure sections total questions duration official`,
          `${examName} ${countryNameEn || countryName} official exam format number of questions time limit`,
          `${examName} ${countryNameEn || countryName} عدد الأسئلة مدة الاختبار أقسام رسمي`,
        ];

        const allResults: TavilyResult[] = [];
        for (const q of queries) {
          const results = await searchTavily(q, TAVILY_API_KEY);
          allResults.push(...results);
        }

        const seen = new Set<string>();
        tavilyResults = allResults.filter(r => {
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        });

        tavilyUsed = tavilyResults.length > 0;
        console.log(`[ai-sync-exam] Tavily returned ${tavilyResults.length} unique results`);
      } catch (err) {
        console.error("[ai-sync-exam] Tavily search failed, falling back to AI-only:", err);
      }
    } else {
      console.warn("[ai-sync-exam] TAVILY_API_KEY not set, using AI-only mode");
    }

    // ─── Step 2 — STAGE A: Structured fact extraction with confidence ───
    const tavilyContext = tavilyUsed
      ? tavilyResults.map((r, i) => `--- Source ${i + 1} ---\nTitle: ${r.title}\nURL: ${r.url}\nContent:\n${r.content}\n`).join("\n")
      : "";

    const stageAPrompt = `You are an expert exam structure analyst. Your ONLY job is to extract EXPLICIT NUMERIC FACTS from the provided source texts about the exam "${examName}" in ${countryName}${countryNameEn ? ` (${countryNameEn})` : ""}.

${tavilyUsed ? `Here are real web search results. Extract facts ONLY from these sources. Do NOT invent any information.\n\n${tavilyContext}` : "Use your internal knowledge. Mark all confidence scores as 0.5 or lower since this is not from verified sources."}

CRITICAL RULES:
1. Look for EXPLICIT numbers mentioned in the text: "85 questions", "60 minutes", "4 sections", etc.
2. If a number is explicitly stated in an official source, confidence = 0.9-1.0
3. If inferred or estimated, confidence = 0.3-0.6
4. If NOT found at all, use null for value and confidence = 0.0
5. For sections: only list sections that are EXPLICITLY named in the sources
6. If sections are not explicitly detailed but total questions IS stated, set sections confidence low and note the gap
7. NEVER invent section names or counts that aren't in the sources
8. If total_questions is 85 from the source, do NOT return 20 — return 85

Return ONLY this JSON (no extra text):
{
  "total_questions": { "value": <number|null>, "confidence": <0.0-1.0>, "source_snippet": "<exact text from source>" },
  "total_time_minutes": { "value": <number|null>, "confidence": <0.0-1.0>, "source_snippet": "<exact text from source>" },
  "sections": [
    {
      "name": { "value": "<section name>", "confidence": <0.0-1.0> },
      "question_count": { "value": <number|null>, "confidence": <0.0-1.0> }
    }
  ],
  "parsing_status": "complete" | "incomplete_structure" | "inconsistent_data",
  "inconsistency_notes": ["<any issues found>"],
  "sources": [
    { "name": "<source title>", "url": "<url>", "description": "<brief>", "evidence_snippet": "<key quote>" }
  ],
  "raw_topics_by_section": { "<section_name>": ["topic1", "topic2"] },
  "difficulty_mix_by_section": { "<section_name>": { "easy": 30, "medium": 50, "hard": 20 } }
}`;

    console.log("[ai-sync-exam] Stage A: Fact extraction...");
    const stageAResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract structured facts from text. Return ONLY valid JSON. Prioritize explicit numeric facts. Never invent data." },
          { role: "user", content: stageAPrompt },
        ],
      }),
    });

    if (!stageAResponse.ok) {
      const errText = await stageAResponse.text();
      console.error("[ai-sync-exam] Stage A AI error:", stageAResponse.status, errText);
      if (stageAResponse.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول لاحقاً");
      if (stageAResponse.status === 402) throw new Error("يرجى إضافة رصيد للذكاء الاصطناعي");
      throw new Error(`AI gateway error: ${stageAResponse.status}`);
    }

    const stageAData = await stageAResponse.json();
    const rawContent = stageAData.choices?.[0]?.message?.content || "";

    if (detectTruncation(rawContent)) {
      console.error("[ai-sync-exam] Truncated AI response detected");
      throw new Error("استجابة الذكاء الاصطناعي مبتورة، حاول مرة أخرى");
    }

    let parsed: ParsedResult;
    try {
      parsed = extractJsonFromResponse(rawContent) as ParsedResult;
    } catch {
      console.error("[ai-sync-exam] JSON parse error:", rawContent.substring(0, 500));
      throw new Error("فشل في تحليل استجابة الذكاء الاصطناعي");
    }

    console.log("[ai-sync-exam] Stage A result:", JSON.stringify({
      total_questions: parsed.total_questions,
      total_time_minutes: parsed.total_time_minutes,
      sections_count: parsed.sections?.length,
      parsing_status: parsed.parsing_status,
    }));

    // ─── Step 3 — STAGE B: Validate & build structured proposals ───
    const totalQ = parsed.total_questions?.value;
    const totalT = parsed.total_time_minutes?.value;
    const sections = parsed.sections || [];
    const inconsistencyNotes = parsed.inconsistency_notes || [];

    // Check: do section counts sum to total?
    const sectionSum = sections.reduce((sum, s) => sum + (s.question_count?.value || 0), 0);
    let parsingStatus = parsed.parsing_status || "complete";

    if (totalQ && sectionSum > 0 && Math.abs(sectionSum - totalQ) > 2) {
      parsingStatus = "inconsistent_data";
      inconsistencyNotes.push(
        `مجموع أسئلة الأقسام (${sectionSum}) لا يتطابق مع العدد الكلي (${totalQ})`
      );
    }

    // If sections are empty or have very low confidence but total is known
    const sectionsLowConfidence = sections.length === 0 ||
      sections.every(s => (s.question_count?.confidence || 0) < 0.5);

    if (totalQ && totalQ > 0 && sectionsLowConfidence && sections.length <= 1) {
      parsingStatus = parsingStatus === "complete" ? "incomplete_structure" : parsingStatus;
      inconsistencyNotes.push(
        `العدد الكلي للأسئلة معروف (${totalQ}) لكن تفاصيل الأقسام غير متوفرة بدقة — يرجى مراجعة الأقسام يدوياً`
      );
    }

    // Build proposals from extracted facts
    const proposals = sections.length > 0
      ? sections.map((s, i) => {
          const sectionName = s.name?.value || `قسم ${i + 1}`;
          const topics = parsed.raw_topics_by_section?.[sectionName] || [];
          const diffMix = parsed.difficulty_mix_by_section?.[sectionName] || { easy: 30, medium: 50, hard: 20 };
          // If section count is null/0 but total is known and we have N sections, distribute evenly
          let qCount = s.question_count?.value;
          if ((!qCount || qCount <= 0) && totalQ && sections.length > 0) {
            qCount = Math.round(totalQ / sections.length);
          }
          return {
            name_ar: sectionName,
            question_count: qCount || 20,
            time_limit_sec: totalT && sections.length > 0 ? Math.round((totalT * 60) / sections.length) : null,
            order: i + 1,
            difficulty_mix_json: diffMix,
            topic_filter_json: topics,
          };
        })
      : totalQ
        ? [{
            name_ar: examName,
            question_count: totalQ,
            time_limit_sec: totalT ? totalT * 60 : null,
            order: 1,
            difficulty_mix_json: { easy: 30, medium: 50, hard: 20 },
            topic_filter_json: [],
          }]
        : [];

    if (proposals.length === 0) {
      throw new Error("لم يتم العثور على معلومات كافية عن هيكل الاختبار");
    }

    // ─── Save trusted sources ───
    const sourcesWithEvidence: SourceEvidence[] = [];
    if (parsed.sources && Array.isArray(parsed.sources)) {
      for (const src of parsed.sources) {
        const evidence: SourceEvidence = {
          url: src.url || "",
          title: src.name || "",
          snippet: src.evidence_snippet || src.description || "",
          relevance_score: 0,
        };
        if (tavilyUsed) {
          const match = tavilyResults.find(t => t.url === src.url);
          if (match) evidence.relevance_score = match.score;
        }
        sourcesWithEvidence.push(evidence);

        await supabase
          .from("trusted_sources")
          .upsert({
            exam_template_id: examTemplateId,
            source_name: src.name,
            source_url: src.url || null,
            description: src.description || null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: "exam_template_id,source_name", ignoreDuplicates: false });
      }
    }

    // ─── Audit log ───
    await supabase.from("sync_audit_log").insert({
      exam_template_id: examTemplateId,
      action: "ai_sync_research",
      details: {
        tavily_used: tavilyUsed,
        tavily_results_count: tavilyResults.length,
        proposals_count: proposals.length,
        suggested_total_questions: totalQ,
        suggested_total_time_minutes: totalT,
        parsing_status: parsingStatus,
        inconsistency_notes: inconsistencyNotes,
      },
      performed_by: performedBy,
    });

    return new Response(
      JSON.stringify({
        success: true,
        proposals,
        totalQuestions: totalQ,
        totalTimeMinutes: totalT,
        tavilyUsed,
        sources: sourcesWithEvidence,
        storedStandards,
        confidence: {
          total_questions: parsed.total_questions?.confidence ?? 0,
          total_time: parsed.total_time_minutes?.confidence ?? 0,
          sections: parsed.sections?.map(s => ({
            name: s.name?.value,
            name_confidence: s.name?.confidence ?? 0,
            count_confidence: s.question_count?.confidence ?? 0,
          })) || [],
        },
        parsingStatus,
        inconsistencyNotes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[ai-sync-exam] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "حدث خطأ أثناء تحديث المعايير" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
