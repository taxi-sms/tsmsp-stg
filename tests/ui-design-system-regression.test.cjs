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
  assert.match(css, /\.page-block-unified\.page-main-wide \.main \{ max-width: 880px; \}/);
  assert.match(css, /\.page-block-unified\.page-main-xl \.main \{ max-width: 980px; \}/);
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
