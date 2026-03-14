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

function createSupabaseMock(initialRows = {}) {
  const store = new Map();
  Object.entries(initialRows).forEach(([key, value]) => {
    store.set(key, {
      key,
      value,
      updated_at: "2026-03-15T00:00:00Z"
    });
  });

  function filterRows(filters) {
    let rows = Array.from(store.values());
    filters.forEach((filter) => {
      if (filter.type === "eq") {
        rows = rows.filter((row) => String(row[filter.field] || "") === String(filter.value));
      } else if (filter.type === "like") {
        const prefix = String(filter.value || "").replace(/%+$/g, "");
        rows = rows.filter((row) => String(row[filter.field] || "").startsWith(prefix));
      }
    });
    return rows;
  }

  function createSelectBuilder() {
    const filters = [];
    let orderBy = null;

    const builder = {
      select() {
        return builder;
      },
      eq(field, value) {
        filters.push({ type: "eq", field, value });
        return builder;
      },
      like(field, value) {
        filters.push({ type: "like", field, value });
        return builder;
      },
      order(field, options = {}) {
        orderBy = { field, ascending: options.ascending !== false };
        return builder;
      },
      async maybeSingle() {
        const rows = filterRows(filters);
        if (!rows.length) return { data: null, error: null };
        const data = rows[0];
        return { data: { value: data.value, updated_at: data.updated_at }, error: null };
      },
      then(resolve, reject) {
        let rows = filterRows(filters);
        if (orderBy) {
          rows.sort((a, b) => {
            const left = String(a[orderBy.field] || "");
            const right = String(b[orderBy.field] || "");
            return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        const data = rows.map((row) => ({ key: row.key, updated_at: row.updated_at }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };

    return builder;
  }

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } })
    },
    from(name) {
      assert.strictEqual(name, "app_state");
      return {
        select() {
          return createSelectBuilder();
        },
        upsert(row) {
          store.set(row.key, {
            key: row.key,
            value: row.value,
            updated_at: row.updated_at || "2026-03-15T00:00:00Z"
          });
          return {
            select() {
              return {
                maybeSingle: async () => ({
                  data: { updated_at: row.updated_at || "2026-03-15T00:00:00Z" },
                  error: null
                })
              };
            }
          };
        },
        insert(row) {
          const rows = Array.isArray(row) ? row : [row];
          rows.forEach((item) => {
            store.set(item.key, {
              key: item.key,
              value: item.value,
              updated_at: item.updated_at || "2026-03-15T00:00:00Z"
            });
          });
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          return {
            in(field, values) {
              assert.strictEqual(field, "key");
              (values || []).forEach((value) => store.delete(value));
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    },
    _store: store
  };
}

function loadCloudStoreModule(initialRows = {}) {
  const source = read("cloud-store.js")
    .replace(/^import .*;\n/gm, "")
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const wrapped = `${source}\nmodule.exports = { cloudBackup, cloudRestore, cloudRestoreWorkingState, hydrateCloudState, restoreLocalStorage };`;

  const localStorage = new StorageMock();
  const supabase = createSupabaseMock(initialRows);
  const context = {
    module: { exports: {} },
    exports: {},
    STORAGE_SCHEMA_VERSION_KEY: "tsms_storage_schema_version",
    supabase,
    localStorage,
    window: { dispatchEvent() {} },
    CustomEvent: function CustomEvent(name, init) {
      return { name, detail: init && init.detail };
    },
    console,
    Storage: function Storage() {},
    location: { pathname: "/settings-backup.html" },
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(wrapped, context, { filename: "cloud-store.js" });
  return { ...context.module.exports, localStorage, supabase };
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

async function testCloudBackupSplitsSafeAndWorkingSnapshots() {
  const { cloudBackup, localStorage, supabase } = loadCloudStoreModule();
  localStorage.setItem("tsms_reports", JSON.stringify([{ id: "r1" }]));
  localStorage.setItem("ops", JSON.stringify({ dayId: "2026-03-15", departAt: "2026-03-15T00:00:00Z" }));
  localStorage.setItem("tsms_report_current_day", "2026-03-15");
  localStorage.setItem("tsms_confirm_force_empty", "1");
  localStorage.setItem("tsms_reports_archive", JSON.stringify([{ id: "a1" }]));
  localStorage.setItem("tsms_settings", "{\"taxRate\":8}");
  localStorage.setItem("tsms_theme", "dark");
  localStorage.setItem("tsms_storage_schema_version", "1");

  const res = await cloudBackup();
  const safe = supabase._store.get("localStorage_dump_v1").value;
  const working = supabase._store.get("localStorage_working_v1").value;

  assert.strictEqual(res.reportCount, 1);
  assert.strictEqual(res.archiveCount, 1);
  assert.strictEqual(res.currentDayId, "2026-03-15");
  assert.strictEqual(safe.tsms_reports, undefined);
  assert.strictEqual(safe.ops, undefined);
  assert.strictEqual(safe.tsms_report_current_day, undefined);
  assert.strictEqual(safe.tsms_reports_archive, JSON.stringify([{ id: "a1" }]));
  assert.strictEqual(safe.tsms_settings, "{\"taxRate\":8}");
  assert.strictEqual(working.tsms_reports, JSON.stringify([{ id: "r1" }]));
  assert.strictEqual(working.tsms_report_current_day, "2026-03-15");
  assert.strictEqual(working.tsms_confirm_force_empty, "1");
}

async function testCloudBackupBlocksOlderSafeSnapshot() {
  const { cloudBackup, localStorage } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: JSON.stringify([{ id: "a1" }, { id: "a2" }]),
      ops_archive_v1: JSON.stringify({ "2026-03-13": { dayId: "2026-03-13" } }),
      tsms_settings: "{\"taxRate\":8}"
    },
    localStorage_working_v1: {}
  });

  localStorage.setItem("tsms_reports_archive", JSON.stringify([{ id: "a1" }]));
  localStorage.setItem("ops_archive_v1", JSON.stringify({}));
  localStorage.setItem("tsms_settings", "{\"taxRate\":10}");

  await assert.rejects(
    () => cloudBackup(),
    /締め済み履歴/
  );
}

async function testCloudBackupBlocksEmptyWorkingOverwrite() {
  const { cloudBackup, localStorage } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: JSON.stringify([]),
      ops_archive_v1: JSON.stringify({}),
      tsms_settings: "{\"taxRate\":8}"
    },
    localStorage_working_v1: {
      tsms_reports: JSON.stringify([{ id: "r1" }]),
      ops: JSON.stringify({ dayId: "2026-03-15", departAt: "2026-03-15T00:00:00Z" }),
      tsms_report_current_day: "2026-03-15",
      tsms_working_last_mutation_at: "2026-03-15T00:00:00.000Z"
    }
  });

  localStorage.setItem("tsms_reports_archive", JSON.stringify([]));
  localStorage.setItem("ops_archive_v1", JSON.stringify({}));
  localStorage.setItem("tsms_settings", "{\"taxRate\":10}");

  await assert.rejects(
    () => cloudBackup(),
    /作業中データ/
  );
}

async function testCloudBackupAllowsNewerEmptyWorkingAfterClear() {
  const { cloudBackup, localStorage, supabase } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: JSON.stringify([{ id: "a1" }]),
      ops_archive_v1: JSON.stringify({}),
      tsms_settings: "{\"taxRate\":8}"
    },
    localStorage_working_v1: {
      tsms_reports: JSON.stringify([{ id: "r1" }]),
      ops: JSON.stringify({ dayId: "2026-03-15", departAt: "2026-03-15T00:00:00Z" }),
      tsms_report_current_day: "2026-03-15",
      tsms_confirm_force_empty: "0",
      tsms_working_last_mutation_at: "2026-03-15T00:00:00.000Z"
    }
  });

  localStorage.setItem("tsms_reports_archive", JSON.stringify([{ id: "a1" }, { id: "a2" }]));
  localStorage.setItem("ops_archive_v1", JSON.stringify({ "2026-03-15": { dayId: "2026-03-15" } }));
  localStorage.setItem("tsms_settings", "{\"taxRate\":10}");
  localStorage.setItem("tsms_confirm_force_empty", "1");
  localStorage.setItem("tsms_working_last_mutation_at", "2026-03-15T00:10:00.000Z");

  const res = await cloudBackup();
  const working = supabase._store.get("localStorage_working_v1").value;

  assert.strictEqual(res.workingReportCount, 0);
  assert.strictEqual(working.tsms_reports, undefined);
  assert.strictEqual(working.tsms_confirm_force_empty, "1");
}

