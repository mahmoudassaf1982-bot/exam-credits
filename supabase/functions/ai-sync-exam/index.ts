import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { examTemplateId } = await req.json();
    if (!examTemplateId) throw new Error("examTemplateId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get auth user for audit log
    const authHeader = req.headers.get("Authorization");
    let performedBy: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      performedBy = user?.id || null;
    }

    // Fetch exam template + country
    const { data: exam, error: examErr } = await supabase
      .from("exam_templates")
      .select("*, countries:country_id(name_ar, name)")
      .eq("id", examTemplateId)
      .single();

    if (examErr || !exam) throw new Error("Exam template not found");

    const countryName = (exam as any).countries?.name_ar || "غير معروف";
    const countryNameEn = (exam as any).countries?.name || "";
    const examName = exam.name_ar;

    console.log(`[ai-sync-exam] Syncing: ${examName} (${countryName})`);

    // Ask AI to research the official exam structure
    const prompt = `أنت خبير في أنظمة الاختبارات الأكاديمية في الدول العربية.

أحتاج منك معلومات دقيقة ومحدثة عن هيكل اختبار "${examName}" في ${countryName}${countryNameEn ? ` (${countryNameEn})` : ""}.

أريد المعلومات التالية:
1. الأقسام الرسمية للاختبار (مثل: رياضيات، لغة عربية، إنجليزي، كيمياء، فيزياء، إلخ)
2. عدد الأسئلة لكل قسم (إن وُجد)
3. الوقت المخصص لكل قسم بالدقائق (إن وُجد)
4. الوزن النسبي لكل قسم (نسبة مئوية تقريبية)
5. إجمالي عدد الأسئلة في الاختبار كاملاً
6. إجمالي وقت الاختبار بالدقائق
7. توزيع الصعوبة المقترح لكل قسم (سهل، متوسط، صعب) كنسب مئوية
8. المصادر الرسمية التي اعتمدت عليها (اسم المصدر ورابطه إن وُجد)

أرجع النتيجة كـ JSON بالشكل التالي:
{
  "total_questions": 100,
  "total_time_minutes": 120,
  "sources": [
    { "name": "اسم المصدر", "url": "رابط المصدر", "description": "وصف قصير" }
  ],
  "sections": [
    {
      "name_ar": "اسم القسم بالعربية",
      "question_count": 25,
      "time_limit_minutes": 30,
      "weight_percent": 25,
      "difficulty_mix": { "easy": 30, "medium": 50, "hard": 20 },
      "topics": ["موضوع1", "موضوع2"]
    }
  ]
}

أرجع JSON فقط بدون أي نص إضافي. إذا لم تجد معلومات دقيقة، استخدم أفضل تقدير بناءً على معرفتك بالاختبارات المشابهة.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "أنت مساعد متخصص في أنظمة التعليم والاختبارات الأكاديمية في الدول العربية. أرجع JSON فقط." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[ai-sync-exam] AI error:", aiResponse.status, errText);
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

    // Update exam template totals
    const updateData: any = {};
    if (result.total_questions) updateData.default_question_count = result.total_questions;
    if (result.total_time_minutes) updateData.default_time_limit_sec = result.total_time_minutes * 60;

    if (Object.keys(updateData).length > 0) {
      await supabase.from("exam_templates").update(updateData).eq("id", examTemplateId);
    }

    // Save trusted sources
    const savedSources: any[] = [];
    if (result.sources && Array.isArray(result.sources)) {
      for (const src of result.sources) {
        const { data: srcData } = await supabase
          .from("trusted_sources")
          .upsert({
            exam_template_id: examTemplateId,
            source_name: src.name,
            source_url: src.url || null,
            description: src.description || null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: "exam_template_id,source_name", ignoreDuplicates: false })
          .select()
          .single();
        if (srcData) savedSources.push(srcData);
      }
    }

    // Save exam_standards (replace existing for this exam)
    await supabase.from("exam_standards").delete().eq("exam_template_id", examTemplateId);
    const standardsToInsert = result.sections.map((s: any) => ({
      exam_template_id: examTemplateId,
      section_name: s.name_ar,
      question_count: s.question_count || 20,
      time_limit_minutes: s.time_limit_minutes || null,
      difficulty_distribution: s.difficulty_mix || { easy: 30, medium: 50, hard: 20 },
      topics: s.topics || [],
      source_id: savedSources[0]?.id || null,
    }));
    await supabase.from("exam_standards").insert(standardsToInsert);

    // Fetch existing sections to avoid duplicates
    const { data: existingSections } = await supabase
      .from("exam_sections")
      .select("id, name_ar")
      .eq("exam_template_id", examTemplateId);

    const existingNames = new Set((existingSections || []).map((s: any) => s.name_ar));

    // Insert new sections only
    const newSections = result.sections
      .filter((s: any) => !existingNames.has(s.name_ar))
      .map((s: any, i: number) => ({
        exam_template_id: examTemplateId,
        name_ar: s.name_ar,
        question_count: s.question_count || 20,
        time_limit_sec: s.time_limit_minutes ? s.time_limit_minutes * 60 : null,
        order: (existingSections?.length || 0) + i + 1,
        difficulty_mix_json: s.difficulty_mix || { easy: 30, medium: 50, hard: 20 },
        topic_filter_json: s.topics || [],
      }));

    let insertedCount = 0;
    if (newSections.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("exam_sections")
        .insert(newSections)
        .select();
      if (insertErr) {
        console.error("[ai-sync-exam] Insert sections error:", insertErr);
        throw new Error("فشل في حفظ الأقسام: " + insertErr.message);
      }
      insertedCount = inserted?.length || 0;
    }

    // Write audit log
    await supabase.from("sync_audit_log").insert({
      exam_template_id: examTemplateId,
      action: "ai_sync",
      details: {
        total_questions: result.total_questions,
        total_time_minutes: result.total_time_minutes,
        sections_count: result.sections.length,
        new_sections_added: insertedCount,
        sources_count: savedSources.length,
      },
      performed_by: performedBy,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `تم تحديث معايير "${examName}" بنجاح`,
        newSectionsAdded: insertedCount,
        existingSectionsKept: existingSections?.length || 0,
        totalQuestions: result.total_questions,
        totalTimeMinutes: result.total_time_minutes,
        sections: result.sections,
        sourcesCount: savedSources.length,
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
