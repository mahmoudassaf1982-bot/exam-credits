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
    console.error("Missing PayPal credentials: clientId=", !!clientId, "clientSecret=", !!clientSecret);
    throw new Error("PayPal credentials not configured");
  }

  console.log("Requesting PayPal access token...");
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
    console.error("PayPal auth failed:", res.status, responseText);
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = JSON.parse(responseText);
  console.log("PayPal access token obtained successfully, expires_in:", data.expires_in);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No Authorization header");
      return new Response(
        JSON.stringify({ error: "غير مصرح - يرجى تسجيل الدخول", code: "auth_missing" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message || "No user found");
      return new Response(
        JSON.stringify({ error: "غير مصرح", code: "auth_invalid" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // 2. Parse and validate request body
    const body = await req.json();
    const { order_type, pack_id, plan_id, points_amount, price_usd, description, currency_code } = body;

    console.log("Request body:", JSON.stringify({
      order_type,
      pack_id,
      plan_id,
      points_amount,
      price_usd,
      currency_code: currency_code || "USD",
      user_id: user.id,
    }));

    if (!order_type || !price_usd) {
      console.error("Missing required fields: order_type=", order_type, "price_usd=", price_usd);
      return new Response(
        JSON.stringify({ error: "بيانات ناقصة", code: "validation_error" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format amount as string with 2 decimal places
    const formattedAmount = Number(price_usd).toFixed(2);
    const finalCurrency = currency_code || "USD";

    console.log(`Order details: type=${order_type}, amount=${formattedAmount} ${finalCurrency}, pack_id=${pack_id}, user=${user.id}`);

    // 3. Get PayPal access token
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

    // 4. Create PayPal order
    const baseUrl = getPayPalBaseUrl();
    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: finalCurrency,
            value: formattedAmount,
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
    };

    console.log("Creating PayPal order with payload:", JSON.stringify(orderPayload));

    const paypalRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const paypalResText = await paypalRes.text();
    console.log("PayPal create order response: status=", paypalRes.status, "body=", paypalResText);

    if (!paypalRes.ok) {
      console.error("PayPal create order failed:", paypalRes.status, paypalResText);
      return new Response(
        JSON.stringify({ error: "فشل إنشاء طلب PayPal", code: "paypal_create_order_error", details: paypalResText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paypalData = JSON.parse(paypalResText);
    console.log("PayPal order created successfully: id=", paypalData.id, "status=", paypalData.status);

    // 5. Save order to database
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
      return new Response(
        JSON.stringify({ error: "فشل حفظ الطلب في قاعدة البيانات", code: "db_insert_error", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Order saved to DB successfully");

    // 6. Return approve URL
    const approveLink = paypalData.links?.find(
      (link: { rel: string; href: string }) => link.rel === "approve"
    );

    console.log("Returning approve URL:", approveLink?.href);

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
