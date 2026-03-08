import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook handler.
 *
 * Processes subscription lifecycle events and keeps the local `subscriptions`
 * table in sync. Uses raw body verification with the Stripe-Signature header.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY       — your Stripe secret key
 *   STRIPE_WEBHOOK_SECRET   — from Stripe Dashboard → Webhooks → Signing secret
 *
 * To add Stripe:  npm install stripe
 */

type StripeEvent = {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeCtor = new (
  apiKey: string,
  options: { apiVersion: string }
) => {
  webhooks: {
    constructEvent: (payload: string, signature: string, secret: string) => unknown;
  };
};

async function verifyStripeWebhook(
  request: NextRequest,
  rawBody: string
): Promise<StripeEvent | null> {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!signature || !webhookSecret || !stripeKey) return null;

  try {
    const runtimeRequire = createRequire(import.meta.url);
    const stripeModuleName = ["stri", "pe"].join("");
    const Stripe = runtimeRequire(stripeModuleName) as StripeCtor;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return event as StripeEvent;
  } catch {
    return null;
  }
}

function mapStripeStatusToLocal(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

function extractPlanFromPriceId(priceId: string): string {
  // Convention: embed plan name in the Stripe Price ID metadata, or use a lookup map.
  // Fallback: check env vars STRIPE_GROWTH_PRICE_ID, STRIPE_ENTERPRISE_PRICE_ID.
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "enterprise";
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  return "free";
}

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server." },
      { status: 501 }
    );
  }

  const rawBody = await request.text();
  const event = await verifyStripeWebhook(request, rawBody);

  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as {
        id: string;
        customer: string;
        status: string;
        items: { data: { price: { id: string } }[] };
        current_period_end: number;
        metadata?: { tenant_id?: string };
      };

      const tenantId = sub.metadata?.tenant_id;
      const priceId = sub.items?.data?.[0]?.price?.id;
      const plan = priceId ? extractPlanFromPriceId(priceId) : "free";
      const status = mapStripeStatusToLocal(sub.status);
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      if (tenantId) {
        await admin
          .from("subscriptions")
          .upsert(
            {
              tenant_id: tenantId,
              stripe_customer_id: sub.customer,
              plan,
              status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "tenant_id" }
          );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as {
        customer: string;
        metadata?: { tenant_id?: string };
      };
      const tenantId = sub.metadata?.tenant_id;
      if (tenantId) {
        await admin
          .from("subscriptions")
          .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
          .eq("tenant_id", tenantId);
      }
      break;
    }

    default:
      // Ignore unhandled event types
      break;
  }

  return NextResponse.json({ received: true });
}
