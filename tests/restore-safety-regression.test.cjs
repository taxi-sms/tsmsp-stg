const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

class StorageMock {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }
}

function loadCloudStoreModule(payload) {
  const source = read("cloud-store.js")
    .replace(/^import .*;\n/gm, "")
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const wrapped = `${source}\nmodule.exports = { cloudRestore, hydrateCloudState, restoreLocalStorage };`;

  const localStorage = new StorageMock();
  const context = {
    module: { exports: {} },
    exports: {},
    STORAGE_SCHEMA_VERSION_KEY: "tsms_storage_schema_version",
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } } })
      },
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { value: payload, updated_at: "2026-03-15T00:00:00Z" }, error: null })
        };
      }
    },
    localStorage,
    window: { dispatchEvent() {} },
    CustomEvent: function CustomEvent(name, init) {
      return { name, detail: init && init.detail };
    },
    console,
    Storage: function Storage() {}
  };

  vm.runInNewContext(wrapped, context, { filename: "cloud-store.js" });
  return { ...context.module.exports, localStorage };
}

function loadSettingsCore() {
  const source = read("settings-core.js");
  const localStorage = new StorageMock();
  const context = {
    window: {},
    localStorage,
    document: {
      documentElement: { setAttribute() {} },
      querySelector() {
        return { setAttribute() {} };
      }
    },
    Blob: function Blob() {},
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    console
  };

  vm.runInNewContext(source, context, { filename: "settings-core.js" });
  return { core: context.window.tsmsSettingsCore, localStorage };
}

async function testCloudRestorePreservesWorkingState() {
  const payload = {
    tsms_reports: "CLOUD_REPORTS",
    tsms_reports_archive: "CLOUD_ARCHIVE",
    ops: "CLOUD_OPS",
    ops_archive_v1: "CLOUD_OPS_ARCHIVE",
    tsms_settings: "{\"taxRate\":8}",
    tsms_report_current_day: "2026-03-13",
    tsms_theme: "dark",
    tsms_storage_schema_version: "1"
  };
  const { cloudRestore, localStorage } = loadCloudStoreModule(payload);

  localStorage.setItem("tsms_reports", "LOCAL_REPORTS");
  localStorage.setItem("ops", "LOCAL_OPS");
  localStorage.setItem("tsms_report_current_day", "2026-03-15");
  localStorage.setItem("tsms_settings", "{\"taxRate\":10}");

  const res = await cloudRestore();
  assert.strictEqual(res.restoredWorkingState, false);
  assert.strictEqual(localStorage.getItem("tsms_reports"), "LOCAL_REPORTS");
  assert.strictEqual(localStorage.getItem("ops"), "LOCAL_OPS");
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-15");
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("ops_archive_v1"), "CLOUD_OPS_ARCHIVE");
  assert.strictEqual(localStorage.getItem("tsms_settings"), "{\"taxRate\":8}");
}

async function testHydrateCloudStateSkipsWorkingStateByDefault() {
  const payload = {
    tsms_reports: "CLOUD_REPORTS",
    tsms_reports_archive: "CLOUD_ARCHIVE",
    ops: "CLOUD_OPS",
    ops_archive_v1: "CLOUD_OPS_ARCHIVE",
    tsms_settings: "{\"taxRate\":8}",
    tsms_report_current_day: "2026-03-13",
    tsms_theme: "dark",
    tsms_storage_schema_version: "1"
  };
  const { hydrateCloudState, localStorage } = loadCloudStoreModule(payload);

  const res = await hydrateCloudState({ force: true });
  assert.strictEqual(res.restored, true);
  assert.strictEqual(res.restoredWorkingState, false);
  assert.strictEqual(localStorage.getItem("tsms_reports"), null);
  assert.strictEqual(localStorage.getItem("ops"), null);
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), null);
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("ops_archive_v1"), "CLOUD_OPS_ARCHIVE");
}

async function testCloudRestoreCanStillIncludeWorkingStateExplicitly() {
  const payload = {
    tsms_reports: "CLOUD_REPORTS",
    tsms_reports_archive: "CLOUD_ARCHIVE",
    ops: "CLOUD_OPS",
    ops_archive_v1: "CLOUD_OPS_ARCHIVE",
    tsms_settings: "{\"taxRate\":8}",
    tsms_report_current_day: "2026-03-13",
    tsms_theme: "dark",
    tsms_storage_schema_version: "1"
  };
  const { cloudRestore, localStorage } = loadCloudStoreModule(payload);

  await cloudRestore("", { includeWorkingState: true });
  assert.strictEqual(localStorage.getItem("tsms_reports"), "CLOUD_REPORTS");
  assert.strictEqual(localStorage.getItem("ops"), "CLOUD_OPS");
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-13");
}

function testLocalBackupRestorePreservesWorkingState() {
  const { core, localStorage } = loadSettingsCore();
  localStorage.setItem("tsms_reports", "LOCAL_REPORTS");
  localStorage.setItem("ops", "LOCAL_OPS");
  localStorage.setItem("tsms_report_current_day", "2026-03-15");
  localStorage.setItem("tsms_confirm_force_empty", "1");

  core.restoreBackupObject({
    schema: "tsms-backup-v1",
    data: {
      tsms_reports: "CLOUD_REPORTS",
      tsms_reports_archive: "CLOUD_ARCHIVE",
      ops: "CLOUD_OPS",
      tsms_report_current_day: "2026-03-13",
      tsms_confirm_force_empty: "0",
      tsms_settings: "{\"taxRate\":8}",
      tsms_theme: "dark"
    }
  });

  assert.strictEqual(localStorage.getItem("tsms_reports"), "LOCAL_REPORTS");
  assert.strictEqual(localStorage.getItem("ops"), "LOCAL_OPS");
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-15");
  assert.strictEqual(localStorage.getItem("tsms_confirm_force_empty"), "1");
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("tsms_settings"), "{\"taxRate\":8}");
  assert.strictEqual(localStorage.getItem("tsms_theme"), "dark");
}

function testRestoreCopyWarnsWorkingStateIsSkipped() {
  const settings = read("settings.html");
  const backup = read("settings-backup.html");

  assert.match(settings, /作業中の日報・出庫状態は復元しません/);
  assert.match(settings, /クラウド内の当日データ: \$\{res\.reportCount\}件（未復元）/);
  assert.match(backup, /作業中の日報・出庫状態は復元しません/);
  assert.match(backup, /クラウド内の当日データ: \$\{res\.reportCount\}件（未復元）/);
}

async function runTests() {
  const tests = [
    ["クラウド復元の作業中データ保護", testCloudRestorePreservesWorkingState],
    ["自動 hydration の作業中データ保護", testHydrateCloudStateSkipsWorkingStateByDefault],
    ["明示指定時の current 復元許可", testCloudRestoreCanStillIncludeWorkingStateExplicitly],
    ["端末バックアップ復元の作業中データ保護", testLocalBackupRestorePreservesWorkingState],
    ["復元UI文言の警告", testRestoreCopyWarnsWorkingStateIsSkipped]
  ];

  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (err) {
      console.error(`FAIL: ${name}`);
      console.error(err && err.stack ? err.stack : err);
      process.exitCode = 1;
      break;
    }
  }

  if (passed === tests.length) {
    console.log(`OK: ${passed} tests passed.`);
  }
}

runTests();
