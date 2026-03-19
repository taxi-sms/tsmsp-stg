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
  assert.match(html, /const CONFIRM_SUMMARY_MODAL_KEY = "tsms_confirm_summary_modal_v1";/);
  assert.match(html, /window\.tsmsConfirm\("まだ出庫していません。テストデータとして保存しますか？"\)/);
  assert.match(html, /const saveAsTest = !!editTestId \|\| \(!editId && !hasLiveWorkState\(\)\);/);
  assert.match(html, /sessionStorage\.setItem\(TEST_REPORT_KEY, JSON\.stringify\(normalized\)\)/);
  assert.match(html, /if \(saveAsTest\) \{[\s\S]*localStorage\.setItem\(CURRENT_DAY_KEY, entry\.dayId\);[\s\S]*localStorage\.removeItem\(CONFIRM_FORCE_EMPTY_KEY\);/);
  assert.match(html, /sessionStorage\.setItem\(CONFIRM_SUMMARY_MODAL_KEY, JSON\.stringify\(\{[\s\S]*dayId: entry\.dayId,[\s\S]*ts: Date\.now\(\)/);
  assert.match(html, /showResultModal\(saveAsTest \? "テストデータを保存しました" : "登録が完了しました"/);
}

function testConfirmUsesExplicitSelectionAndTestRows() {
  const html = read("confirm.html");
  assert.match(html, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(html, /const CONFIRM_SUMMARY_MODAL_KEY = "tsms_confirm_summary_modal_v1";/);
  assert.match(html, /emptyOpt\.textContent = "選択してください";/);
  assert.match(html, /let hasUserPickedDay = false;/);
  assert.match(html, /const hasTestRows = !!currentDayId && allData\.some\(\(r\)=> r && r\.__source === "test" && rowDayId\(r\) === currentDayId\);/);
  assert.match(html, /if\(hasTestRows && days\.includes\(currentDayId\)\) return currentDayId;/);
  assert.match(html, /else if\(hasUserPickedDay && selectedDayId && days\.includes\(selectedDayId\)\)/);
  assert.doesNotMatch(html, /days\.includes\(today\)/);
  assert.doesNotMatch(html, /days\[0\]/);
  assert.doesNotMatch(html, /resolveTestDayId/);
  assert.match(html, /if\(!selectedDayId\)\{[\s\S]*選択してください/);
  assert.match(html, /state-inline" data-state-tone="error">テストデータ/);
  assert.match(html, /location\.href = `report\.html\?editTest=\$\{encodeURIComponent\(id\)\}`;/);
  assert.match(html, /id="confirmSummaryModalBg"/);
  assert.match(html, /function buildReportSummary\(dayId\)/);
  assert.match(html, /const salesInTax = grossBase - fee - goFeeTotal;/);
  assert.match(html, /const salesExTax = salesInTax \/ \(1 \+ num\(settings\.taxRate\) \/ 100\);/);
  assert.match(html, /const takeHome = salesExTax \* \(num\(settings\.walkRate\) \/ 100\);/);
  assert.match(html, /const hourly = workMin > 0 \? \(takeHome \/ \(workMin \/ 60\)\) : 0;/);
  assert.match(html, /line\("実働時間", fmtMinutes\(summary\.workMin\), true\)/);
  assert.match(html, /line\("売上合計（税込）", yenMarkup\(summary\.salesInTax, true\), true, true\)/);
  assert.match(html, /line\("概算収入", yenMarkup\(summary\.takeHome, true\), true, true\)/);
  assert.match(html, /line\("時給換算", yenMarkup\(summary\.hourly, true\), false, true\)/);
  assert.match(html, /id="confirmSummaryModalCountdown"/);
  assert.match(html, /let reportSummaryCountdownTimer = 0;/);
  assert.match(html, /reportSummaryModalCountdown\.textContent = `\$\{remainingSeconds\}秒後に閉じます`;/);
  assert.match(html, /reportSummaryCountdownTimer = setInterval\(\(\) => \{/);
  assert.match(html, /setTimeout\(\(\) => closeReportSummaryModal\(\), 5000\)/);
  assert.match(html, /consumeReportSummaryModal\(\);/);
}

function testDetailUsesExplicitSelectionAndTestNotice() {
  const html = read("detail.html");
  assert.match(html, /const TEST_REPORT_KEY = "tsms_test_reports_v1";/);
  assert.match(html, /emptyOpt\.textContent = "選択してください";/);
  assert.match(html, /let hasUserPickedDay = false;/);
  assert.match(html, /const hasTestRows = !!currentDayId && reports\.some\(\(r\)=> r && r\.__source === "test" && rowDayId\(r\) === currentDayId\);/);
  assert.match(html, /if\(hasTestRows && days\.includes\(currentDayId\)\) return currentDayId;/);
  assert.match(html, /else if\(hasUserPickedDay && selectedDayId && days\.includes\(selectedDayId\)\)/);
  assert.doesNotMatch(html, /days\.includes\(today\)/);
  assert.doesNotMatch(html, /days\[0\]/);
  assert.doesNotMatch(html, /resolveTestDayId/);
  assert.match(html, /renderEmptyState\("選択してください"\);/);
  assert.match(html, /<div id="detailModeNote"><\/div>/);
  assert.match(html, /function setDetailModeNoteVisible\(visible\)/);
  assert.match(html, /function hasTestOnlyRows\(rows\)/);
  assert.match(html, /rows\.every\(\(r\)=> r && r\.__source === "test"\)/);
  assert.match(html, /setDetailModeNoteVisible\(showTestModeNote\);/);
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
