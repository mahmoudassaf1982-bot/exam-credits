import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;

  const auth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("PayPal auth error:", text);
    throw new Error("Failed to get PayPal access token");
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "غير مصرح - يرجى تسجيل الدخول" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "غير مصرح" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { order_type, pack_id, plan_id, points_amount, price_usd, description } = body;

    if (!order_type || !price_usd) {
      return new Response(
        JSON.stringify({ error: "بيانات ناقصة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating PayPal order: type=${order_type}, price=${price_usd}, user=${user.id}`);

    // Create PayPal order
    const accessToken = await getPayPalAccessToken();

    const paypalOrder = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: String(price_usd),
            },
            description: description || (order_type === "points_pack" ? `شراء ${points_amount} نقطة` : "اشتراك Diamond سنوي"),
          },
        ],
        application_context: {
          brand_name: "Saris Exams",
          locale: "ar-SA",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: `${req.headers.get("origin") || ""}/app/topup?status=success`,
          cancel_url: `${req.headers.get("origin") || ""}/app/topup?status=cancelled`,
        },
      }),
    });

    if (!paypalOrder.ok) {
      const errText = await paypalOrder.text();
      console.error("PayPal create order error:", errText);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء طلب PayPal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalData = await paypalOrder.json();
    console.log("PayPal order created:", paypalData.id);

    // Save order to database using service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: insertError } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        order_type,
        paypal_order_id: paypalData.id,
        pack_id: pack_id || null,
        plan_id: plan_id || null,
        points_amount: points_amount || null,
        price_usd,
        status: "pending",
        meta_json: { description },
      });

    if (insertError) {
      console.error("DB insert error:", insertError);
    }

    // Find the approve link
    const approveLink = paypalData.links?.find(
      (link: { rel: string; href: string }) => link.rel === "approve"
    );

    return new Response(
      JSON.stringify({
        id: paypalData.id,
        approve_url: approveLink?.href,
        status: paypalData.status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in paypal-create-order:", error);
    return new Response(
      JSON.stringify({ error: "حدث خطأ في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
