const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function testReportSaveDayUsesEditableDay() {
  const html = read("report.html");
  assert.match(html, /const OPS_KEY = "ops";/);
  assert.match(html, /function resolveEditableDayId\(\) \{[\s\S]*const ops = loadJson\(OPS_KEY, null\);[\s\S]*return today;/);
  assert.match(html, /function resolveSaveDayId\(\) \{[\s\S]*return syncEditableDayState\(\) \|\| todayLocalYmd\(\);[\s\S]*\}/);
  assert.doesNotMatch(html, /function resolveSaveDayId\(\) \{[\s\S]*getCurrentDayId\(\)/);
}

function testPastEditIsBlockedInReport() {
  const html = read("report.html");
  assert.match(html, /const entryDayId = getEntryDayId\(entry\);/);
  assert.match(html, /if \(entryDayId && editableDayId && entryDayId !== editableDayId\) \{[\s\S]*過去日のデータは日報入力画面では編集できません。[\s\S]*location\.href = "confirm\.html";/);
}

function testConfirmAndDetailUseViewKeys() {
  const confirm = read("confirm.html");
  const detail = read("detail.html");

  assert.match(confirm, /const VIEW_DAY_KEY = "tsms_confirm_selected_day";/);
  assert.match(confirm, /localStorage\.setItem\(VIEW_DAY_KEY, selectedDayId\);/);
  assert.doesNotMatch(confirm, /localStorage\.setItem\(CURRENT_DAY_KEY, selectedDayId\);/);

  assert.match(detail, /const DAY_KEY = "tsms_detail_selected_day";/);
  assert.doesNotMatch(detail, /const DAY_KEY = "tsms_report_current_day";/);
}

function testOpsPrefersOwnDayIdOverStaleCurrentKey() {
  const ops = read("ops.html");
  assert.match(ops, /const savedDayId = String\(\(data && data\.dayId\) \|\| ""\)\.trim\(\);[\s\S]*const dayId = savedDayId \|\| localStorage\.getItem\(CURRENT_DAY_KEY\) \|\| localYmd\(\);/);
  assert.match(ops, /d\.dayId = String\(d\.dayId \|\| ""\)\.trim\(\) \|\| localStorage\.getItem\(CURRENT_DAY_KEY\) \|\| localYmd\(\);/);
  assert.match(ops, /const currentDayId = String\(\(opsData && opsData\.dayId\) \|\| ""\)\.trim\(\) \|\| localStorage\.getItem\(CURRENT_DAY_KEY\) \|\| localYmd\(\);/);
}

function runTests() {
  const tests = [
    ["保存日ロック", testReportSaveDayUsesEditableDay],
    ["過去日編集ブロック", testPastEditIsBlockedInReport],
    ["閲覧日キー分離", testConfirmAndDetailUseViewKeys],
    ["ops 勤務日優先", testOpsPrefersOwnDayIdOverStaleCurrentKey]
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
