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

const PAYPAL_BASE_URL = getPayPalBaseUrl();

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
    const body = await req.json();
    const { paypal_order_id } = body;

    if (!paypal_order_id) {
      return new Response(
        JSON.stringify({ error: "معرف الطلب مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Capturing PayPal order: ${paypal_order_id}`);

    // Use service role for all DB operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the order by PayPal order ID
    const { data: orderRecord, error: fetchError } = await supabaseAdmin
      .from("payment_orders")
      .select("*")
      .eq("paypal_order_id", paypal_order_id)
      .single();

    if (fetchError || !orderRecord) {
      console.error("Order not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "الطلب غير موجود" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (orderRecord.status === "completed") {
      return new Response(
        JSON.stringify({ error: "تم معالجة هذا الطلب مسبقاً", already_completed: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Capture the PayPal order
    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${paypal_order_id}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const captureData = await captureRes.json();

    if (!captureRes.ok || captureData.status !== "COMPLETED") {
      console.error("PayPal capture failed:", JSON.stringify(captureData));

      await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed", meta_json: { ...orderRecord.meta_json, capture_error: captureData } })
        .eq("id", orderRecord.id);

      return new Response(
        JSON.stringify({ error: "فشل في تأكيد الدفع" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("PayPal capture successful:", captureData.status);

    // Update order status
    await supabaseAdmin
      .from("payment_orders")
      .update({
        status: "completed",
        meta_json: {
          ...orderRecord.meta_json,
          capture_id: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id,
          payer_email: captureData.payer?.email_address,
        },
      })
      .eq("id", orderRecord.id);

    // Fulfill the order based on type
    const result: Record<string, unknown> = {
      success: true,
      order_type: orderRecord.order_type,
    };

    if (orderRecord.order_type === "points_pack") {
      result.points_credited = orderRecord.points_amount;
      result.message = `تم إضافة ${orderRecord.points_amount} نقطة إلى محفظتك بنجاح! 🎉`;
      console.log(`Credited ${orderRecord.points_amount} points to user ${orderRecord.user_id}`);
    } else if (orderRecord.order_type === "diamond_plan") {
      result.diamond_activated = true;
      result.message = "تم تفعيل اشتراك Diamond لمدة سنة! 💎";
      console.log(`Activated Diamond plan for user ${orderRecord.user_id}`);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in paypal-capture-order:", error);
    return new Response(
      JSON.stringify({ error: "حدث خطأ في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
