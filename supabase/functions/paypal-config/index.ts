const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const env = Deno.env.get("PAYPAL_ENV") || "sandbox";

  if (!clientId) {
    return new Response(
      JSON.stringify({ error: "PayPal not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ client_id: clientId, env }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
