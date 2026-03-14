import { supabase } from "./supabase-client.js";
import { STORAGE_SCHEMA_VERSION_KEY } from "./storage-schema.js";

const CLOUD_KEY = "localStorage_dump_v1";
const CLOUD_HISTORY_PREFIX = `${CLOUD_KEY}:history:`;
const CLOUD_HISTORY_KEEP_COUNT = 30;
const LAST_SYNC_USER_KEY = "tsms_last_sync_user_id";
const CLOUD_LAST_SUCCESS_AT_KEY = "tsms_cloud_last_success_at";
const CLOUD_LAST_FAILURE_AT_KEY = "tsms_cloud_last_failure_at";
const SAFE_RESTORE_PRESERVE_KEYS = [
  "tsms_reports",
  "ops",
  "tsms_report_current_day"
];
const SYNC_KEYS = [
  "tsms_reports",
  "tsms_reports_archive",
  "ops",
  "ops_archive_v1",
  "tsms_settings",
  "tsms_sales_plan",
  "tsms_sales_manual_v1",
  "tsms_sales_manual_mode",
  "tsms_sales_reset_token",
  "tsms_report_current_day",
  "tsms_report_field_settings",
  "tsms_holidays_jp_v1",
  "tsms_theme",
  STORAGE_SCHEMA_VERSION_KEY
];

let autoSyncInstalled = false;
let debounceMs = 5000;
let debounceTimer = null;
let inFlight = false;
let pendingAfterFlight = false;
let dirtySinceLastBackup = false;
let syncPaused = false;
let inFlightPromise = null;

function publishSyncStatus(status, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent("tsms-cloud-sync-status", {
      detail: { status, ...detail }
    }));
  } catch (_) {}
}

function markSyncSuccess(at = new Date().toISOString()) {
  try {
    localStorage.setItem(CLOUD_LAST_SUCCESS_AT_KEY, String(at));
  } catch (_) {}
  publishSyncStatus("success", { at: String(at) });
}

function markSyncFailure(err, at = new Date().toISOString()) {
  try {
    localStorage.setItem(CLOUD_LAST_FAILURE_AT_KEY, String(at));
  } catch (_) {}
  publishSyncStatus("failure", {
    at: String(at),
    message: err instanceof Error ? err.message : String(err || "")
  });
}

function currentPageName() {
  try {
    const p = (location.pathname || "").split("/").pop();
    return p || "index.html";
  } catch (_) {
    return "";
  }
}

function shouldFlushOnPageLeave() {
  const page = currentPageName();
  return page === "confirm.html" || page === "sales.html" || page === "ops.html";
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function summarizePayload(payload) {
  const keys = Object.keys(payload || {});
  const reports = safeJsonParse(payload?.tsms_reports || "[]", []);
  const archive = safeJsonParse(payload?.tsms_reports_archive || "[]", []);
  return {
    keyCount: keys.length,
    keys,
    reportCount: Array.isArray(reports) ? reports.length : 0,
    archiveCount: Array.isArray(archive) ? archive.length : 0,
    currentDayId: String(payload?.tsms_report_current_day || "")
  };
}

async function getCurrentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return String(data?.user?.id || "");
  } catch (_) {
    return "";
  }
}