async function testCloudRestorePreservesWorkingState() {
  const { cloudRestore, localStorage } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: "CLOUD_ARCHIVE",
      ops_archive_v1: "CLOUD_OPS_ARCHIVE",
      tsms_settings: "{\"taxRate\":8}",
      tsms_theme: "dark"
    },
    localStorage_working_v1: {
      tsms_reports: JSON.stringify([{ id: "r1" }]),
      ops: JSON.stringify({ dayId: "2026-03-13", departAt: "2026-03-13T00:00:00Z" }),
      tsms_report_current_day: "2026-03-13"
    }
  });

  localStorage.setItem("tsms_reports", "LOCAL_REPORTS");
  localStorage.setItem("ops", "LOCAL_OPS");
  localStorage.setItem("tsms_report_current_day", "2026-03-15");
  localStorage.setItem("tsms_settings", "{\"taxRate\":10}");

  const res = await cloudRestore();
  assert.strictEqual(res.restoredWorkingState, false);
  assert.strictEqual(res.workingReportCount, 1);
  assert.strictEqual(res.workingCurrentDayId, "2026-03-13");
  assert.strictEqual(localStorage.getItem("tsms_reports"), "LOCAL_REPORTS");
  assert.strictEqual(localStorage.getItem("ops"), "LOCAL_OPS");
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-15");
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("ops_archive_v1"), "CLOUD_OPS_ARCHIVE");
  assert.strictEqual(localStorage.getItem("tsms_settings"), "{\"taxRate\":8}");
}

