const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const SETTINGS_JS = path.join(ROOT, "report-field-settings.js");
const REPORT_HTML = path.join(ROOT, "report.html");
const SETTINGS2_HTML = path.join(ROOT, "settings2.html");

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    }
  };
}

function loadSettingsApi(seed = {}) {
  const script = fs.readFileSync(SETTINGS_JS, "utf8");
  const localStorage = createStorage(seed);
  const sandbox = {
    localStorage,
    window: {}
  };
  sandbox.window.localStorage = localStorage;
  vm.runInNewContext(script, sandbox, { filename: "report-field-settings.js" });
  return sandbox.window.tsmsReportFieldSettings;
}

function testRuntimeKeepsTicketBeforeOther() {
  const api = loadSettingsApi();
  const runtime = api.runtime();
  assert.deepStrictEqual(
    Array.from(runtime.payOptions),
    ["現金", "QR", "クレカ", "電子M", "GO Pay", "乗込GO Pay", "チケット他", "その他"]
  );
  assert.deepStrictEqual(
    Array.from(runtime.payPrimaryFlags, (flag) => `${flag.cash ? 1 : 0}${flag.credit ? 1 : 0}`),
    ["10", "01", "01", "01", "01", "01"]
  );
  assert.deepStrictEqual(
    Array.from(runtime.payOtherFlags, (flag) => `${flag.cash ? 1 : 0}${flag.credit ? 1 : 0}`),
    ["01", "01", "01", "01", "01", "01", "01", "01"]
  );
}

function testSaveKeepsFixedPayOptions() {
  const api = loadSettingsApi();
  api.save({
    payPrimary: ["現", "QR決済", "カード", "電マネ", "GO", "乗込GO"],
    payPrimaryFlags: [
      { cash: true, credit: false },
      { cash: true, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true }
    ],
    payOther: ["追加1", "追加2", "追加3", "追加4", "追加5", "追加6", "追加7", "追加8"],
    payOtherFlags: [
      { cash: true, credit: false },
      { cash: false, credit: true },
      { cash: true, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true }
    ]
  });

  const runtime = api.runtime();
  assert.deepStrictEqual(
    Array.from(runtime.payOptions),
    ["現", "QR決済", "カード", "電マネ", "GO", "乗込GO", "チケット他", "その他"]
  );
  assert.deepStrictEqual(
    Array.from(runtime.payPrimaryFlags, (flag) => `${flag.cash ? 1 : 0}${flag.credit ? 1 : 0}`),
    ["10", "11", "01", "01", "01", "01"]
  );
  assert.deepStrictEqual(
    Array.from(runtime.payOtherFlags, (flag) => `${flag.cash ? 1 : 0}${flag.credit ? 1 : 0}`),
    ["10", "01", "11", "01", "01", "01", "01", "01"]
  );
}

function testHtmlReflectsFixedTicketOption() {
  const reportHtml = fs.readFileSync(REPORT_HTML, "utf8");
  const settings2Html = fs.readFileSync(SETTINGS2_HTML, "utf8");

  assert.match(
    reportHtml,
    /payOptions:\s*\["現金", "QR", "クレカ", "電子M", "GO Pay", "乗込GO Pay", "チケット他", "その他"\]/
  );
  assert.match(settings2Html, /7番目は固定で「チケット他」、8番目は固定で「その他」/);
  assert.match(settings2Html, /現収/);
  assert.match(settings2Html, /未収/);
}

function runTests() {
  const tests = [
    ["支払方法固定順", testRuntimeKeepsTicketBeforeOther],
    ["保存後もチケット他固定", testSaveKeepsFixedPayOptions],
    ["HTML反映", testHtmlReflectsFixedTicketOption]
  ];

  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
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
