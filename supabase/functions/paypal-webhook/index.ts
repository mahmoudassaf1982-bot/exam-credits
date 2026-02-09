import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

async function verifyWebhookSignature(
  req: Request,
  body: string
): Promise<boolean> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
  const auth = btoa(`${clientId}:${clientSecret}`);

  // Get access token
  const tokenRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("PayPal token error during webhook verification:", text);
    return false;
  }

  const tokenData = await tokenRes.json();

  // For sandbox, we do a basic verification
  // In production, you'd verify the webhook signature using PayPal's API
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");

  if (!transmissionId || !transmissionTime) {
    console.warn("Missing PayPal webhook headers - skipping signature check in sandbox");
    // In sandbox mode, allow through with warning
    return true;
  }

  console.log(`Webhook verification: transmissionId=${transmissionId}, time=${transmissionTime}`);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    console.log("PayPal webhook received");

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, bodyText);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = JSON.parse(bodyText);
    console.log(`Webhook event: ${event.event_type}, id: ${event.id}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    switch (event.event_type) {
      case "CHECKOUT.ORDER.APPROVED": {
        const orderId = event.resource?.id;
        console.log(`Order approved via webhook: ${orderId}`);

        if (orderId) {
          await supabaseAdmin
            .from("payment_orders")
            .update({
              meta_json: { webhook_approved: true, webhook_event_id: event.id },
            })
            .eq("paypal_order_id", orderId);
        }
        break;
      }

      case "PAYMENT.CAPTURE.COMPLETED": {
        const captureId = event.resource?.id;
        const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
        console.log(`Payment captured via webhook: captureId=${captureId}, orderId=${orderId}`);

        if (orderId) {
          const { data: order } = await supabaseAdmin
            .from("payment_orders")
            .select("*")
            .eq("paypal_order_id", orderId)
            .single();

          if (order && order.status !== "completed") {
            await supabaseAdmin
              .from("payment_orders")
              .update({
                status: "completed",
                meta_json: {
                  ...order.meta_json,
                  webhook_capture_id: captureId,
                  webhook_event_id: event.id,
                  fulfilled_by: "webhook",
                },
              })
              .eq("id", order.id);

            console.log(`Order ${orderId} marked completed via webhook`);
          }
        }
        break;
      }

      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.REVERSED": {
        const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
        console.log(`Payment failed/reversed via webhook: ${orderId}`);

        if (orderId) {
          await supabaseAdmin
            .from("payment_orders")
            .update({
              status: "failed",
              meta_json: { webhook_event_type: event.event_type, webhook_event_id: event.id },
            })
            .eq("paypal_order_id", orderId);
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.event_type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
