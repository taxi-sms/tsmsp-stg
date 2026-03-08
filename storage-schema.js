export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_SCHEMA_VERSION_KEY = "tsms_storage_schema_version";
export const STORAGE_SCHEMA_BACKUP_KEY = "tsms_storage_schema_backup_v1";

const SETTINGS_DEFAULTS = {
  taxRate: 10,
  feeRate: 4,
  goFeeYen: 100,
  walkRate: 50,
  closeStartDay: 16,
  closeEndDay: 15,
  shiftNote: ""
};

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function sanitizeJsonArray(raw) {
  const parsed = parseJson(raw, []);
  const out = Array.isArray(parsed) ? parsed : [];
  return JSON.stringify(out);
}

function sanitizeJsonObject(raw) {
  const parsed = parseJson(raw, {});
  const out = isPlainObject(parsed) ? parsed : {};
  return JSON.stringify(out);
}

function sanitizeSettings(raw) {
  const parsed = parseJson(raw, {});
  const out = isPlainObject(parsed) ? Object.assign({}, SETTINGS_DEFAULTS, parsed) : Object.assign({}, SETTINGS_DEFAULTS);
  return JSON.stringify(out);
}

function sanitizeHoliday(raw) {
  const parsed = parseJson(raw, {});
  const obj = isPlainObject(parsed) ? parsed : {};
  const map = isPlainObject(obj.map) ? obj.map : {};
  const fetchedAt = Number(obj.fetchedAt || 0);
  const out = {
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : 0,
    map
  };
  return JSON.stringify(out);
}

function sanitizeSupabaseConfig(raw) {
  const parsed = parseJson(raw, {});
  const obj = isPlainObject(parsed) ? parsed : {};
  const out = Object.assign({}, obj, {
    url: String(obj.url || "").trim(),
    anonKey: String(obj.anonKey || "").trim()
  });
  return JSON.stringify(out);
}

function sanitizeTheme(raw) {
  return raw === "dark" ? "dark" : "light";
}

function sanitizeForceEmpty(raw) {
  return raw === "1" ? "1" : null;
}

function sanitizeManualMode(raw) {
  return raw === "1" ? "1" : "0";
}

function sanitizeAsString(raw) {
  return String(raw == null ? "" : raw);
}

function sanitizeByKey(key, raw) {
  switch (key) {
    case "tsms_reports":
    case "tsms_reports_archive":
      return sanitizeJsonArray(raw);
    case "ops":
    case "ops_archive_v1":
    case "tsms_sales_plan":
    case "tsms_sales_manual_v1":
      return sanitizeJsonObject(raw);
    case "tsms_settings":
      return sanitizeSettings(raw);
    case "tsms_holidays_jp_v1":
      return sanitizeHoliday(raw);
    case "tsms_supabase_config":
      return sanitizeSupabaseConfig(raw);
    case "tsms_theme":
      return sanitizeTheme(raw);
    case "tsms_confirm_force_empty":
      return sanitizeForceEmpty(raw);
    case "tsms_sales_manual_mode":
      return sanitizeManualMode(raw);
    case "tsms_sales_reset_token":
    case "tsms_report_current_day":
    case "tsms_report_field_settings":
    case "ops_sync_rev_v1":
    case "tsms_cloud_last_success_at":
    case "tsms_cloud_last_failure_at":
    case "tsms_last_sync_user_id":
      return key === "tsms_report_field_settings" ? sanitizeJsonObject(raw) : sanitizeAsString(raw);
    default:
      return raw;
  }
}

function getMigrationKeys() {
  return [
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
    "tsms_confirm_force_empty",
    "tsms_holidays_jp_v1",
    "tsms_theme",
    "tsms_supabase_config",
    "ops_sync_rev_v1",
    "tsms_cloud_last_success_at",
    "tsms_cloud_last_failure_at",
    "tsms_last_sync_user_id"
  ];
}

export function migrateLocalStorageSchema(storage = localStorage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { migrated: false, changedKeys: [], version: 0 };
  }

  const currentVersion = Number(storage.getItem(STORAGE_SCHEMA_VERSION_KEY) || 0);
  if (currentVersion >= STORAGE_SCHEMA_VERSION) {
    return { migrated: false, changedKeys: [], version: currentVersion };
  }

  const changedKeys = [];
  const before = {};
  const keys = getMigrationKeys();

  keys.forEach((key) => {
    const raw = storage.getItem(key);
    if (raw == null) return;
    const sanitized = sanitizeByKey(key, raw);
    if (sanitized === null) {
      before[key] = raw;
      storage.removeItem(key);
      changedKeys.push(key);
      return;
    }
    if (sanitized !== raw) {
      before[key] = raw;
      storage.setItem(key, sanitized);
      changedKeys.push(key);
    }
  });

  if (changedKeys.length) {
    const backup = {
      fromVersion: currentVersion,
      toVersion: STORAGE_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
      before
    };
    storage.setItem(STORAGE_SCHEMA_BACKUP_KEY, JSON.stringify(backup));
  }

  storage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(STORAGE_SCHEMA_VERSION));
  return {
    migrated: true,
    changedKeys,
    version: STORAGE_SCHEMA_VERSION
  };
}
