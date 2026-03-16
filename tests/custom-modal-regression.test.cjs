const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function testCustomConfirmSupportsAlertMode() {
  const js = read("custom-confirm.js");
  assert.match(js, /window\.tsmsAlert = function\(message, options\)/);
  assert.match(js, /noBtn\.hidden = mode === "alert";/);
  assert.match(js, /mode === "alert" \? "閉じる" : "はい"/);
  assert.match(js, /card\.dataset\.mode = mode;/);
}

function testAlertModalStylesExist() {
  const css = read("tsms-design.css");
  assert.match(css, /\.tsms-confirm-title \{[\s\S]*white-space: pre-line;/);
  assert.match(css, /\.tsms-confirm-card\[data-mode="alert"\] \{/);
  assert.match(css, /\.tsms-confirm-card\[data-mode="alert"\] \.tsms-confirm-actions \{/);
}

function testPagesUseSharedAlertHelpers() {
  assert.match(read("report.html"), /await window\.tsmsAlert\("乗車種別と支払方法を選んでください"\);/);
  assert.match(read("confirm.html"), /await showAlert\("履歴データはここでは削除できません"\);/);
  assert.match(read("ops.html"), /await window\.tsmsAlert\("ログアウトに失敗しました。いったんそのままご利用ください。"\);/);
  assert.match(read("settings-backup.html"), /await showAlert\(lines\.join\("\\n"\)\);/);
  assert.match(read("settings-account.html"), /const showAlert = \(message\) => window\.tsmsAlert/);
  assert.match(read("settings-account.html"), /const showConfirm = \(message\) => window\.tsmsConfirm/);
  assert.match(read("settings.html"), /const showAlert = \(message\) => window\.tsmsAlert/);
  assert.match(read("auth-guard.js"), /async function showAlert\(message\)/);
  assert.match(read("settings-report.html"), /<script src="\.\/custom-confirm\.js"><\/script>/);
  assert.match(read("settings2.html"), /<script src="\.\/custom-confirm\.js"><\/script>/);
}

function runTests() {
  const tests = [
    ["custom-confirm の alert 対応", testCustomConfirmSupportsAlertMode],
    ["alert モーダルのスタイル", testAlertModalStylesExist],
    ["主要画面の共通 alert 利用", testPagesUseSharedAlertHelpers]
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
