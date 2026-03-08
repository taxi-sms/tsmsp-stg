import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const ALLOWED_STATUSES = new Set([
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid"
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function errorDetail(err: unknown) {
  if (!err) return { message: "unknown_error" };
  if (err instanceof Error) return { message: err.message, stack: err.stack || "" };
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    return {
      message: String(obj.message || "error_object"),
      code: String(obj.code || ""),
      details: String(obj.details || ""),
      hint: String(obj.hint || "")
    };
  }
  return { message: String(err) };
}

function toIsoOrNull(unixSeconds?: number | null) {
  if (!unixSeconds || Number.isNaN(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function normalizeStatus(stripeStatus?: string | null, eventType?: string) {
  const raw = String(stripeStatus || "").trim();
  if (!raw) {
    if (eventType === "customer.subscription.deleted") return "canceled";
    return "inactive";
  }
  if (raw === "cancelled") return "canceled";
  if (ALLOWED_STATUSES.has(raw)) return raw;
  return "inactive";
}

function toUuidMaybe(value: unknown) {
  const v = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
}

function metadataUserId(meta: Record<string, unknown> | undefined) {
  if (!meta) return "";
  return toUuidMaybe(meta.tsms_user_id);
}

async function inferUserId(subscription: Stripe.Subscription, fallbackUserId = "") {
  const direct = metadataUserId(subscription.metadata as Record<string, unknown> | undefined);
  if (direct) return direct;
  if (fallbackUserId) return fallbackUserId;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id || "";
  if (!customerId) return "";

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return "";
    return metadataUserId(customer.metadata as Record<string, unknown> | undefined);
  } catch (_) {
    return "";
  }
}

async function userExists(userId: string) {
  const id = toUuidMaybe(userId);
  if (!id) return false;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("not found") || message.includes("user not found")) return false;
    throw error;
  }
  return !!data?.user?.id;
}

function planCodeFromSubscription(subscription: Stripe.Subscription) {
  const fromMeta = String(subscription.metadata?.tsms_plan_code || "").trim();
  if (fromMeta) return fromMeta;
  const item = subscription.items?.data?.[0];
  const lookupKey = String(item?.price?.lookup_key || "").trim();
  if (lookupKey) return lookupKey;
  return "starter_monthly";
}

function pickSubscriptionId(event: Stripe.Event) {
  const type = event.type;
  const obj = event.data.object as Record<string, unknown>;

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    return String(obj.id || "");
  }

  if (
    type === "invoice.paid" ||
    type === "invoice.payment_failed" ||
    type === "invoice.payment_succeeded"
  ) {
    return String(obj.subscription || "");
  }

  if (type === "checkout.session.completed") {
    return String(obj.subscription || "");
  }

  return "";
}

type RpcPayload = {
  p_user_id: string;
  p_plan_code: string;
  p_status: string;
  p_trial_ends_at: string | null;
  p_current_period_end: string | null;
  p_cancel_at_period_end: boolean;
  p_stripe_customer_id: string | null;
  p_stripe_subscription_id: string | null;
  p_event_type: string;
  p_provider_event_id: string | null;
  p_payload: Record<string, unknown>;
};