async function testCloudRestoreWorkingStateLoadsDedicatedSnapshot() {
  const { cloudRestoreWorkingState, localStorage } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: "CLOUD_ARCHIVE",
      tsms_settings: "{\"taxRate\":8}"
    },
    localStorage_working_v1: {
      tsms_reports: JSON.stringify([{ id: "r1" }]),
      ops: JSON.stringify({ dayId: "2026-03-13", departAt: "2026-03-13T00:00:00Z" }),
      tsms_report_current_day: "2026-03-13"
    }
  });

  await cloudRestoreWorkingState();
  assert.strictEqual(localStorage.getItem("tsms_reports"), JSON.stringify([{ id: "r1" }]));
  assert.strictEqual(localStorage.getItem("ops"), JSON.stringify({ dayId: "2026-03-13", departAt: "2026-03-13T00:00:00Z" }));
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-13");
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
}

async function testHydrateCloudStateSkipsWorkingStateByDefault() {
  const { hydrateCloudState, localStorage } = loadCloudStoreModule({
    localStorage_dump_v1: {
      tsms_reports_archive: "CLOUD_ARCHIVE",
      ops_archive_v1: "CLOUD_OPS_ARCHIVE",
      tsms_settings: "{\"taxRate\":8}",
      tsms_theme: "dark"
    },
    localStorage_working_v1: {
      tsms_reports: JSON.stringify([{ id: "r1" }]),
      ops: JSON.stringify({ dayId: "2026-03-13", departAt: "2026-03-13T00:00:00Z" }),
      tsms_report_current_day: "2026-03-13"
    }
  });

  const res = await hydrateCloudState({ force: true });
  assert.strictEqual(res.restored, true);
  assert.strictEqual(res.restoredWorkingState, false);
  assert.strictEqual(res.workingCurrentDayId, "");
  assert.strictEqual(localStorage.getItem("tsms_reports"), null);
  assert.strictEqual(localStorage.getItem("ops"), null);
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), null);
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("ops_archive_v1"), "CLOUD_OPS_ARCHIVE");
}

