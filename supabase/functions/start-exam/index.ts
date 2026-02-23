import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session
    const { data: session, error: sErr } = await admin
      .from("exam_sessions")
      .select("id, user_id, status, time_limit_sec, started_at, expires_at")
      .eq("id", session_id)
      .single();

    if (sErr || !session) {
      return new Response(
        JSON.stringify({ error: "الجلسة غير موجودة" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "غير مصرح بالوصول لهذه الجلسة" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If already started (idempotent), return existing times
    if (session.status === "in_progress" && session.expires_at) {
      const serverNow = new Date().toISOString();
      return new Response(
        JSON.stringify({
          session_id: session.id,
          started_at: session.started_at,
          expires_at: session.expires_at,
          server_now: serverNow,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If already completed/submitted/expired
    if (session.status === "completed" || session.status === "submitted" || session.status === "expired") {
      return new Response(
        JSON.stringify({ error: "الجلسة منتهية بالفعل", status: session.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Start the exam: set started_at, expires_at, status
    const now = new Date();
    const expiresAt = new Date(now.getTime() + session.time_limit_sec * 1000);

    const { error: updateErr } = await admin
      .from("exam_sessions")
      .update({
        status: "in_progress",
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", session_id)
      .in("status", ["not_started"]);

    if (updateErr) {
      console.error("Failed to start session:", updateErr);
      return new Response(
        JSON.stringify({ error: "فشل في بدء الجلسة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serverNow = now.toISOString();
    return new Response(
      JSON.stringify({
        session_id: session.id,
        started_at: serverNow,
        expires_at: expiresAt.toISOString(),
        server_now: serverNow,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Start exam error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
