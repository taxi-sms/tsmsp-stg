import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_PRICE_STARTER_MONTHLY = Deno.env.get("STRIPE_PRICE_STARTER_MONTHLY") || "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

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

function detailOf(err: unknown) {
  if (!err) return { message: "unknown_error" };
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    return {
      message: String(obj.message || "error_object"),
      code: String(obj.code || "")
    };
  }
  return { message: String(err) };
}

function mapPlanToPrice(planCode: string) {
  if (planCode === "starter_monthly") return STRIPE_PRICE_STARTER_MONTHLY;
  return "";
}

function safeHttpUrl(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch (_) {
    // ignore and fallback
  }
  return fallback;
}

async function createStripeCustomer(userId: string, email: string, planCode: string) {
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: {
      tsms_user_id: userId,
      tsms_plan_code: planCode
    }
  });
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_PRICE_STARTER_MONTHLY) {
    return json({ ok: false, error: "missing_env" }, 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return json({ ok: false, error: "missing_authorization" }, 401);
  }

  const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await userSupabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user?.id) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (_) {
    body = {};
  }

  const planCode = String(body.planCode || "starter_monthly").trim() || "starter_monthly";
  const priceId = mapPlanToPrice(planCode);
  if (!priceId) {
    return json({ ok: false, error: "unsupported_plan", planCode }, 400);
  }

  const origin = req.headers.get("origin") || "";
  const base = APP_BASE_URL || origin || "https://example.com";
  const successDefault = new URL("settings.html?subscription=success", base).toString();
  const cancelDefault = new URL("settings.html?subscription=cancel", base).toString();
  const successUrl = safeHttpUrl(body.successUrl, successDefault);
  const cancelUrl = safeHttpUrl(body.cancelUrl, cancelDefault);

  try {
    const { data: existing } = await serviceSupabase
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = String(existing?.stripe_customer_id || "").trim();
    if (!customerId) {
      customerId = await createStripeCustomer(user.id, user.email || "", planCode);
    }

    const checkoutPayload: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      metadata: {
        tsms_user_id: user.id,
        tsms_plan_code: planCode
      },
      subscription_data: {
        metadata: {
          tsms_user_id: user.id,
          tsms_plan_code: planCode
        }
      }
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        ...checkoutPayload,
        customer: customerId
      });
    } catch (e) {
      const message = detailOf(e).message || "";
      if (!customerId || !message.includes("No such customer")) throw e;
      customerId = await createStripeCustomer(user.id, user.email || "", planCode);
      session = await stripe.checkout.sessions.create({
        ...checkoutPayload,
        customer: customerId
      });
    }

    if (!session.url) {
      return json({ ok: false, error: "checkout_url_missing" }, 500);
    }

    return json({ ok: true, url: session.url, sessionId: session.id, planCode }, 200);
  } catch (e) {
    const detail = detailOf(e);
    console.error("create_checkout_failed", { userId: user.id, detail });
    return json({ ok: false, error: "create_checkout_failed", detail }, 500);
  }
});
