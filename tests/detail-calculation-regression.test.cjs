const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const DETAIL_HTML = path.join(ROOT, "detail.html");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCalculationScript(html) {
  const re = /<script>\s*\(function\(\)\{\s*const REPORT_KEY[\s\S]*?setInterval\(render, 1000\);\s*\}\)\(\);\s*<\/script>/;
  const m = html.match(re);
  if (!m) throw new Error("detail.html から計算スクリプトを抽出できませんでした。");
  return m[0].replace(/^<script>\s*/, "").replace(/\s*<\/script>$/, "");
}

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    }
  };
}

function createDocument() {
  const elements = new Map();

  function ensureElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        innerHTML: "",
        value: "",
        children: [],
        listeners: {},
        addEventListener(type, handler) {
          this.listeners[type] = handler;
        },
        appendChild(node) {
          this.children.push(node);
        }
      });
    }
    return elements.get(id);
  }

  return {
    getElementById(id) {
      return ensureElement(id);
    },
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
        value: "",
        textContent: ""
      };
    },
    _elements: elements
  };
}

function createFixedDateClass(fixedIso) {
  const RealDate = Date;
  const fixedMs = new RealDate(fixedIso).getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedMs;
    }
  }
  return FixedDate;
}

function extractRenderedValue(html, label) {
  const re = new RegExp(
    `<div class="k">${escapeRegExp(label)}<\\/div><div class="v(?: value-highlight)?">([\\s\\S]*?)<\\/div>`,
    "u"
  );
  const m = html.match(re);
  if (!m) throw new Error(`ラベル "${label}" の描画値を取得できませんでした。`);
  return String(m[1] || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function runDetailScript({ fixedNowIso, storageSeed }) {
  const html = fs.readFileSync(DETAIL_HTML, "utf8");
  const script = extractCalculationScript(html);
  const document = createDocument();
  const localStorage = createLocalStorage(storageSeed);

  const sandbox = {
    console,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Date: createFixedDateClass(fixedNowIso),
    localStorage,
    document,
    setInterval() {
      return 1;
    },
    clearInterval() {}
  };

  vm.runInNewContext(script, sandbox, { filename: "detail-calc-inline.js" });

  return {
    timeHtml: document.getElementById("timeBox").innerHTML,
    salesHtml: document.getElementById("salesBox").innerHTML,
    goHtml: document.getElementById("goBox").innerHTML
  };
}

function testStandardDailySummary() {
  const day = "2026-03-01";
  const rendered = runDetailScript({
    fixedNowIso: "2026-03-01T12:00:00+09:00",
    storageSeed: {
      tsms_report_current_day: day,
      tsms_reports: JSON.stringify([
        { dayId: day, rideType: "GO", payMethod: "現金", cash: 1000, credit: 0 },
        { dayId: day, rideType: "通常", payMethod: "クレカ", cash: 2000, credit: 500 }
      ]),
      tsms_reports_archive: JSON.stringify([
        { dayId: day, rideType: "GO", payMethod: "GO Pay", cash: 0, credit: 3000 },
        { dayId: day, rideType: "GO", payMethod: "乗込GO Pay", cash: 400, credit: 0 }
      ]),
      ops: JSON.stringify({
        dayId: day,
        departAt: "2026-03-01T09:00:00+09:00",
        returnAt: "2026-03-01T18:00:00+09:00",
        breakSessions: [{ minutes: 60 }]
      }),
      tsms_settings: JSON.stringify({
        taxRate: 10,
        feeRate: 4,
        goFeeYen: 100,
        walkRate: 50
      })
    }
  });

  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "経過時間"), "9時間00分");
  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "休憩時間"), "1時間00分");
  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "実働時間"), "8時間00分");

  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "実車回数"), "4回");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "現収合計"), "3,400円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "未収合計"), "3,500円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "決済手数料"), "100円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "売上合計（税込）"), "6,700円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "売上合計（税抜）"), "6,091円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "概算収入"), "3,045円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "時給換算"), "381円");

  assert.strictEqual(extractRenderedValue(rendered.goHtml, "GO予約数"), "3回");
  assert.strictEqual(extractRenderedValue(rendered.goHtml, "GO手配料"), "100円");
  assert.strictEqual(extractRenderedValue(rendered.goHtml, "GO Pay件数"), "2件");
  assert.strictEqual(extractRenderedValue(rendered.goHtml, "（内、乗込GO Pay）"), "1件");
  assert.strictEqual(extractRenderedValue(rendered.goHtml, "GO計金額"), "3,400円");
}

function testActiveBreakAndDefaultSettings() {
  const day = "2026-03-02";
  const rendered = runDetailScript({
    fixedNowIso: "2026-03-02T12:00:00+09:00",
    storageSeed: {
      tsms_report_current_day: day,
      tsms_reports: JSON.stringify([
        { dayId: day, rideType: "通常", payMethod: "QR", cash: 1000, credit: 0 }
      ]),
      tsms_reports_archive: JSON.stringify([]),
      ops: JSON.stringify({
        dayId: day,
        departAt: "2026-03-02T10:30:00+09:00",
        breakSessions: [{ minutes: 10 }],
        breakActive: true,
        breakStartAt: "2026-03-02T11:45:00+09:00"
      })
    }
  });

  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "経過時間"), "1時間30分");
  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "休憩時間"), "0時間25分");
  assert.strictEqual(extractRenderedValue(rendered.timeHtml, "実働時間"), "1時間05分");

  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "売上合計（税込）"), "960円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "売上合計（税抜）"), "873円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "決済手数料"), "40円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "概算収入"), "436円");
  assert.strictEqual(extractRenderedValue(rendered.salesHtml, "時給換算"), "403円");
}

function testFormulaGuards() {
  const html = fs.readFileSync(DETAIL_HTML, "utf8");
  const requiredSnippets = [
    'const REPORT_KEY = "tsms_reports";',
    'const REPORT_ARCHIVE_KEY = "tsms_reports_archive";',
    'const OPS_KEY = "ops";',
    'const OPS_ARCHIVE_KEY = "ops_archive_v1";',
    "const salesInTax = grossBase - fee - goFeeTotal;",
    "const salesExTax = salesInTax / (1 + num(settings.taxRate)/100);",
    "const takeHome = salesExTax * (num(settings.walkRate)/100);",
    "const hourly = workMin > 0 ? (takeHome / (workMin/60)) : 0;"
  ];
  requiredSnippets.forEach((snippet) => {
    assert.ok(html.includes(snippet), `計算/保存仕様ガード不一致: ${snippet}`);
  });
}

function runTests() {
  const tests = [
    ["標準日次集計", testStandardDailySummary],
    ["休憩進行中・既定設定", testActiveBreakAndDefaultSettings],
    ["計算式・保存キーガード", testFormulaGuards]
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
