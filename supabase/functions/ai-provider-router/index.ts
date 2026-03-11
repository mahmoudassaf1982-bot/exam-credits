import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Failover Error Detection ───────────────────────────────────
function isFailoverError(errorText: string, statusCode: number): boolean {
  if ([402, 429, 500, 502, 503, 504, 529].includes(statusCode)) return true;
  const lower = (errorText || "").toLowerCase();
  const patterns = [
    "insufficient credits", "billing", "payment required",
    "rate limit", "timeout", "overloaded", "unavailable",
    "capacity", "too many requests", "server error",
  ];
  return patterns.some(p => lower.includes(p));
}

// ─── Claude Provider ────────────────────────────────────────────
async function callClaude(opts: {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: boolean; text?: string; error?: string; statusCode?: number }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not configured", statusCode: 500 };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.3,
        system: opts.systemPrompt,
        messages: opts.messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[router] Claude error:", res.status, errText);
      return { ok: false, error: errText, statusCode: res.status };
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    return { ok: true, text };
  } catch (e) {
    console.error("[router] Claude network error:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Network error", statusCode: 0 };
  }
}

// ─── OpenAI Fallback Provider ───────────────────────────────────
async function callOpenAI(opts: {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: boolean; text?: string; error?: string; statusCode?: number }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY not configured", statusCode: 500 };

  try {
    const allMessages = [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages,
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: allMessages,
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[router] OpenAI fallback error:", res.status, errText);
      return { ok: false, error: errText, statusCode: res.status };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    return { ok: true, text: text.trim() };
  } catch (e) {
    console.error("[router] OpenAI network error:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Network error", statusCode: 0 };
  }
}

// ─── Email Alert Sender ─────────────────────────────────────────
async function sendProviderAlert(
  adminClient: any,
  type: "failover" | "recovery",
  details: { feature?: string; failureReason?: string }
) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[router] RESEND_API_KEY not set, skipping email alert");
    return;
  }

  // Get admin email
  const { data: adminEmail } = await adminClient.rpc("get_admin_notification_email");
  if (!adminEmail) {
    console.warn("[router] No admin email configured, skipping alert");
    return;
  }

  const timestamp = new Date().toISOString();
  const isFailover = type === "failover";

  const subject = isFailover
    ? "⚠️ SARIS AI Alert: switched from Claude to OpenAI"
    : "✅ SARIS AI Alert: switched back to Claude";

  const body = isFailover
    ? `<h2>SARIS AI Provider Failover</h2>
       <p><strong>Timestamp:</strong> ${timestamp}</p>
       <p><strong>Feature:</strong> ${details.feature || "unknown"}</p>
       <p><strong>Failure Reason:</strong> ${details.failureReason || "unknown"}</p>
       <p><strong>Active Provider:</strong> OpenAI (gpt-5-mini)</p>
       <p>The system has automatically switched to OpenAI as a fallback. Claude will be retested periodically and restored when available.</p>`
    : `<h2>SARIS AI Provider Recovery</h2>
       <p><strong>Timestamp:</strong> ${timestamp}</p>
       <p><strong>Recovery Confirmed:</strong> Claude is responding normally</p>
       <p><strong>Active Provider:</strong> Claude (claude-sonnet-4)</p>
       <p>The system has successfully recovered back to Claude as the primary provider.</p>`;

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
        subject,
        html: body,
      }),
    });
    console.log(`[router] ${type} alert email sent to ${adminEmail}`);
  } catch (e) {
    console.error("[router] Failed to send alert email:", e);
  }
}

// ─── State Management ───────────────────────────────────────────
async function getProviderState(adminClient: any) {
  const { data } = await adminClient
    .from("ai_provider_state")
    .select("*")
    .limit(1)
    .single();
  return data;
}

async function switchToFallback(
  adminClient: any,
  feature: string,
  failureReason: string
) {
  const state = await getProviderState(adminClient);
  const now = new Date().toISOString();
  const alreadyOnFallback = state?.active_provider === "openai";

  // Update state
  await adminClient
    .from("ai_provider_state")
    .update({
      active_provider: "openai",
      status: "degraded",
      failure_reason: failureReason,
      last_failure_at: now,
      updated_at: now,
    })
    .eq("id", state.id);

  // Send email only if not already on fallback or last email was > 30 min ago
  const shouldEmail = !alreadyOnFallback || !state.last_email_sent_at ||
    (Date.now() - new Date(state.last_email_sent_at).getTime()) > 30 * 60 * 1000;

  if (shouldEmail) {
    await adminClient
      .from("ai_provider_state")
      .update({ last_email_sent_at: now })
      .eq("id", state.id);
    await sendProviderAlert(adminClient, "failover", { feature, failureReason });
  }

  console.log(`[router] ⚠️ Switched to OpenAI fallback (feature: ${feature}, reason: ${failureReason})`);
}

