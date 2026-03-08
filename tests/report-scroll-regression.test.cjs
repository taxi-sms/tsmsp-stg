const fs = require("fs");
const path = require("path");
const assert = require("assert");

const REPORT_HTML = path.resolve(__dirname, "..", "report.html");

function extractFunctionSource(name, html) {
  const startToken = `function ${name}() {`;
  const start = html.indexOf(startToken);
  if (start === -1) throw new Error(`${name} を report.html から抽出できませんでした。`);

  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`${name} の終端を特定できませんでした。`);
  return html.slice(start, end);
}

function buildRunner() {
  const html = fs.readFileSync(REPORT_HTML, "utf8");
  const fnSource = extractFunctionSource("scrollToNextRequiredSection", html);

  const factory = new Function(`
    return function runScenario(stateInput) {
      const scrolled = [];
      const focused = [];
      const timers = [];
      const state = Object.assign({
        rideTypeBase: "",
        rideTypeOther: "",
        payMethodBase: "",
        payMethodOther: "",
        ticketSub: ""
      }, stateInput || {});
      const secRideTypeOther = { id: "sec_rideTypeOther" };
      const secPayMethodOther = { id: "sec_payMethodOther" };
      const secTicket = { id: "sec_ticketSub" };
      const secAmounts = { id: "sec_amounts" };
      const inCash = { focus() { focused.push("cash"); } };
      const inCredit = { focus() { focused.push("credit"); } };
      const reportFieldConfig = { payPrimary: ["現金"] };
      function getPayAmountVisibility() {
        if (state.payMethodBase === "チケット他") return { showCash: true, showCredit: true };
        if (state.payMethodBase === "その他" && state.payMethodOther === "追加8") return { showCash: true, showCredit: false };
        if (state.payMethodBase === "現金") return { showCash: true, showCredit: false };
        return { showCash: false, showCredit: true };
      }
      function getPayMethodValue() {
        if (state.payMethodBase === "その他") return String(state.payMethodOther || "").trim();
        return String(state.payMethodBase || "").trim();
      }
      function queueScrollToSection(section) {
        scrolled.push(section.id);
      }
      function focusAmountFieldForCurrentPayMethod() {
        const visibility = getPayAmountVisibility();
        (visibility.showCash ? inCash : inCredit).focus();
      }
      const document = {
        getElementById(id) {
          return { id };
        }
      };
      function setTimeout(fn) {
        timers.push(fn);
        return timers.length;
      }
      ${fnSource}
      scrollToNextRequiredSection();
      while (timers.length) {
        const fn = timers.shift();
        fn();
      }
      return { scrolled, focused };
    };
  `)();

  return factory;
}

function testRideTypeOtherCompletesToPayMethod() {
  const runScenario = buildRunner();
  const result = runScenario({
    rideTypeBase: "その他",
    rideTypeOther: "追加3"
  });
  assert.deepStrictEqual(result.scrolled, ["sec_payMethod"]);
}

function testDirectPayMethodGoesToAmounts() {
  const runScenario = buildRunner();
  const result = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "QR"
  });
  assert.deepStrictEqual(result.scrolled, ["sec_amounts"]);
  assert.deepStrictEqual(result.focused, ["credit"]);
}

function testTicketAndOtherStopAtNestedSection() {
  const runScenario = buildRunner();
  const ticket = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "チケット他"
  });
  assert.deepStrictEqual(ticket.scrolled, ["sec_ticketSub"]);

  const other = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "その他"
  });
  assert.deepStrictEqual(other.scrolled, ["sec_payMethodOther"]);
}

function testNestedPaySelectionThenAmounts() {
  const runScenario = buildRunner();
  const ticket = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "チケット他",
    ticketSub: "Aチケット"
  });
  assert.deepStrictEqual(ticket.scrolled, ["sec_amounts"]);
  assert.deepStrictEqual(ticket.focused, ["cash"]);

  const other = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "その他",
    payMethodOther: "追加2"
  });
  assert.deepStrictEqual(other.scrolled, ["sec_amounts"]);
  assert.deepStrictEqual(other.focused, ["credit"]);

  const otherCash = runScenario({
    rideTypeBase: "無線",
    payMethodBase: "その他",
    payMethodOther: "追加8"
  });
  assert.deepStrictEqual(otherCash.scrolled, ["sec_amounts"]);
  assert.deepStrictEqual(otherCash.focused, ["cash"]);
}

function runTests() {
  const tests = [
    ["乗車種別その他完了後は支払方法へ", testRideTypeOtherCompletesToPayMethod],
    ["通常支払方法は金額欄へ", testDirectPayMethodGoesToAmounts],
    ["チケット他とその他は追加選択へ", testTicketAndOtherStopAtNestedSection],
    ["追加選択完了後は金額欄へ", testNestedPaySelectionThenAmounts]
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
