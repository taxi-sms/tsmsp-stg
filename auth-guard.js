import { loadConfig, supabase } from "./supabase-client.js";
import {
  clearSyncedLocalState,
  ensureCloudSyncRuntime,
  getLastSyncedUserId,
  hydrateCloudState,
  requestCloudBackup,
  setCloudSyncPaused,
  setLastSyncedUserId
} from "./cloud-store.js";
import { migrateLocalStorageSchema } from "./storage-schema.js";
import { installSwUpdateUi } from "./sw-update-ui.js";
import { fetchCurrentSubscriptionState, isSubscriptionActive } from "./subscription-state.js";

const PUBLIC_PAGES = new Set(["login.html", "signup.html", "auth-callback.html", "reset-password.html"]);
const IDLE_LOGOUT_MS = 6 * 60 * 60 * 1000;
const SESSION_RETRY_COUNT = 5;
const SESSION_RETRY_DELAY_MS = 350;
const OPS_KEY = "ops";
const OPS_ARCHIVE_KEY = "ops_archive_v1";
const FORCE_HYDRATION_ONCE_KEY = "tsms_force_hydration_once";
const TEST_REPORT_KEY = "tsms_test_reports_v1";
const SUBSCRIPTION_GATE_ENFORCE_KEY = "tsms_subscription_gate_enforce";
const SUBSCRIPTION_GATE_ALLOWLIST_KEY = "tsms_subscription_gate_allowlist";
const SUBSCRIPTION_GATE_STATE_CACHE_KEY = "tsms_subscription_state_cache_v1";
const SUBSCRIPTION_GATE_EXEMPT_PAGES = new Set(["index.html", "settings.html"]);
const SUBSCRIPTION_GATE_ACTIVE_GRACE_MS = 24 * 60 * 60 * 1000;
const STG_PATH_PREFIX = "/tsmsp-stg/";

function currentPage() {
  const p = location.pathname.split("/").pop();
  return p || "index.html";
}

function redirectToLogin() {
  try {
    sessionStorage.removeItem(TEST_REPORT_KEY);
  } catch (_) {}
  const loginUrl = new URL("login.html", location.href);
  const next = location.pathname + location.search + location.hash;
  loginUrl.searchParams.set("next", next || "/index.html");
  location.replace(loginUrl.toString());
}

export { supabase };

function lockErrorMessage(err) {
  const msg = (err && err.message) ? String(err.message) : "";
  if (!msg) return "";
  if (msg.includes("LockManager") || msg.includes("lock") || msg.includes("timed out")) {
    return "クラウド同期の認証ロックが競合しています。別タブ/別端末の同時操作を止めて再試行してください。";
  }
  return msg;
}

function hasActiveLocalOpsState() {
  try {
    const raw = localStorage.getItem(OPS_KEY);
    if (!raw) return false;
    const ops = JSON.parse(raw);
    if (!ops || typeof ops !== "object") return false;
    const hasDepart = !!ops.departAt;
    const hasReturn = !!ops.returnAt;
    const shiftClosed = !!ops.shiftClosed;
    const breakActive = !!ops.breakActive;
    return !!((hasDepart && !hasReturn && !shiftClosed) || breakActive);
  } catch (_) {
    return false;
  }
}