// ─── Main Router ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      feature = "unknown",
      systemPrompt,
      userPrompt,
      messages = [],
      temperature = 0.3,
      maxTokens = 500,
      metadata = {},
    } = body;

    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: "systemPrompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages array
    const aiMessages = messages.length > 0
      ? messages.map((m: any) => ({ role: m.role, content: m.content }))
      : userPrompt
        ? [{ role: "user", content: userPrompt }]
        : [];

    if (aiMessages.length === 0) {
      return new Response(JSON.stringify({ error: "messages or userPrompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current provider state
    const state = await getProviderState(adminClient);
    const activeProvider = state?.active_provider || "claude";
    let fallbackUsed = false;
    let responseText = "";
    let usedProvider = activeProvider;

    if (activeProvider === "claude") {
      // Try Claude first
      const claudeResult = await callClaude({ systemPrompt, messages: aiMessages, temperature, maxTokens });

      if (claudeResult.ok) {
        responseText = claudeResult.text!;
        usedProvider = "claude";
        console.log(`[router] ✅ Claude success (feature: ${feature})`);
      } else if (isFailoverError(claudeResult.error || "", claudeResult.statusCode || 0)) {
        // Failover to OpenAI
        console.warn(`[router] ⚠️ Claude failed, failing over to OpenAI (feature: ${feature})`);
        await switchToFallback(adminClient, feature, claudeResult.error || "Unknown error");

        const openaiResult = await callOpenAI({ systemPrompt, messages: aiMessages, temperature, maxTokens });
        if (openaiResult.ok) {
          responseText = openaiResult.text!;
          usedProvider = "openai";
          fallbackUsed = true;
          console.log(`[router] ✅ OpenAI fallback success (feature: ${feature})`);
        } else {
          // Both providers failed
          console.error(`[router] ❌ Both providers failed (feature: ${feature})`);
          return new Response(JSON.stringify({
            reply: "عذراً، حدث خطأ في معالجة طلبك. حاول مرة أخرى لاحقاً.",
            provider: "none",
            fallback_used: true,
            feature,
            error: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // Non-failover error (e.g. 400 bad request)
        return new Response(JSON.stringify({
          reply: "عذراً، حدث خطأ في معالجة طلبك.",
          provider: "claude",
          fallback_used: false,
          feature,
          error: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Already on OpenAI fallback
      fallbackUsed = true;
      const openaiResult = await callOpenAI({ systemPrompt, messages: aiMessages, temperature, maxTokens });
      if (openaiResult.ok) {
        responseText = openaiResult.text!;
        usedProvider = "openai";
        console.log(`[router] ✅ OpenAI (active fallback) success (feature: ${feature})`);
      } else {
        // Try Claude as last resort even though we're in fallback mode
        const claudeResult = await callClaude({ systemPrompt, messages: aiMessages, temperature, maxTokens });
        if (claudeResult.ok) {
          responseText = claudeResult.text!;
          usedProvider = "claude";
          fallbackUsed = false;
          // Claude recovered! Update state
          const now = new Date().toISOString();
          await adminClient
            .from("ai_provider_state")
            .update({
              active_provider: "claude",
              status: "healthy",
              failure_reason: null,
              last_recovery_at: now,
              updated_at: now,
            })
            .eq("id", state.id);
          await sendProviderAlert(adminClient, "recovery", {});
          console.log(`[router] 🔄 Claude recovered during fallback mode (feature: ${feature})`);
        } else {
          return new Response(JSON.stringify({
            reply: "عذراً، جميع مزودي الذكاء الاصطناعي غير متاحين حالياً.",
            provider: "none",
            fallback_used: true,
            feature,
            error: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({
      reply: responseText,
      provider: usedProvider,
      fallback_used: fallbackUsed,
      feature,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[router] Unhandled error:", e);
    return new Response(JSON.stringify({
      reply: "عذراً، حدث خطأ غير متوقع.",
      provider: "none",
      fallback_used: false,
      feature: "unknown",
      error: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