function buildHistoryKey() {
  const iso = new Date().toISOString().replace(/[^\dTZ]/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${CLOUD_HISTORY_PREFIX}${iso}_${rand}`;
}

async function pruneCloudHistory() {
  const { data, error } = await supabase
    .from("app_state")
    .select("key,updated_at")
    .like("key", `${CLOUD_HISTORY_PREFIX}%`)
    .order("updated_at", { ascending: false });

  if (error || !Array.isArray(data)) return;
  if (data.length <= CLOUD_HISTORY_KEEP_COUNT) return;

  const staleKeys = data.slice(CLOUD_HISTORY_KEEP_COUNT).map((x) => x.key).filter(Boolean);
  if (!staleKeys.length) return;
  await supabase.from("app_state").delete().in("key", staleKeys);
}

function shouldIncludeKey(key, prefix = "") {
  if (!key) return false;
  if (prefix) return key.startsWith(prefix);
  return SYNC_KEYS.includes(key);
}

export function dumpLocalStorage(prefix = "") {
  const obj = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (shouldIncludeKey(k, prefix)) obj[k] = localStorage.getItem(k);
  }
  return obj;
}

export function restoreLocalStorage(obj, prefix = "", options = {}) {
  const preserveKeys = new Set(Array.isArray(options.preserveKeys) ? options.preserveKeys : []);
  if (prefix) {
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !preserveKeys.has(k)) remove.push(k);
    }
    remove.forEach((k) => localStorage.removeItem(k));
  } else {
    SYNC_KEYS.forEach((k) => {
      if (!preserveKeys.has(k)) localStorage.removeItem(k);
    });
  }

  for (const [k, v] of Object.entries(obj || {})) {
    if (!shouldIncludeKey(k, prefix)) continue;
    if (preserveKeys.has(k)) continue;
    localStorage.setItem(k, v == null ? "" : String(v));
  }
}

function buildRestorePreserveKeys(prefix = "", preserveKeys = [], includeWorkingState = false) {
  const merged = new Set(Array.isArray(preserveKeys) ? preserveKeys : []);
  if (!prefix && !includeWorkingState) {
    SAFE_RESTORE_PRESERVE_KEYS.forEach((key) => merged.add(key));
  }
  return Array.from(merged);
}

export async function cloudBackup(prefix = "") {
  try {
    const payload = dumpLocalStorage(prefix);
    const summary = summarizePayload(payload);
    const userId = await getCurrentUserId();
    const historyKey = buildHistoryKey();

    const { data, error } = await supabase
      .from("app_state")
      .upsert(
        { key: CLOUD_KEY, value: payload, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      )
      .select("updated_at")
      .maybeSingle();

    if (error) throw error;

    // Keep historical snapshots for rollback; best effort and non-blocking for the main backup.
    try {
      await supabase
        .from("app_state")
        .insert({ key: historyKey, value: payload, updated_at: new Date().toISOString() });
      await pruneCloudHistory();
    } catch (_) {}

    const updatedAt = data?.updated_at || new Date().toISOString();
    markSyncSuccess(updatedAt);

    return {
      userId,
      ...summary,
      updatedAt,
      historyKey,
      historyKeepCount: CLOUD_HISTORY_KEEP_COUNT
    };
  } catch (error) {
    markSyncFailure(error);
    throw error;
  }
}

export async function cloudRestore(prefix = "", options = {}) {
  try {
    const includeWorkingState = !!options.includeWorkingState;
    const preserveKeys = buildRestorePreserveKeys(prefix, options.preserveKeys, includeWorkingState);
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("app_state")
      .select("value,updated_at")
      .eq("key", CLOUD_KEY)
      .maybeSingle();

    if (error) throw error;
    if (!data?.value) throw new Error("クラウドにバックアップがありません。先にバックアップしてね。");

    restoreLocalStorage(data.value, prefix, { preserveKeys });
    markSyncSuccess(data?.updated_at || new Date().toISOString());
    return {
      userId,
      ...summarizePayload(data.value),
      updatedAt: data?.updated_at || "",
      preservedKeys: preserveKeys,
      restoredWorkingState: includeWorkingState
    };
  } catch (error) {
    markSyncFailure(error);
    throw error;
  }
}

export function clearSyncedLocalState(prefix = "") {
  restoreLocalStorage({}, prefix);
}

function hasLocalSyncedKeys(prefix = "") {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (shouldIncludeKey(key, prefix)) return true;
  }
  return false;
}

export async function hydrateCloudState({ force = false, prefix = "", preserveKeys = [], includeWorkingState = false } = {}) {
  if (!force && hasLocalSyncedKeys(prefix)) {
    return { restored: false, reason: "local_data_exists" };
  }
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", CLOUD_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data?.value || typeof data.value !== "object") {
    return { restored: false, reason: "cloud_data_missing" };
  }

  const mergedPreserveKeys = buildRestorePreserveKeys(prefix, preserveKeys, includeWorkingState);
  restoreLocalStorage(data.value, prefix, { preserveKeys: mergedPreserveKeys });
  return {
    restored: true,
    reason: "restored",
    preservedKeys: mergedPreserveKeys,
    restoredWorkingState: !!includeWorkingState
  };
}

export function getLastSyncedUserId() {
  return localStorage.getItem(LAST_SYNC_USER_KEY) || "";
}

export function setLastSyncedUserId(userId) {
  if (!userId) {
    localStorage.removeItem(LAST_SYNC_USER_KEY);
    return;
  }
  localStorage.setItem(LAST_SYNC_USER_KEY, String(userId));
}

async function runBackup() {
  if (inFlight) {
    pendingAfterFlight = true;
    return inFlightPromise || Promise.resolve();
  }

  inFlight = true;
  inFlightPromise = (async () => {
    try {
      await cloudBackup();
      dirtySinceLastBackup = false;
    } catch (error) {
      // Non-blocking autosave: keep the app usable, but surface the failure to the UI.
      console.error("cloud_backup_failed", error);
    } finally {
      inFlight = false;
      inFlightPromise = null;
      if (pendingAfterFlight) {
        pendingAfterFlight = false;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          runBackup();
        }, debounceMs);
      }
    }
  })();
  return inFlightPromise;
}

export function setCloudSyncPaused(paused) {
  syncPaused = !!paused;
}

export function requestCloudBackup({ immediate = false } = {}) {
  if (immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return (async () => {
      await runBackup();
      if (dirtySinceLastBackup || pendingAfterFlight) {
        pendingAfterFlight = false;
        await runBackup();
      }
    })();
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBackup();
  }, debounceMs);

  return Promise.resolve();
}

export function ensureCloudSyncRuntime({ debounce = 5000 } = {}) {
  debounceMs = Math.max(1000, Number(debounce) || 5000);
  if (autoSyncInstalled) return;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const result = originalSetItem.call(this, key, value);
    if (!syncPaused && this === localStorage && shouldIncludeKey(String(key || ""))) {
      dirtySinceLastBackup = true;
      requestCloudBackup({ immediate: false });
    }
    return result;
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const result = originalRemoveItem.call(this, key);
    if (!syncPaused && this === localStorage && shouldIncludeKey(String(key || ""))) {
      dirtySinceLastBackup = true;
      requestCloudBackup({ immediate: false });
    }
    return result;
  };

  Storage.prototype.clear = function patchedClear() {
    const hadAny = SYNC_KEYS.some((k) => this.getItem(k) !== null);
    const result = originalClear.call(this);
    if (!syncPaused && this === localStorage && hadAny) {
      dirtySinceLastBackup = true;
      requestCloudBackup({ immediate: false });
    }
    return result;
  };

  const flushIfNeeded = () => {
    if (!shouldFlushOnPageLeave()) return;
    if (syncPaused || !dirtySinceLastBackup) return;
    requestCloudBackup({ immediate: true });
  };
  window.addEventListener("pagehide", flushIfNeeded);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushIfNeeded();
  });

  autoSyncInstalled = true;
}
