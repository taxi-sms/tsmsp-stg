const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const SALES_HTML = path.join(ROOT, "sales.html");

function extractSalesScript(html) {
  const re = /<script>\s*\(function\(\)\{\s*const REPORT_KEY='tsms_reports'[\s\S]*?\}\)\(\);\s*<\/script>/;
  const m = html.match(re);
  if (!m) throw new Error("sales.html から計算スクリプトを抽出できませんでした。");
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

function createClassList() {
  const set = new Set();
  return {
    add(token) {
      set.add(String(token));
    },
    remove(token) {
      set.delete(String(token));
    },
    toggle(token, force) {
      const t = String(token);
      if (force === true) {
        set.add(t);
        return true;
      }
      if (force === false) {
        set.delete(t);
        return false;
      }
      if (set.has(t)) {
        set.delete(t);
        return false;
      }
      set.add(t);
      return true;
    },
    contains(token) {
      return set.has(String(token));
    }
  };
}

function parseOptions(innerHTML) {
  const options = [];
  const re = /<option value="([^"]*)">([^<]*)<\/option>/g;
  let m;
  while ((m = re.exec(String(innerHTML)))) {
    options.push({ value: m[1], textContent: m[2] });
  }
  return options;
}

function createElement(tagName = "div", id = "") {
  const elem = {
    tagName: String(tagName).toUpperCase(),
    id,
    value: "",
    children: [],
    listeners: {},
    attrs: {},
    classList: createClassList(),
    _innerHTML: "",
    _textContent: "",
    _options: [],
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(v) {
      this._innerHTML = String(v);
      if (this.id === "monthSelect") {
        this._options = parseOptions(this._innerHTML);
      }
      if (this.id === "tbody") {
        this.children = [];
      }
    },
    get textContent() {
      return this._textContent;
    },
    set textContent(v) {
      this._textContent = String(v);
    },
    get options() {
      return this._options;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    appendChild(node) {
      this.children.push(node);
    },
    setAttribute(name, value) {
      this.attrs[String(name)] = String(value);
    },
    closest() {
      return null;
    }
  };
  return elem;
}

function createDocument() {
  const elements = new Map();
  function ensureElement(id) {
    if (!elements.has(id)) {
      elements.set(id, createElement("div", id));
    }
    return elements.get(id);
  }
  return {
    getElementById(id) {
      return ensureElement(id);
    },
    createElement(tagName) {
      return createElement(tagName);
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

async function runSalesScript({ fixedNowIso, storageSeed }) {
  const html = fs.readFileSync(SALES_HTML, "utf8");
  const script = extractSalesScript(html);
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
    fetch: async () => ({
      ok: true,
      async json() {
        return {};
      }
    }),
    AbortController: class AbortController {
      constructor() {
        this.signal = {};
      }
      abort() {}
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {}
  };

  vm.runInNewContext(script, sandbox, { filename: "sales-calc-inline.js" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  return {
    sumTarget: document.getElementById("sumTarget").textContent,
    sumResult: document.getElementById("sumResult").textContent,
    sumDiff: document.getElementById("sumDiff").textContent,
    sumBound: document.getElementById("sumBound").textContent,
    sumWork: document.getElementById("sumWork").textContent,
    sumBreak: document.getElementById("sumBreak").textContent,
    sumHour: document.getElementById("sumHour").textContent,
    rowHtml: document.getElementById("tbody").children.map((row) => row.innerHTML)
  };
}

async function testMonthlySummaryWithTargets() {
  const day1 = "2026-03-01";
  const day2 = "2026-03-02";
  const rendered = await runSalesScript({
    fixedNowIso: "2026-03-02T12:00:00+09:00",
    storageSeed: {
      tsms_reports: JSON.stringify([
        { dayId: day1, rideType: "GO", payMethod: "現金", cash: 1000, credit: 0 },
        { dayId: day1, rideType: "通常", payMethod: "QR", cash: 0, credit: 2000 },
        { dayId: day2, rideType: "GO", payMethod: "GO Pay", cash: 0, credit: 3000 }
      ]),
      tsms_reports_archive: JSON.stringify([]),
      ops: JSON.stringify({
        dayId: day2,
        departAt: "2026-03-02T10:30:00+09:00",
        returnAt: "2026-03-02T15:30:00+09:00",
        breakSessions: [{ minutes: 30 }]
      }),
      ops_archive_v1: JSON.stringify({
        [day1]: {
          dayId: day1,
          departAt: "2026-03-01T09:00:00+09:00",
          returnAt: "2026-03-01T18:00:00+09:00",
          breakSessions: [{ minutes: 60 }]
        }
      }),
      tsms_sales_plan: JSON.stringify({
        [day1]: { shift: "work", target: "1000" },
        [day2]: { shift: "work", target: "2000" }
      }),
      tsms_sales_manual_v1: JSON.stringify({}),
      tsms_settings: JSON.stringify({
        taxRate: 10,
        feeRate: 4,
        goFeeYen: 100,
        walkRate: 50,
        closeStartDay: 16,
        closeEndDay: 15
      })
    }
  });

  assert.strictEqual(rendered.sumTarget, "3,000");
  assert.strictEqual(rendered.sumResult, "2,646");
  assert.strictEqual(rendered.sumDiff, "-354");
  assert.strictEqual(rendered.sumBound, "14:00");
  assert.strictEqual(rendered.sumWork, "12:30");
  assert.strictEqual(rendered.sumBreak, "1:30");
  assert.strictEqual(rendered.sumHour, "212");
}

async function testManualOverridesAffectSummary() {
  const day1 = "2026-03-01";
  const day2 = "2026-03-02";
  const rendered = await runSalesScript({
    fixedNowIso: "2026-03-02T12:00:00+09:00",
    storageSeed: {
      tsms_reports: JSON.stringify([
        { dayId: day1, rideType: "GO", payMethod: "現金", cash: 1000, credit: 0 },
        { dayId: day1, rideType: "通常", payMethod: "QR", cash: 0, credit: 2000 },
        { dayId: day2, rideType: "GO", payMethod: "GO Pay", cash: 0, credit: 3000 }
      ]),
      tsms_reports_archive: JSON.stringify([]),
      ops: JSON.stringify({
        dayId: day2,
        departAt: "2026-03-02T10:30:00+09:00",
        returnAt: "2026-03-02T15:30:00+09:00",
        breakSessions: [{ minutes: 30 }]
      }),
      ops_archive_v1: JSON.stringify({
        [day1]: {
          dayId: day1,
          departAt: "2026-03-01T09:00:00+09:00",
          returnAt: "2026-03-01T18:00:00+09:00",
          breakSessions: [{ minutes: 60 }]
        }
      }),
      tsms_sales_plan: JSON.stringify({
        [day1]: { shift: "work", target: "1000" },
        [day2]: { shift: "work", target: "2000" }
      }),
      tsms_sales_manual_v1: JSON.stringify({
        [day2]: { result: "5000", return: "16:15", bound: "5:45", work: "5:00", break: "0:45" }
      }),
      tsms_settings: JSON.stringify({
        taxRate: 10,
        feeRate: 4,
        goFeeYen: 100,
        walkRate: 50,
        closeStartDay: 16,
        closeEndDay: 15
      })
    }
  });

  assert.strictEqual(rendered.sumTarget, "3,000");
  assert.strictEqual(rendered.sumResult, "6,282");
  assert.strictEqual(rendered.sumDiff, "+3,282");
  assert.strictEqual(rendered.sumBound, "14:45");
  assert.strictEqual(rendered.sumWork, "13:00");
  assert.strictEqual(rendered.sumBreak, "1:45");
  assert.strictEqual(rendered.sumHour, "483");
}

async function testManualModeIncludesReturnAndBoundInputs() {
  const rendered = await runSalesScript({
    fixedNowIso: "2026-03-02T12:00:00+09:00",
    storageSeed: {
      tsms_reports: JSON.stringify([]),
      tsms_reports_archive: JSON.stringify([]),
      tsms_sales_plan: JSON.stringify({
        "2026-03-01": { shift: "work", target: "1000" }
      }),
      tsms_sales_manual_v1: JSON.stringify({}),
      tsms_sales_manual_mode: "1",
      tsms_settings: JSON.stringify({
        taxRate: 10,
        feeRate: 4,
        goFeeYen: 100,
        walkRate: 50,
        closeStartDay: 16,
        closeEndDay: 15
      })
    }
  });

  const firstRow = rendered.rowHtml[0] || "";
  assert.match(firstRow, /data-manual="depart"/);
  assert.match(firstRow, /data-manual="return"/);
  assert.match(firstRow, /data-manual="bound"/);
}

function testFormulaGuards() {
  const html = fs.readFileSync(SALES_HTML, "utf8");
  const requiredSnippets = [
    "const REPORT_KEY='tsms_reports';",
    "const REPORT_ARCHIVE_KEY='tsms_reports_archive';",
    "const OPS_KEY='ops';",
    "const OPS_ARCHIVE_KEY='ops_archive_v1';",
    "const SETTINGS_KEY='tsms_settings';",
    "const PLAN_KEY='tsms_sales_plan';",
    "const MANUAL_KEY='tsms_sales_manual_v1';",
    '<th style="width:60px;">帰庫</th>',
    '<th style="width:72px;">拘束</th>',
    '<td id="sumBound">0:00</td>',
    'data-manual="return"',
    'data-manual="bound"',
    "const manualBoundMin=parseHmToMin(manualRow.bound);",
    "const showReturn=hasManualReturn?manualRow.return:(opsData?opsData.return:'--');",
    "const derivedBoundMin=calcSpanMin(showDepart, showReturn);",
    "const salesInTax = gross - fee - goFee;",
    "const salesExTax = salesInTax / (1 + taxRate);",
    "return Math.round(salesExTax * (Number(settings.walkRate)||0) / 100);"
  ];
  requiredSnippets.forEach((snippet) => {
    assert.ok(html.includes(snippet), `計算/保存仕様ガード不一致: ${snippet}`);
  });
}

async function runTests() {
  const tests = [
    ["月次集計（目標あり）", testMonthlySummaryWithTargets],
    ["手動入力の上書き反映", testManualOverridesAffectSummary],
    ["手動編集列の追加", testManualModeIncludesReturnAndBoundInputs],
    ["計算式・保存キーガード", testFormulaGuards]
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
