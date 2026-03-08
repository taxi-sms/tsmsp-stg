import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8"
    }
  });
}

const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "paused"
]);

function isCancellableSubscription(status: unknown) {
  return CANCELLABLE_SUBSCRIPTION_STATUSES.has(String(status || "").trim());
}

async function cancelStripeSubscriptions(options: {
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const customerId = String(options.customerId || "").trim();
  const subscriptionId = String(options.subscriptionId || "").trim();
  if (!customerId && !subscriptionId) {
    return { canceledSubscriptionIds: [] as string[] };
  }
  if (!stripe) {
    throw new Error("stripe_not_configured");
  }

  const targets = new Map<string, Stripe.Subscription>();

  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      targets.set(subscription.id, subscription);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("No such subscription")) throw err;
    }
  }

  if (customerId) {
    let startingAfter: string | undefined;
    while (true) {
      const page = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {})
      });
      for (const subscription of page.data || []) {
        targets.set(subscription.id, subscription);
      }
      if (!page.has_more || !page.data.length) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  const canceledSubscriptionIds: string[] = [];
  for (const subscription of targets.values()) {
    if (!isCancellableSubscription(subscription.status)) continue;
    await stripe.subscriptions.cancel(subscription.id);
    canceledSubscriptionIds.push(subscription.id);
  }

  return { canceledSubscriptionIds };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "missing_env" }, 500);
  }

  const authHeader = String(req.headers.get("authorization") || "").trim();
  if (!authHeader) {
    return json({ ok: false, error: "missing_authorization" }, 401);
  }

  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return json({ ok: false, error: "invalid_authorization" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (_) {
    body = {};
  }

  if (String(body.confirmText || "").trim() !== "DELETE") {
    return json({ ok: false, error: "confirm_text_required" }, 400);
  }

  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(accessToken);
  const user = authData?.user;
  if (authError || !user?.id) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }

  let stripeResult = { canceledSubscriptionIds: [] as string[] };
  try {
    const { data: billingState, error: billingError } = await serviceSupabase
      .from("billing_subscriptions")
      .select("stripe_customer_id,stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (billingError) {
      console.error("delete_account_billing_lookup_failed", { userId: user.id, message: billingError.message });
      return json({ ok: false, error: "billing_lookup_failed", detail: { message: billingError.message } }, 500);
    }

    stripeResult = await cancelStripeSubscriptions({
      customerId: billingState?.stripe_customer_id,
      subscriptionId: billingState?.stripe_subscription_id
    });
  } catch (stripeError) {
    const message = stripeError instanceof Error ? stripeError.message : String(stripeError);
    console.error("delete_account_cancel_subscription_failed", { userId: user.id, message });
    return json({ ok: false, error: "cancel_subscription_failed", detail: { message } }, 500);
  }

  const { error: deleteError } = await serviceSupabase.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("delete_account_failed", { userId: user.id, message: deleteError.message });
    return json({ ok: false, error: "delete_account_failed", detail: { message: deleteError.message } }, 500);
  }

  return json({ ok: true, canceledSubscriptionIds: stripeResult.canceledSubscriptionIds }, 200);
});
