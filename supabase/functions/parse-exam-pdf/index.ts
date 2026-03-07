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

    // Auth check
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userSupabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const { file_path, exam_template_id } = await req.json();
    if (!file_path || !exam_template_id) {
      return jsonResponse({ error: "file_path and exam_template_id required" }, 400);
    }

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await admin.storage
      .from("exam-sources")
      .download(file_path);

    if (downloadError || !fileData) {
      return jsonResponse({ error: "Failed to download file: " + downloadError?.message }, 500);
    }

    // Convert blob to base64 for AI processing
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    if (!apiKey) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Use Gemini to extract text from PDF (it supports PDF natively)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a document text extractor. Extract ALL text content from the provided PDF document. 
Preserve the structure: headings, numbered lists, tables, questions with options.
Return the extracted text as-is in the original language (Arabic or English).
Do NOT summarize or interpret. Just extract the raw text faithfully.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                },
              },
              {
                type: "text",
                text: "Extract all text from this PDF document. Return the complete text content preserving structure.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return jsonResponse({ error: `AI extraction failed (${response.status}): ${errText.substring(0, 300)}` }, 500);
    }

    const aiData = await response.json();
    const extractedText = aiData?.choices?.[0]?.message?.content || "";

    if (!extractedText) {
      return jsonResponse({ error: "No text extracted from PDF" }, 500);
    }

    // Update the source record with extracted text
    await admin
      .from("exam_profile_sources")
      .update({ extracted_text: extractedText })
      .eq("file_path", file_path)
      .eq("exam_template_id", exam_template_id);

    return jsonResponse({
      ok: true,
      extracted_text: extractedText,
      char_count: extractedText.length,
      message: "تم استخراج النص بنجاح",
    });
  } catch (e) {
    console.error("[parse-exam-pdf] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