function testLocalBackupRestorePreservesWorkingState() {
  const { core, localStorage } = loadSettingsCore();
  localStorage.setItem("tsms_reports", "LOCAL_REPORTS");
  localStorage.setItem("ops", "LOCAL_OPS");
  localStorage.setItem("tsms_report_current_day", "2026-03-15");
  localStorage.setItem("tsms_confirm_force_empty", "1");
  localStorage.setItem("ops_sync_rev_v1", "LOCAL_SYNC_REV");

  core.restoreBackupObject({
    schema: "tsms-backup-v1",
    data: {
      tsms_reports: "CLOUD_REPORTS",
      tsms_reports_archive: "CLOUD_ARCHIVE",
      ops: "CLOUD_OPS",
      tsms_report_current_day: "2026-03-13",
      tsms_confirm_force_empty: "0",
      ops_sync_rev_v1: "CLOUD_SYNC_REV",
      tsms_settings: "{\"taxRate\":8}",
      tsms_theme: "dark"
    }
  });

  assert.strictEqual(localStorage.getItem("tsms_reports"), "LOCAL_REPORTS");
  assert.strictEqual(localStorage.getItem("ops"), "LOCAL_OPS");
  assert.strictEqual(localStorage.getItem("tsms_report_current_day"), "2026-03-15");
  assert.strictEqual(localStorage.getItem("tsms_confirm_force_empty"), "1");
  assert.strictEqual(localStorage.getItem("ops_sync_rev_v1"), "LOCAL_SYNC_REV");
  assert.strictEqual(localStorage.getItem("tsms_reports_archive"), "CLOUD_ARCHIVE");
  assert.strictEqual(localStorage.getItem("tsms_settings"), "{\"taxRate\":8}");
  assert.strictEqual(localStorage.getItem("tsms_theme"), "dark");
}

function testRestoreCopyWarnsAndExposesTakeover() {
  const settings = read("settings.html");
  const backup = read("settings-backup.html");

  assert.match(settings, /id="btnCloudTakeover"/);
  assert.match(settings, /作業中のデータを別端末に引き継ぐ場合等に使用する機能です。その必要がない場合は使用しないでください。データを読み込みますか？/);
  assert.match(settings, /クラウド内の当日データ: \$\{res\.workingReportCount\}件（未復元）/);
  assert.match(settings, /作業中データを読み込みました。画面を再読み込みします/);
  assert.match(backup, /id="btnCloudTakeover"/);
  assert.match(backup, /作業中のデータを別端末に引き継ぐ場合等に使用する機能です。その必要がない場合は使用しないでください。データを読み込みますか？/);
  assert.match(backup, /クラウド内の当日データ: \$\{res\.workingReportCount\}件（未復元）/);
  assert.match(backup, /作業中データを読み込みました。画面を再読み込みします/);
}

async function runTests() {
  const tests = [
    ["クラウド保存の current 分離", testCloudBackupSplitsSafeAndWorkingSnapshots],
    ["クラウド保存の safe 上書きガード", testCloudBackupBlocksOlderSafeSnapshot],
    ["クラウド保存の empty working 上書きガード", testCloudBackupBlocksEmptyWorkingOverwrite],
    ["締め直後の空 working 保存許可", testCloudBackupAllowsNewerEmptyWorkingAfterClear],
    ["クラウド復元の作業中データ保護", testCloudRestorePreservesWorkingState],
    ["専用引き継ぎで current 復元", testCloudRestoreWorkingStateLoadsDedicatedSnapshot],
    ["自動 hydration の作業中データ保護", testHydrateCloudStateSkipsWorkingStateByDefault],
    ["端末バックアップ復元の作業中データ保護", testLocalBackupRestorePreservesWorkingState],
    ["復元UI文言と引き継ぎボタン", testRestoreCopyWarnsAndExposesTakeover]
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
