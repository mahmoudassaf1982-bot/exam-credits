import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get current state
    const { data: state } = await adminClient
      .from("ai_provider_state")
      .select("*")
      .limit(1)
      .single();

    if (!state) {
      return new Response(JSON.stringify({ status: "no_state_row" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // Only run healthcheck when on fallback
    if (state.active_provider === "claude" && state.status === "healthy") {
      await adminClient
        .from("ai_provider_state")
        .update({ last_healthcheck_at: now, updated_at: now })
        .eq("id", state.id);

      console.log("[healthcheck] Claude is active and healthy, no action needed");
      return new Response(JSON.stringify({ status: "healthy", provider: "claude" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test Claude with a minimal request
    console.log("[healthcheck] Testing Claude availability...");
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("[healthcheck] ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ status: "error", message: "No API key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const testRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          messages: [{ role: "user", content: "Say OK" }],
        }),
      });

      if (testRes.ok) {
        // Claude recovered!
        console.log("[healthcheck] ✅ Claude is back online, recovering...");

        await adminClient
          .from("ai_provider_state")
          .update({
            active_provider: "claude",
            status: "healthy",
            failure_reason: null,
            last_recovery_at: now,
            last_healthcheck_at: now,
            updated_at: now,
          })
          .eq("id", state.id);

        // Send recovery email
        await sendRecoveryEmail(adminClient, state.id);

        return new Response(JSON.stringify({ status: "recovered", provider: "claude" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const errText = await testRes.text();
        console.log(`[healthcheck] Claude still failing: ${testRes.status} ${errText}`);

        await adminClient
          .from("ai_provider_state")
          .update({ last_healthcheck_at: now, updated_at: now })
          .eq("id", state.id);

        return new Response(JSON.stringify({
          status: "still_degraded",
          provider: "openai",
          claude_status: testRes.status,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error("[healthcheck] Claude test network error:", e);
      await adminClient
        .from("ai_provider_state")
        .update({ last_healthcheck_at: now, updated_at: now })
        .eq("id", state.id);

      return new Response(JSON.stringify({ status: "still_degraded", error: "network" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[healthcheck] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendRecoveryEmail(adminClient: any, stateId: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;

  const { data: adminEmail } = await adminClient.rpc("get_admin_notification_email");
  if (!adminEmail) return;

  const now = new Date().toISOString();

  // Update last_email_sent_at
  await adminClient
    .from("ai_provider_state")
    .update({ last_email_sent_at: now })
    .eq("id", stateId);

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "SARIS Alerts <onboarding@resend.dev>",
        to: [adminEmail],
        subject: "✅ SARIS AI Alert: switched back to Claude",
        html: `<h2>SARIS AI Provider Recovery</h2>
               <p><strong>Timestamp:</strong> ${now}</p>
               <p><strong>Recovery Confirmed:</strong> Claude is responding normally</p>
               <p><strong>Active Provider:</strong> Claude (claude-sonnet-4)</p>
               <p>The system has successfully recovered back to Claude as the primary provider.</p>`,
      }),
    });
    console.log("[healthcheck] Recovery email sent");
  } catch (e) {
    console.error("[healthcheck] Failed to send recovery email:", e);
  }
}
