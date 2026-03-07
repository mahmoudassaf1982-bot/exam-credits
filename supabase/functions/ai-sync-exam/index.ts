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

      // Delete all old sections
      await supabase.from("exam_sections").delete().eq("exam_template_id", examTemplateId);

      // Insert new sections
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

      // Update template totals
      const totalQuestions = submittedSections.reduce((s: number, sec: any) => s + (sec.question_count || 0), 0);
      const totalTimeSec = submittedSections.reduce((s: number, sec: any) => s + (sec.time_limit_sec || 0), 0);
      await supabase.from("exam_templates").update({
        default_question_count: totalQuestions,
        default_time_limit_sec: totalTimeSec,
      }).eq("id", examTemplateId);

      // Delete old standards and insert new ones
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

      // Audit log
      await supabase.from("sync_audit_log").insert({
        exam_template_id: examTemplateId,
        action: "ai_sync_save",
        details: {
          sections_count: submittedSections.length,
          total_questions: totalQuestions,
          total_time_sec: totalTimeSec,
        },
        performed_by: performedBy,
      });

      return new Response(
        JSON.stringify({ success: true, message: "تم حفظ الأقسام بنجاح" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: fetch (default) — Tavily research + AI parsing ───
    const { data: exam, error: examErr } = await supabase
      .from("exam_templates")
      .select("*, countries:country_id(name_ar, name)")
      .eq("id", examTemplateId)
      .single();

    if (examErr || !exam) throw new Error("Exam template not found");

    const countryName = (exam as any).countries?.name_ar || "غير معروف";
    const countryNameEn = (exam as any).countries?.name || "";
    const examName = exam.name_ar;

    // Fetch current stored standards for conflict detection
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
        // Build multiple targeted search queries
        const queries = [
          `${examName} ${countryNameEn || countryName} exam structure sections total questions duration official`,
          `${examName} ${countryNameEn || countryName} official exam format number of questions time limit`,
        ];

        const allResults: TavilyResult[] = [];
        for (const q of queries) {
          const results = await searchTavily(q, TAVILY_API_KEY);
          allResults.push(...results);
        }

        // Deduplicate by URL
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

    // ─── Step 2: AI structured parsing ───
    const tavilyContext = tavilyUsed
      ? `\n\nفيما يلي نتائج بحث حقيقية من الإنترنت عن هذا الاختبار. استخدمها كمصدر رئيسي للمعلومات:\n\n${tavilyResults.map((r, i) => `--- مصدر ${i + 1} ---\nالعنوان: ${r.title}\nالرابط: ${r.url}\nالمحتوى:\n${r.content}\n`).join("\n")}`
      : "";

    const prompt = `أنت خبير في أنظمة الاختبارات الأكاديمية في الدول العربية.

أحتاج منك معلومات دقيقة ومحدثة عن هيكل اختبار "${examName}" في ${countryName}${countryNameEn ? ` (${countryNameEn})` : ""}.
${tavilyContext}

${tavilyUsed ? "استند فقط إلى المصادر المقدمة أعلاه. لا تخترع معلومات من عندك." : "استخدم معرفتك الداخلية لتقديم أفضل تقدير."}

أريد المعلومات التالية:
1. الأقسام الرسمية للاختبار
2. عدد الأسئلة لكل قسم
3. الوقت المخصص لكل قسم بالدقائق
4. توزيع الصعوبة المقترح لكل قسم (سهل، متوسط، صعب) كنسب مئوية
5. المواضيع الرئيسية لكل قسم
6. المصادر الرسمية (${tavilyUsed ? "من المصادر المقدمة فقط — اذكر الرابط والعنوان ومقتطف قصير كدليل" : "من معرفتك"})

أرجع النتيجة كـ JSON:
{
  "total_questions": 100,
  "total_time_minutes": 120,
  "sources": [
    { "name": "اسم المصدر", "url": "رابط", "description": "وصف", "evidence_snippet": "مقتطف نصي قصير يثبت المعلومة" }
  ],
  "sections": [
    {
      "name_ar": "اسم القسم",
      "question_count": 25,
      "time_limit_minutes": 30,
      "difficulty_mix": { "easy": 30, "medium": 50, "hard": 20 },
      "topics": ["موضوع1", "موضوع2"]
    }
  ]
}

أرجع JSON فقط بدون أي نص إضافي.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "أنت مساعد متخصص في أنظمة التعليم والاختبارات الأكاديمية. أرجع JSON فقط." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[ai-sync-exam] AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول لاحقاً");
      if (aiResponse.status === 402) throw new Error("يرجى إضافة رصيد للذكاء الاصطناعي");
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let result: any;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error("[ai-sync-exam] JSON parse error:", jsonStr.substring(0, 500));
      throw new Error("فشل في تحليل استجابة الذكاء الاصطناعي");
    }

    if (!result.sections || !Array.isArray(result.sections) || result.sections.length === 0) {
      throw new Error("لم يتم العثور على أقسام للاختبار");
    }

    // ─── Save trusted sources with evidence ───
    const sourcesWithEvidence: SourceEvidence[] = [];
    if (result.sources && Array.isArray(result.sources)) {
      for (const src of result.sources) {
        const evidence: SourceEvidence = {
          url: src.url || "",
          title: src.name || "",
          snippet: src.evidence_snippet || src.description || "",
          relevance_score: 0,
        };
        // Match with Tavily scores
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

    // ─── Build proposals ───
    const proposals = result.sections.map((s: any, i: number) => ({
      name_ar: s.name_ar,
      question_count: s.question_count || 20,
      time_limit_sec: s.time_limit_minutes ? s.time_limit_minutes * 60 : null,
      order: i + 1,
      difficulty_mix_json: s.difficulty_mix || { easy: 30, medium: 50, hard: 20 },
      topic_filter_json: s.topics || [],
    }));

    // ─── Audit log for research ───
    await supabase.from("sync_audit_log").insert({
      exam_template_id: examTemplateId,
      action: "ai_sync_research",
      details: {
        tavily_used: tavilyUsed,
        tavily_results_count: tavilyResults.length,
        proposals_count: proposals.length,
        suggested_total_questions: result.total_questions,
        suggested_total_time_minutes: result.total_time_minutes,
      },
      performed_by: performedBy,
    });

    return new Response(
      JSON.stringify({
        success: true,
        proposals,
        totalQuestions: result.total_questions,
        totalTimeMinutes: result.total_time_minutes,
        tavilyUsed,
        sources: sourcesWithEvidence,
        storedStandards,
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
