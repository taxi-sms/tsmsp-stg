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
}

function testPageWidthModifiersExist() {
  assert.match(read("sales.html"), /<body class="page-block-unified page-main-xl">/);
  assert.match(read("settings.html"), /<body class="page-block-unified page-main-wide">/);
  assert.match(read("index.html"), /<section class="card section-boxed" aria-label="勤務カレンダー">/);
}

function testDesignSystemDocExists() {
  const doc = read("DESIGN-SYSTEM.md");
  assert.match(doc, /Source Of Truth/);
  assert.match(doc, /Forbidden Patterns/);
}

function runTests() {
  const tests = [
    ["共通シェル定義", testSharedShellRulesExist],
    ["主要画面の重複シェル削減", testPagesNoLongerCarryUnifiedShellBlocks],
    ["画面幅修飾", testPageWidthModifiersExist],
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
