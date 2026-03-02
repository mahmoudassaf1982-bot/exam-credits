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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userSupabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { action, exam_template_id, sample_questions_text } = body;

    if (!exam_template_id) return jsonResponse({ error: "exam_template_id required" }, 400);

    // Get template info
    const { data: tmpl } = await admin
      .from("exam_templates")
      .select("id, name_ar, country_id, default_question_count, default_time_limit_sec, target_easy_pct, target_medium_pct, target_hard_pct, available_languages")
      .eq("id", exam_template_id)
      .single();

    if (!tmpl) return jsonResponse({ error: "Template not found" }, 404);

    // Get sections
    const { data: sections } = await admin
      .from("exam_sections")
      .select("id, name_ar, question_count, difficulty_mix_json, topic_filter_json")
      .eq("exam_template_id", exam_template_id)
      .order("order");

    // Get existing profile or create default
    const { data: existingProfile } = await admin
      .from("exam_profiles")
      .select("*")
      .eq("exam_template_id", exam_template_id)
      .single();

    let profile = existingProfile?.profile_json || {
      exam_identity: { exam_template_id: tmpl.id, exam_name: tmpl.name_ar, country_id: tmpl.country_id, schema_version: "dna_v1" },
      official_spec: {},
      psychometric_dna: {},
      generation_rules: { options_count: 4, single_correct_answer: true, stem_max_lines: 2, stem_max_chars: 200, no_answer_in_stem: true, language_match_required: true },
      adaptive_rules: { strategy_required: false, mode: "difficulty_only" },
    };

    if (action === "fetch_spec") {
      // Build official_spec from template + sections data
      const languages = Array.isArray(tmpl.available_languages) ? tmpl.available_languages : ["ar"];
      profile.official_spec = {
        total_questions: tmpl.default_question_count,
        duration_minutes: Math.round(tmpl.default_time_limit_sec / 60),
        languages,
        sections: (sections || []).map((s: any) => ({
          section_id: s.id,
          name_ar: s.name_ar,
          question_count: s.question_count,
          topics: s.topic_filter_json || [],
          difficulty_mix: s.difficulty_mix_json || { easy: tmpl.target_easy_pct, medium: tmpl.target_medium_pct, hard: tmpl.target_hard_pct },
        })),
      };
      profile.psychometric_dna = {
        ...profile.psychometric_dna,
        difficulty_mix_default: { easy: tmpl.target_easy_pct, medium: tmpl.target_medium_pct, hard: tmpl.target_hard_pct },
      };
      profile.exam_identity = { exam_template_id: tmpl.id, exam_name: tmpl.name_ar, country_id: tmpl.country_id, schema_version: "dna_v1" };

      // Upsert profile as draft
      if (existingProfile) {
        await admin.from("exam_profiles").update({ profile_json: profile, status: "draft" }).eq("id", existingProfile.id);
      } else {
        await admin.from("exam_profiles").insert({ exam_template_id, profile_json: profile, status: "draft" });
      }

      return jsonResponse({ ok: true, profile, message: "تم جلب المواصفات وحفظها كمسودة" });
    }

    if (action === "infer_dna") {
      if (!apiKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

      // Build prompt for AI to infer psychometric DNA
      let contextInfo = `Exam: ${tmpl.name_ar}\nCountry: ${tmpl.country_id}\nTotal Questions: ${tmpl.default_question_count}\nDuration: ${Math.round(tmpl.default_time_limit_sec / 60)} minutes\n`;
      contextInfo += `Sections:\n${(sections || []).map((s: any) => `  - ${s.name_ar} (${s.question_count} questions)`).join("\n")}\n`;

      if (sample_questions_text) {
        contextInfo += `\nSample official questions:\n${sample_questions_text}\n`;
      }

      // Also get some existing questions as samples
      const { data: sampleQs } = await admin
        .from("questions")
        .select("text_ar, difficulty, topic")
        .eq("exam_template_id", String(exam_template_id))
        .eq("status", "approved")
        .is("deleted_at", null)
        .limit(20);

      if (sampleQs && sampleQs.length > 0) {
        contextInfo += `\nExisting approved questions sample:\n${sampleQs.map((q: any) => `[${q.difficulty}] ${q.text_ar}`).join("\n")}\n`;
      }

      const systemPrompt = `You are a psychometric exam analysis expert. Analyze the exam information and return a JSON object with the psychometric DNA profile. Return ONLY valid JSON, no markdown.

Return this exact structure:
{
  "thinking_style": "direct" | "reasoning" | "mixed",
  "time_pressure_level": "low" | "medium" | "high",
  "reasoning_depth_level": 1-5,
  "avg_steps_per_question": 1-4,
  "trap_density": "low" | "medium" | "high",
  "distractor_style": { "type": "plausible" | "common_mistakes" | "partial_answers", "notes": "string" },
  "wording_complexity": "low" | "medium" | "high",
  "calculation_load": "low" | "medium" | "high",
  "difficulty_mix_default": { "easy": number, "medium": number, "hard": number },
  "expected_time_per_question_seconds": { "easy": number, "medium": number, "hard": number },
  "cognitive_mix": [{ "type": "recall" | "comprehension" | "application" | "analysis", "pct": number }],
  "quality_gate_thresholds": { "min_confidence": 0.85, "min_clarity": 0.8, "min_language_quality": 0.8 }
}

difficulty_mix_default percentages must sum to 100. cognitive_mix percentages must sum to 100.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextInfo },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return jsonResponse({ error: `AI error: ${errText.substring(0, 200)}` }, 500);
      }

      const aiData = await response.json();
      const rawContent = aiData?.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const dna = JSON.parse(objMatch?.[0] || cleaned);

      profile.psychometric_dna = { ...profile.psychometric_dna, ...dna };

      // Upsert
      if (existingProfile) {
        await admin.from("exam_profiles").update({ profile_json: profile, status: "draft" }).eq("id", existingProfile.id);
      } else {
        await admin.from("exam_profiles").insert({ exam_template_id, profile_json: profile, status: "draft" });
      }

      return jsonResponse({ ok: true, profile, dna, message: "تم استنتاج DNA وحفظه كمسودة" });
    }

    return jsonResponse({ error: "Invalid action. Use fetch_spec or infer_dna" }, 400);
  } catch (e) {
    console.error("[exam-profile-builder] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
