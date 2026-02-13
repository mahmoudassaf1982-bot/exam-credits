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

  console.log("[capture] Requesting PayPal access token...");
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
    console.error("[capture] PayPal auth error:", text);
    throw new Error("Failed to get PayPal access token");
  }

  const data = await res.json();
  console.log("[capture] PayPal access token obtained");
  return data.access_token;
}

async function creditWalletPoints(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  amount: number
): Promise<void> {
  console.log(`[capture] Crediting ${amount} points to user ${userId}`);

  // Try RPC first
  const { error: rpcError } = await supabaseAdmin.rpc("credit_wallet_points", {
    _user_id: userId,
    _amount: amount,
  });

  if (!rpcError) {
    console.log("[capture] Points credited via RPC successfully");
    return;
  }

  console.log("[capture] RPC not available, using direct increment fallback:", rpcError.message);

  // Fallback: fetch current balance then increment
  const { data: wallet, error: fetchError } = await supabaseAdmin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (fetchError || !wallet) {
    console.error("[capture] Failed to fetch wallet:", fetchError);
    throw new Error("Wallet not found for user");
  }

  const newBalance = wallet.balance + amount;
  console.log(`[capture] Current balance: ${wallet.balance}, new balance: ${newBalance}`);

  const { error: updateError } = await supabaseAdmin
    .from("wallets")
    .update({ balance: newBalance })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[capture] Failed to update wallet:", updateError);
    throw new Error("Failed to update wallet balance");
  }

  console.log("[capture] Wallet updated successfully via fallback");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { paypal_order_id } = body;

    if (!paypal_order_id) {
      console.error("[capture] Missing paypal_order_id");
      return new Response(
        JSON.stringify({ error: "معرف الطلب مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[capture] === Starting capture for PayPal order: ${paypal_order_id} ===`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Find the order in DB
    console.log("[capture] Step 1: Finding order in database...");
    const { data: orderRecord, error: fetchError } = await supabaseAdmin
      .from("payment_orders")
      .select("*")
      .eq("paypal_order_id", paypal_order_id)
      .single();

    if (fetchError || !orderRecord) {
      console.error("[capture] Order not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "الطلب غير موجود" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[capture] Order found: id=${orderRecord.id}, type=${orderRecord.order_type}, status=${orderRecord.status}, expected_amount=${orderRecord.price_usd}, user=${orderRecord.user_id}`);

    if (orderRecord.status === "completed") {
      console.log("[capture] Order already completed, skipping");
      return new Response(
        JSON.stringify({ error: "تم معالجة هذا الطلب مسبقاً", already_completed: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Capture the PayPal order
    console.log("[capture] Step 2: Capturing PayPal order...");
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
    console.log(`[capture] PayPal capture response: status=${captureRes.status}, order_status=${captureData.status}`);

    if (!captureRes.ok || captureData.status !== "COMPLETED") {
      console.error("[capture] PayPal capture failed:", JSON.stringify(captureData));

      await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed", meta_json: { ...orderRecord.meta_json, capture_error: captureData } })
        .eq("id", orderRecord.id);

      return new Response(
        JSON.stringify({ error: "فشل في تأكيد الدفع" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Server-side amount validation
    console.log("[capture] Step 3: Validating payment amount...");
    const capturedAmount = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    const paidValue = capturedAmount ? parseFloat(capturedAmount.value) : 0;
    const expectedValue = parseFloat(String(orderRecord.price_usd));

    console.log(`[capture] Amount validation: paid=${paidValue} ${capturedAmount?.currency_code}, expected=${expectedValue} USD`);

    if (Math.abs(paidValue - expectedValue) > 0.01) {
      console.error(`[capture] AMOUNT MISMATCH! paid=${paidValue}, expected=${expectedValue}`);

      await supabaseAdmin
        .from("payment_orders")
        .update({
          status: "amount_mismatch",
          meta_json: {
            ...orderRecord.meta_json,
            paid_amount: paidValue,
            expected_amount: expectedValue,
            capture_id: capturedAmount?.id,
          },
        })
        .eq("id", orderRecord.id);

      return new Response(
        JSON.stringify({ error: "المبلغ المدفوع لا يتطابق مع المبلغ المتوقع" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[capture] Amount validated successfully ✓");

    // Step 4: Update order status to completed
    console.log("[capture] Step 4: Updating order status to completed...");
    const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const payerEmail = captureData.payer?.email_address;

    await supabaseAdmin
      .from("payment_orders")
      .update({
        status: "completed",
        meta_json: {
          ...orderRecord.meta_json,
          capture_id: captureId,
          payer_email: payerEmail,
          paid_amount: paidValue,
        },
      })
      .eq("id", orderRecord.id);

    console.log(`[capture] Order marked as completed. capture_id=${captureId}, payer=${payerEmail}`);

    // Step 5: Fulfill the order
    console.log("[capture] Step 5: Fulfilling order...");
    const result: Record<string, unknown> = {
      success: true,
      order_type: orderRecord.order_type,
    };

    if (orderRecord.order_type === "points_pack" && orderRecord.points_amount) {
      // Credit points to wallet
      try {
        await creditWalletPoints(supabaseAdmin, orderRecord.user_id, orderRecord.points_amount);
      } catch (walletErr) {
        console.error("[capture] CRITICAL: Failed to credit wallet:", walletErr);
        // Mark order for manual review but don't fail - payment was captured
        await supabaseAdmin
          .from("payment_orders")
          .update({
            meta_json: {
              ...orderRecord.meta_json,
              capture_id: captureId,
              payer_email: payerEmail,
              fulfillment_error: String(walletErr),
              needs_manual_review: true,
            },
          })
          .eq("id", orderRecord.id);

        return new Response(
          JSON.stringify({ error: "تم الدفع بنجاح لكن حدث خطأ في إضافة النقاط. سيتم مراجعة طلبك يدوياً." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Record transaction
      console.log("[capture] Recording points transaction...");
      await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: orderRecord.user_id,
          type: "credit",
          amount: orderRecord.points_amount,
          reason: "purchase_points",
          meta_json: {
            payment_order_id: orderRecord.id,
            pack_id: orderRecord.pack_id,
          },
        });

      result.points_credited = orderRecord.points_amount;
      result.message = `تم إضافة ${orderRecord.points_amount} نقطة إلى محفظتك بنجاح! 🎉`;
      console.log(`[capture] ✓ Credited ${orderRecord.points_amount} points to user ${orderRecord.user_id}`);

    } else if (orderRecord.order_type === "diamond_plan") {
      console.log("[capture] Activating Diamond plan...");
      await supabaseAdmin
        .from("profiles")
        .update({ is_diamond: true })
        .eq("id", orderRecord.user_id);

      await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: orderRecord.user_id,
          type: "credit",
          amount: 0,
          reason: "purchase_points",
          meta_json: {
            payment_order_id: orderRecord.id,
            plan_id: orderRecord.plan_id,
            type: "diamond_activation",
          },
        });

      result.diamond_activated = true;
      result.message = "تم تفعيل اشتراك Diamond لمدة سنة! 💎";
      console.log(`[capture] ✓ Diamond plan activated for user ${orderRecord.user_id}`);
    }

    console.log(`[capture] === Order ${paypal_order_id} completed successfully ===`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[capture] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "حدث خطأ في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
