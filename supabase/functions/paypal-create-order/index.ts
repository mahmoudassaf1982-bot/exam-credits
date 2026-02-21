import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getPayPalBaseUrl(): string {
  const env = Deno.env.get("PAYPAL_ENV") || "sandbox";
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.error("Missing PayPal credentials");
    throw new Error("PayPal credentials not configured");
  }

  const auth = btoa(`${clientId}:${clientSecret}`);
  const baseUrl = getPayPalBaseUrl();

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const responseText = await res.text();

  if (!res.ok) {
    console.error("PayPal auth failed:", res.status);
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = JSON.parse(responseText);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BASE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://exam-credits.lovable.app";

    const body = await req.json();
    const { order_type, pack_id, plan_id, points_amount, price_usd, description, currency_code, user_id } = body;

    if (!order_type || !price_usd) {
      return new Response(
        JSON.stringify({ error: "بيانات ناقصة", code: "validation_error" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side price validation against database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let serverPrice: number | null = null;
    let serverPoints: number | null = null;

    if (order_type === "points_pack" && pack_id) {
      const { data: pack, error: packErr } = await supabaseAdmin
        .from("points_packs")
        .select("price_usd, points, is_active")
        .eq("id", pack_id)
        .single();

      if (packErr || !pack) {
        console.error("Pack not found:", pack_id);
        return new Response(
          JSON.stringify({ error: "الحزمة غير موجودة", code: "invalid_pack" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!pack.is_active) {
        return new Response(
          JSON.stringify({ error: "هذه الحزمة غير متاحة حالياً", code: "inactive_pack" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      serverPrice = parseFloat(String(pack.price_usd));
      serverPoints = pack.points;
    } else if (order_type === "diamond_plan" && plan_id) {
      const { data: plan, error: planErr } = await supabaseAdmin
        .from("diamond_plans")
        .select("price_usd, is_active")
        .eq("id", plan_id)
        .single();

      if (planErr || !plan) {
        console.error("Plan not found:", plan_id);
        return new Response(
          JSON.stringify({ error: "الخطة غير موجودة", code: "invalid_plan" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!plan.is_active) {
        return new Response(
          JSON.stringify({ error: "هذه الخطة غير متاحة حالياً", code: "inactive_plan" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      serverPrice = parseFloat(String(plan.price_usd));
    }

    // If we found a server-side price, validate against client-supplied price
    if (serverPrice !== null && Math.abs(serverPrice - Number(price_usd)) > 0.01) {
      console.error(`Price mismatch! client=${price_usd}, server=${serverPrice}`);
      return new Response(
        JSON.stringify({ error: "السعر غير صحيح", code: "price_mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use server-side price and points if available
    const finalPrice = serverPrice ?? Number(price_usd);
    const finalPoints = serverPoints ?? points_amount;
    const formattedAmount = finalPrice.toFixed(2);
    const finalCurrency = currency_code || "USD";

    // Get PayPal access token
    let accessToken: string;
    try {
      accessToken = await getPayPalAccessToken();
    } catch (tokenErr) {
      console.error("PayPal token error:", tokenErr);
      return new Response(
        JSON.stringify({ error: "فشل الاتصال بـ PayPal", code: "paypal_token_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create PayPal order
    const baseUrl = getPayPalBaseUrl();
    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: finalCurrency,
            value: formattedAmount,
          },
          description: description || (order_type === "points_pack" ? `شراء ${finalPoints} نقطة` : "اشتراك Diamond سنوي"),
        },
      ],
      application_context: {
        brand_name: "Saris Exams",
        locale: "ar-SA",
        landing_page: "NO_PREFERENCE",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${BASE_URL}/payment/success`,
        cancel_url: `${BASE_URL}/payment/cancel`,
      },
    };

    const paypalRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const paypalResText = await paypalRes.text();

    if (!paypalRes.ok) {
      console.error("PayPal create order failed:", paypalRes.status);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء طلب PayPal", code: "paypal_create_order_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalData = JSON.parse(paypalResText);

    // Save order to database using server-validated price
    const { error: insertError } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: user_id || "00000000-0000-0000-0000-000000000000",
        order_type,
        paypal_order_id: paypalData.id,
        pack_id: pack_id || null,
        plan_id: plan_id || null,
        points_amount: finalPoints || null,
        price_usd: finalPrice,
        status: "pending",
        meta_json: { description },
      });

    if (insertError) {
      console.error("DB insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "فشل حفظ الطلب في قاعدة البيانات", code: "db_insert_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return approve URL
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
    console.error("Unexpected error in paypal-create-order:", error);
    return new Response(
      JSON.stringify({ error: "حدث خطأ غير متوقع في الخادم", code: "unexpected_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
