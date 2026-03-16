const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "tsms-design.css"), "utf8");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function testSharedShellRulesExist() {
  assert.match(css, /\.page-block-unified \.main \{/);
  assert.match(css, /\.page-block-unified\.page-main-wide \.main \{ max-width: 1080px !important; \}/);
  assert.match(css, /\.page-block-unified\.page-main-xl \.main \{ max-width: 1220px !important; \}/);
  assert.match(css, /\.page-block-unified \.main \.card,[\s\S]*border: 0 !important;/);
  assert.match(css, /\.page-block-unified \.main \.section-boxed,[\s\S]*border: var\(--line-strong\) solid var\(--border\) !important;/);
  assert.match(css, /button\[data-group\]\.is-selected \{[\s\S]*background: var\(--selected-fill\) !important;[\s\S]*color: var\(--selected-text\) !important;[\s\S]*0 0 0 3px var\(--selected-ring\) !important/);
  assert.match(css, /:root\[data-theme="dark"\] \.page-block-unified button\[data-group\]\.is-selected \{[\s\S]*background: var\(--selected-fill\) !important;[\s\S]*border-color: var\(--selected-border\) !important;/);
  assert.match(css, /\.input:focus,[\s\S]*background: var\(--field-focus-bg\) !important;[\s\S]*box-shadow: 0 0 0 4px var\(--field-focus-ring\), inset 0 0 0 1px var\(--field-focus-border\);/);
  assert.match(css, /:root\[data-theme="dark"\] \.page-block-unified \.input:focus,[\s\S]*background: var\(--field-focus-bg\) !important;[\s\S]*0 0 0 4px var\(--field-focus-ring\) !important/);
  assert.match(css, /--choice-btn-ratio: 1\.22 \/ 1;/);
  assert.match(css, /--choice-btn-min-h: 72px;/);
  assert.match(css, /\.table-wrap \{[\s\S]*overflow-y: auto;[\s\S]*max-height: calc\(100dvh - var\(--header-h\) - var\(--bottom-nav-h\) - 120px - env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.table-wrap thead th \{[\s\S]*position: sticky;[\s\S]*top: 0;[\s\S]*z-index: 3;/);
  assert.match(css, /:root\[data-theme="dark"\] \.table-wrap thead th \{[\s\S]*box-shadow:/);
  assert.match(css, /\.wf-row > \.btn \{[\s\S]*aspect-ratio: var\(--choice-btn-ratio\);[\s\S]*min-height: var\(--choice-btn-min-h\);/);
  assert.match(css, /\.wf-row > \.btn \.btn-label \{[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.btn\.action-main \{[\s\S]*min-height: 118px;[\s\S]*font-size: var\(--font-4xl\);/);
  assert.match(css, /\.btn\.reset-final \{[\s\S]*min-height: 128px;/);
  assert.match(css, /\.page-block-unified \.btn\.action-main,[\s\S]*min-height: 118px !important;[\s\S]*font-size: var\(--font-4xl\) !important;/);
  assert.match(css, /\.page-block-unified \.btn\.reset-final \{[\s\S]*min-height: 128px !important;/);
  assert.match(css, /@media \(min-width: 376px\) and \(max-width: 767px\) \{[\s\S]*\.btn\.action-main \{ min-height: 124px; font-size: 19px; \}[\s\S]*\.btn\.reset-final \{ min-height: 136px; \}/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*\.btn\.action-main \{ min-height: 132px; font-size: 20px; \}[\s\S]*\.btn\.reset-final \{ min-height: 144px; \}/);
  assert.match(css, /@media \(min-width: 376px\) and \(max-width: 767px\) \{[\s\S]*\.page-block-unified \.btn\.action-main,[\s\S]*min-height: 124px !important;[\s\S]*font-size: 19px !important;[\s\S]*\.page-block-unified \.btn\.reset-final \{[\s\S]*min-height: 136px !important;/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*\.page-block-unified \.btn\.action-main,[\s\S]*min-height: 132px !important;[\s\S]*font-size: 20px !important;[\s\S]*\.page-block-unified \.btn\.reset-final \{[\s\S]*min-height: 144px !important;/);
  assert.match(css, /\.main\[style\*="justify-content:center"\],\s*\.auth-main \{/);
}

function testSharedStateDisplayRulesExist() {
  assert.match(css, /\.state-inline,[\s\S]*\.state-note,[\s\S]*\.state-field,[\s\S]*\.state-meta \{/);
  assert.match(css, /\[data-state-tone="info"\] \{[\s\S]*--state-color: var\(--accent\);[\s\S]*--state-bg-color: var\(--accent-light\);/);
  assert.match(css, /\[data-state-tone="success"\] \{[\s\S]*--state-color: var\(--success\);[\s\S]*--state-bg-color: var\(--success-bg\);/);
  assert.match(css, /\[data-state-tone="warning"\] \{[\s\S]*--state-color: var\(--warning\);[\s\S]*--state-bg-color: var\(--warning-bg\);/);
  assert.match(css, /\[data-state-tone="error"\] \{[\s\S]*--state-color: var\(--danger\);[\s\S]*--state-bg-color: var\(--danger-bg\);/);
  assert.match(css, /\.state-inline::before,[\s\S]*\.state-meta::before \{/);
  assert.match(css, /\.state-note \{[\s\S]*border-left: 4px solid var\(--state-border-color\) !important;[\s\S]*background: var\(--state-bg-color\) !important;/);
  assert.match(css, /\.state-field,[\s\S]*\.page-block-unified \.input\.state-field \{[\s\S]*box-shadow: inset 4px 0 0 0 var\(--state-border-color\);/);
}

function testPagesNoLongerCarryUnifiedShellBlocks() {
  for (const file of [
    "report.html",
    "confirm.html",
    "detail.html",
    "sales.html",
    "ops.html",
    "settings.html",
    "settings2.html"
  ]) {
    const html = read(file);
    assert.doesNotMatch(html, /unified-layout-tweaks/);
  }

  assert.doesNotMatch(read("settings.html"), /<style>/);
  assert.doesNotMatch(read("sales.html"), /<style>\s*:root/);
  assert.doesNotMatch(read("confirm.html"), /confirm-page-tweaks/);
  assert.doesNotMatch(read("detail.html"), /date-switcher label/);
}

function testPageWidthModifiersExist() {
  assert.match(read("sales.html"), /<body class="page-block-unified page-main-xl">/);
  assert.match(read("settings.html"), /<body class="page-block-unified page-main-wide">/);
  assert.match(read("index.html"), /<section class="card section-boxed" aria-label="勤務カレンダー">/);
  assert.match(read("confirm.html"), /\.actions\.entry-actions \.actionBtn\{[\s\S]*min-height:32px;[\s\S]*padding:6px 10px;[\s\S]*font-size:var\(--font-md\);/);
}

function testHeaderActionGrammarIsUnified() {
  for (const file of ["confirm.html", "detail.html", "ops.html", "sales.html", "settings.html"]) {
    assert.match(read(file), /class="header-to-report" href="report\.html">日報入力へ</);
    assert.doesNotMatch(read(file), />入力画面へ</);
  }

  assert.match(read("report.html"), /class="header-to-report" href="report\.html">再読み込み</);
  assert.match(read("settings2.html"), /class="header-to-report" href="settings\.html">設定へ</);
}

function testPagesUseSharedStateDisplayGrammar() {
  assert.match(read("index.html"), /id="syncStatusInline" class="state-inline" data-state-tone="neutral" aria-live="polite"/);
  assert.match(read("index.html"), /syncInline\.dataset\.stateTone = "success";/);
  assert.match(read("index.html"), /syncInline\.dataset\.stateTone = "error";/);
  assert.match(read("ops.html"), /id="opsSyncMeta" data-state-tone="neutral" aria-live="polite">最終クラウド同期: --<\/div>/);
  assert.match(read("ops.html"), /opsSyncMeta\.dataset\.stateTone = "success";/);
  assert.match(read("ops.html"), /opsSyncMeta\.dataset\.stateTone = "error";/);
  assert.match(read("detail.html"), /id="detailModeNote"/);
  assert.match(read("detail.html"), /state-note" data-state-tone="error">テストデータを表示中です。クラウドには保存されません。/);
  assert.match(read("settings.html"), /id="subscriptionNote" data-state-tone="neutral" aria-live="polite">/);
  assert.match(read("settings.html"), /id="subscriptionStatus" data-state-tone="info" aria-live="polite">確認中\.\.\.<\/div>/);
  assert.match(read("settings.html"), /function setStateTone\(el, tone\)/);
  assert.match(read("settings2.html"), /id="saveStatus" data-state-tone="neutral" aria-live="polite">/);
  assert.match(read("settings2.html"), /saveStatus\.dataset\.stateTone = "warning";/);
  assert.match(read("settings2.html"), /saveStatus\.dataset\.stateTone = "info";/);
  assert.match(read("settings2.html"), /saveStatus\.dataset\.stateTone = "error";/);
}

function testSettingsHubPagesExist() {
  const home = read("settings-home.html");
  const report = read("settings-report.html");
  const calc = read("settings-calc.html");
  const period = read("settings-period.html");
  const backup = read("settings-backup.html");
  const account = read("settings-account.html");
  const guard = read("auth-guard.js");

  assert.match(home, /設定トップ/);
  assert.match(home, /settings-report\.html/);
  assert.match(home, /settings-calc\.html/);
  assert.match(home, /settings-period\.html/);
  assert.match(home, /settings-backup\.html/);
  assert.match(home, /settings-account\.html/);
  assert.match(home, /旧 settings\.html/);
  assert.match(report, /data-save-redirect="settings-home\.html"/);
  assert.match(report, /変更を保存して設定トップへ戻る/);
  assert.match(calc, /id="themeMode"/);
  assert.match(calc, /id="btnSaveCalcHome"/);
  assert.match(period, /id="closeStartDay"/);
  assert.match(period, /id="btnResetPeriod"/);
  assert.match(backup, /id="btnExportBackup"/);
  assert.match(backup, /id="btnCloudRestore"/);
  assert.match(account, /id="subscriptionStatus"/);
  assert.match(account, /id="btnDeleteAccount"/);
  assert.match(guard, /settings-account\.html\?subscription=required/);
}

function testSettingsNavigationPointsToHub() {
  for (const file of [
    "report.html",
    "confirm.html",
    "detail.html",
    "ops.html",
    "sales.html",
    "settings.html",
    "settings2.html",
    "index.html"
  ]) {
    const html = read(file);
    assert.match(html, /settings-home\.html/);
  }
}

function testDesignSystemDocExists() {
  const doc = read("DESIGN-SYSTEM.md");
  assert.match(doc, /Source Of Truth/);
  assert.match(doc, /Forbidden Patterns/);
}

function runTests() {
  const tests = [
    ["共通シェル定義", testSharedShellRulesExist],
    ["共通状態表示定義", testSharedStateDisplayRulesExist],
    ["主要画面の重複シェル削減", testPagesNoLongerCarryUnifiedShellBlocks],
    ["画面幅修飾", testPageWidthModifiersExist],
    ["ヘッダー右上アクション文法", testHeaderActionGrammarIsUnified],
    ["主要画面の状態表示文法", testPagesUseSharedStateDisplayGrammar],
    ["設定ハブページ追加", testSettingsHubPagesExist],
    ["設定導線のハブ化", testSettingsNavigationPointsToHub],
    ["デザインルール文書", testDesignSystemDocExists]
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
