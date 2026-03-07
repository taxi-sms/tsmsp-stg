import { supabase } from "./supabase-client.js";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchCurrentSubscriptionState(options = {}) {
  const retryCount = Math.max(0, Number(options.retryCount ?? DEFAULT_RETRY_COUNT) || 0);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS) || 0);
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const { data, error } = await supabase.rpc("current_subscription_state");
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return row || {
        user_id: null,
        plan_code: "starter_monthly",
        status: "inactive",
        is_active: false,
        trial_ends_at: null,
        current_period_end: null,
        cancel_at_period_end: false
      };
    }

    lastError = error;
    if (attempt < retryCount && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError || new Error("subscription_state_fetch_failed");
}

export function isSubscriptionActive(state) {
  if (!state || typeof state !== "object") return false;
  if (typeof state.is_active === "boolean") return state.is_active;
  return ACTIVE_STATUSES.has(String(state.status || ""));
}