async function applySubscriptionFallback(rpcPayload: RpcPayload) {
  const userId = rpcPayload.p_user_id;
  const subscriptionPatch = {
    plan_code: rpcPayload.p_plan_code || "starter_monthly",
    status: rpcPayload.p_status,
    trial_ends_at: rpcPayload.p_trial_ends_at,
    current_period_end: rpcPayload.p_current_period_end,
    cancel_at_period_end: !!rpcPayload.p_cancel_at_period_end,
    stripe_customer_id: rpcPayload.p_stripe_customer_id,
    stripe_subscription_id: rpcPayload.p_stripe_subscription_id,
    updated_at: new Date().toISOString()
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("billing_subscriptions")
    .update(subscriptionPatch)
    .eq("user_id", userId)
    .select("user_id")
    .limit(1);
  if (updateError) throw updateError;

  if (!updatedRows || updatedRows.length === 0) {
    const insertPayload = {
      user_id: userId,
      created_at: new Date().toISOString(),
      ...subscriptionPatch
    };
    const { error: insertError } = await supabase
      .from("billing_subscriptions")
      .insert(insertPayload);
    if (insertError) {
      const code = String(insertError.code || "").trim();
      const msg = String(insertError.message || "").trim();
      const isDup = code === "23505" || msg.includes("duplicate key");
      if (!isDup) throw insertError;
      const { error: retryUpdateError } = await supabase
        .from("billing_subscriptions")
        .update(subscriptionPatch)
        .eq("user_id", userId)
        .limit(1);
      if (retryUpdateError) throw retryUpdateError;
    }
  }

  const providerEventId = String(rpcPayload.p_provider_event_id || "").trim();
  if (providerEventId) {
    const { data: existingEventRows, error: existingEventError } = await supabase
      .from("billing_subscription_events")
      .select("id")
      .eq("provider", "stripe")
      .eq("provider_event_id", providerEventId)
      .limit(1);
    if (existingEventError) throw existingEventError;
    if (existingEventRows && existingEventRows.length > 0) return;
  }

  const { error: insertEventError } = await supabase
    .from("billing_subscription_events")
    .insert({
      user_id: userId,
      provider: "stripe",
      provider_event_id: providerEventId || null,
      event_type: rpcPayload.p_event_type || "unknown",
      payload: rpcPayload.p_payload || {},
      created_at: new Date().toISOString()
    });
  if (insertEventError) {
    const code = String(insertEventError.code || "").trim();
    const msg = String(insertEventError.message || "").trim();
    const isDup = code === "23505" || msg.includes("duplicate key");
    if (!isDup) throw insertEventError;
  }
}

async function applySubscription(event: Stripe.Event) {
  const eventType = event.type;
  const payload = event.data.object as Record<string, unknown>;
  const subscriptionId = pickSubscriptionId(event);

  if (!subscriptionId) {
    return { applied: false, reason: "unsupported_or_missing_subscription" };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "customer"]
  });

  let fallbackUserId = "";
  if (eventType === "checkout.session.completed") {
    fallbackUserId = toUuidMaybe(
      payload?.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>).tsms_user_id
        : payload.client_reference_id
    );
  }

  const userId = await inferUserId(subscription, fallbackUserId);
  if (!userId) {
    return { applied: false, reason: "user_id_not_found", subscriptionId };
  }
  if (!(await userExists(userId))) {
    return { applied: false, reason: "user_not_found", userId, subscriptionId };
  }

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id || "";

  const rpcPayload: RpcPayload = {
    p_user_id: userId,
    p_plan_code: planCodeFromSubscription(subscription),
    p_status: normalizeStatus(subscription.status, eventType),
    p_trial_ends_at: toIsoOrNull(subscription.trial_end),
    p_current_period_end: toIsoOrNull(subscription.current_period_end),
    p_cancel_at_period_end: !!subscription.cancel_at_period_end,
    p_stripe_customer_id: customerId || null,
    p_stripe_subscription_id: subscription.id || null,
    p_event_type: eventType,
    p_provider_event_id: event.id || null,
    p_payload: payload
  };

  const { error } = await supabase.rpc("apply_subscription_webhook", rpcPayload);
  if (error) {
    const detail = errorDetail(error);
    const message = String(detail.message || "").toLowerCase();
    const shouldFallback = String(detail.code || "") === "42P10"
      || message.includes("no unique or exclusion constraint");
    if (!shouldFallback) throw error;
    // Some environments still have a partial-unique index shape that breaks ON CONFLICT inference in RPC.
    await applySubscriptionFallback(rpcPayload);
  }

  return { applied: true, userId, subscriptionId: subscription.id, status: rpcPayload.p_status };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json({ ok: false, error: "missing_env" }, 500);
  }

  const signature = req.headers.get("stripe-signature") || "";
  if (!signature) return json({ ok: false, error: "missing_signature" }, 400);

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json({ ok: false, error: "invalid_signature", detail: String(e) }, 400);
  }

  try {
    const result = await applySubscription(event);
    return json({ ok: true, eventType: event.type, ...result }, 200);
  } catch (e) {
    const detail = errorDetail(e);
    console.error("apply_failed", { eventType: event.type, detail });
    return json({ ok: false, eventType: event.type, error: "apply_failed", detail }, 500);
  }
});