function consumeForceHydrationFlag() {
  try {
    const forced = sessionStorage.getItem(FORCE_HYDRATION_ONCE_KEY) === "1";
    sessionStorage.removeItem(FORCE_HYDRATION_ONCE_KEY);
    return forced;
  } catch (_) {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSubscriptionGateAllowlist() {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_GATE_ALLOWLIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function inferDefaultSubscriptionGateEnabled() {
  const host = String(location && location.hostname ? location.hostname : "").toLowerCase();
  const path = String(location && location.pathname ? location.pathname : "");
  const isStgPath = path === "/tsmsp-stg" || path.indexOf(STG_PATH_PREFIX) === 0;
  return host === "taxi-sms.github.io" && !isStgPath;
}

function readSubscriptionStateCache() {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_GATE_STATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeSubscriptionStateCache(userId, state) {
  try {
    localStorage.setItem(SUBSCRIPTION_GATE_STATE_CACHE_KEY, JSON.stringify({
      userId: String(userId || ""),
      checkedAt: new Date().toISOString(),
      state: state && typeof state === "object" ? state : null
    }));
  } catch (_) {}
}

function consumeCachedActiveSubscription(userId) {
  const cached = readSubscriptionStateCache();
  if (!cached || String(cached.userId || "") !== String(userId || "")) return null;
  const checkedAtMs = new Date(String(cached.checkedAt || "")).getTime();
  if (!checkedAtMs || Number.isNaN(checkedAtMs)) return null;
  if ((Date.now() - checkedAtMs) > SUBSCRIPTION_GATE_ACTIVE_GRACE_MS) return null;
  const state = cached.state;
  if (!isSubscriptionActive(state)) return null;
  return { checkedAt: checkedAtMs, state };
}

function shouldEnforceSubscriptionGate(userId) {
  const rawMode = String(localStorage.getItem(SUBSCRIPTION_GATE_ENFORCE_KEY) || "").trim();
  let enabled = inferDefaultSubscriptionGateEnabled();
  if (rawMode === "1") enabled = true;
  if (rawMode === "-1") enabled = false;
  if (!enabled) return false;
  const allowlist = parseSubscriptionGateAllowlist();
  if (!allowlist.length) return true;
  return allowlist.includes(String(userId || ""));
}

function shouldSkipSubscriptionGateOnPage() {
  const p = currentPage();
  return PUBLIC_PAGES.has(p) || SUBSCRIPTION_GATE_EXEMPT_PAGES.has(p);
}

async function runSubscriptionGate(userId) {
  if (!shouldEnforceSubscriptionGate(userId)) {
    window.tsmsSubscription = { checked: false, enforced: false, active: true, reason: "gate_disabled" };
    return true;
  }

  if (shouldSkipSubscriptionGateOnPage()) {
    window.tsmsSubscription = { checked: false, enforced: true, active: true, reason: "exempt_page" };
    return true;
  }

  try {
    const state = await fetchCurrentSubscriptionState();
    const active = isSubscriptionActive(state);
    writeSubscriptionStateCache(userId, state);
    window.tsmsSubscription = { checked: true, enforced: true, active, state };
    if (active) return true;

    try {
      alert("契約状態の確認が必要です。設定画面から契約状態をご確認ください。");
    } catch (_) {}
    location.replace(new URL("settings-account.html?subscription=required", location.href).toString());
    return false;
  } catch (_) {
    const cached = consumeCachedActiveSubscription(userId);
    if (cached) {
      window.tsmsSubscription = {
        checked: true,
        enforced: true,
        active: true,
        reason: "cached_active_grace",
        state: cached.state
      };
      return true;
    }

    window.tsmsSubscription = { checked: true, enforced: true, active: false, reason: "check_failed_closed" };
    try {
      alert("契約状態の確認に失敗しました。設定画面から再確認してください。");
    } catch (_) {}
    location.replace(new URL("settings-account.html?subscription=required", location.href).toString());
    return false;
  }
}

async function getSessionWithRetry() {
  let last = { data: null, error: null, attempts: 0 };
  for (let i = 0; i < SESSION_RETRY_COUNT; i++) {
    const result = await supabase.auth.getSession();
    const session = result?.data?.session;
    const userId = session?.user?.id || "";
    last = { ...result, attempts: i + 1 };
    if (!result?.error && session && userId) return last;
    if (i < SESSION_RETRY_COUNT - 1) {
      await sleep(SESSION_RETRY_DELAY_MS);
    }
  }
  return last;
}

function installIdleLogout() {
  if (window.__tsmsIdleLogoutInstalled) return;
  window.__tsmsIdleLogoutInstalled = true;

  let timer = null;
  let firing = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (firing) return;
      firing = true;
      try {
        if (window.tsmsCloud && typeof window.tsmsCloud.safeLogoutWithBackup === "function") {
          await window.tsmsCloud.safeLogoutWithBackup();
          return;
        }
      } catch (e) {
        const msg = lockErrorMessage(e) || "自動ログアウト前のクラウド保存に失敗しました。ログイン状態を維持します。";
        try { alert(msg); } catch (_) {}
      } finally {
        firing = false;
        schedule();
      }
    }, IDLE_LOGOUT_MS);
  };

  const onActivity = () => {
    if (firing) return;
    schedule();
  };

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => {
    window.addEventListener(ev, onActivity, { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onActivity();
  });

  schedule();
}

async function guard() {
  if (PUBLIC_PAGES.has(currentPage())) return;

  try {
    migrateLocalStorageSchema(localStorage);
  } catch (_) {}

  const config = loadConfig();
  if (!config.url || !config.anonKey) {
    redirectToLogin();
    return;
  }

  try {
    const { data, error, attempts } = await getSessionWithRetry();
    const session = data?.session;
    const userId = session?.user?.id || "";

    if (error || !session || !userId) {
      redirectToLogin();
      return;
    }

    ensureCloudSyncRuntime();

    const reloadMarker = `tsms_hydrated:${userId}:${location.pathname}`;
    const alreadyReloaded = sessionStorage.getItem(reloadMarker) === "1";
    const previousUserId = getLastSyncedUserId();
    const userChanged = !!previousUserId && previousUserId !== userId;
    const firstSyncForDevice = !previousUserId;
    const forceHydrationOnce = consumeForceHydrationFlag();
    const preserveOpsLocal = hasActiveLocalOpsState();
    // Force restore only when user changed; otherwise prefer current local state
    // to avoid overwriting just-saved data with older cloud snapshots on page transitions.
    const shouldForceHydration = userChanged || forceHydrationOnce || firstSyncForDevice;

    if (userChanged) {
      clearSyncedLocalState();
    }
    // Avoid a forced network write on every page navigation (notably unstable on iPhone/Safari during transitions).
    let hydration = { restored: false, reason: "skipped" };
    try {
      hydration = await hydrateCloudState({
        force: shouldForceHydration,
        preserveKeys: preserveOpsLocal ? [OPS_KEY, OPS_ARCHIVE_KEY] : []
      });
      try {
        migrateLocalStorageSchema(localStorage);
      } catch (_) {}
      setLastSyncedUserId(userId);
    } catch (e) {
      setLastSyncedUserId(userId);
      const msg = lockErrorMessage(e) || "クラウド同期に失敗したため、自動復元を中止しました。設定画面から再試行してください。";
      try { alert(msg); } catch (_) {}
      sessionStorage.removeItem(reloadMarker);
      window.tsmsCloud = {
        backupNow: () => requestCloudBackup({ immediate: true }),
        backupDebounced: () => requestCloudBackup({ immediate: false }),
        setSyncPaused: (paused) => setCloudSyncPaused(paused),
        logout: async () => { await supabase.auth.signOut(); redirectToLogin(); },
        safeLogoutWithBackup: async () => {
          await requestCloudBackup({ immediate: true });
          await supabase.auth.signOut();
          redirectToLogin();
        }
      };
      installIdleLogout();
      return;
    }

    if (hydration.restored && !alreadyReloaded) {
      sessionStorage.setItem(reloadMarker, "1");
      location.reload();
      return;
    }

    sessionStorage.removeItem(reloadMarker);
    if (!(await runSubscriptionGate(userId))) return;

    window.tsmsCloud = {
      backupNow: () => requestCloudBackup({ immediate: true }),
      backupDebounced: () => requestCloudBackup({ immediate: false }),
      setSyncPaused: (paused) => setCloudSyncPaused(paused),
      logout: async () => {
        await supabase.auth.signOut();
        redirectToLogin();
      },
      safeLogoutWithBackup: async () => {
        await requestCloudBackup({ immediate: true });
        await supabase.auth.signOut();
        redirectToLogin();
      }
    };
    installIdleLogout();
  } catch (_) {
    redirectToLogin();
  }
}

installSwUpdateUi();
guard();
