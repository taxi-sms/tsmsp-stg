const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function testReportStoresUndepartedEntriesInSession() {
  const html = read("report.html");
  assert.match(html, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(html, /window\.tsmsConfirm\("まだ出庫していません。テストデータとして保存しますか？"\)/);
  assert.match(html, /const saveAsTest = !!editTestId \|\| \(!editId && !hasLiveWorkState\(\)\);/);
  assert.match(html, /sessionStorage\.setItem\(TEST_REPORT_KEY, JSON\.stringify\(normalized\)\)/);
  assert.match(html, /showResultModal\(saveAsTest \? "テストデータを保存しました" : "登録が完了しました"/);
}

function testConfirmUsesExplicitSelectionAndTestRows() {
  const html = read("confirm.html");
  assert.match(html, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(html, /emptyOpt\.textContent = "選択してください";/);
  assert.match(html, /let hasUserPickedDay = false;/);
  assert.match(html, /else if\(hasUserPickedDay && selectedDayId && days\.includes\(selectedDayId\)\)/);
  assert.doesNotMatch(html, /days\.includes\(today\)/);
  assert.doesNotMatch(html, /days\[0\]/);
  assert.doesNotMatch(html, /resolveTestDayId/);
  assert.match(html, /if\(!selectedDayId\)\{[\s\S]*選択してください/);
  assert.match(html, /state-inline" data-state-tone="error">テストデータ/);
  assert.match(html, /location\.href = `report\.html\?editTest=\$\{encodeURIComponent\(id\)\}`;/);
}

function testDetailUsesExplicitSelectionAndTestNotice() {
  const html = read("detail.html");
  assert.match(html, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(html, /emptyOpt\.textContent = "選択してください";/);
  assert.match(html, /let hasUserPickedDay = false;/);
  assert.match(html, /else if\(hasUserPickedDay && selectedDayId && days\.includes\(selectedDayId\)\)/);
  assert.doesNotMatch(html, /days\.includes\(today\)/);
  assert.doesNotMatch(html, /days\[0\]/);
  assert.doesNotMatch(html, /resolveTestDayId/);
  assert.match(html, /renderEmptyState\("選択してください"\);/);
  assert.match(html, /const hasTestOnlyRows = rows\.length > 0 && rows\.every\(\(r\)=> r && r\.__source === "test"\);/);
  assert.match(html, /テストデータを表示中です。クラウドには保存されません。/);
}

function testTestRowsAreClearedOnDepartAndLogout() {
  const ops = read("ops.html");
  const authGuard = read("auth-guard.js");
  assert.match(ops, /sessionStorage\.removeItem\(TEST_REPORT_KEY\)/);
  assert.match(authGuard, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(authGuard, /sessionStorage\.removeItem\(TEST_REPORT_KEY\)/);
}

function runTests() {
  const tests = [
    ["未出庫テスト保存", testReportStoresUndepartedEntriesInSession],
    ["入力確認の未選択表示", testConfirmUsesExplicitSelectionAndTestRows],
    ["詳細確認の未選択表示", testDetailUsesExplicitSelectionAndTestNotice],
    ["テストデータの掃除", testTestRowsAreClearedOnDepartAndLogout]
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
