const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function loadModule() {
  const modPath = path.resolve(__dirname, "..", "scripts", "update-events.mjs");
  return import(pathToFileURL(modPath).href);
}

async function testAllowSapporoAreaVenue() {
  const mod = await loadModule();
  const ev = {
    title: "吉川晃司 LIVE 2026",
    venue: "札幌文化芸術劇場 hitaru",
    venue_address: ""
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), true);
}

async function testRejectOutsideAreaVenue() {
  const mod = await loadModule();
  const ev = {
    title: "CareTEX東京【夏】",
    venue: "東京ビッグサイト 西4ホール",
    venue_address: "東京都江東区有明3-11-1"
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), false);
}

async function testRejectOutsideAreaWithLocalNoiseAddress() {
  const mod = await loadModule();
  const ev = {
    title: "PMFオーケストラ東京公演",
    venue: "東京オペラシティ",
    venue_address: "札幌市長 秋元克広"
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), false);
}

async function testRejectMultiLocationListing() {
  const mod = await loadModule();
  const ev = {
    title: "KOKAMI@network vol.22 「トランス」北海道公演",
    venue: "札幌：カナモトホール／帯広：帯広市民文化ホール",
    venue_address: "札幌市民ホール)／帯広：帯広市民文化ホール"
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), false);
}

async function testRejectTitleOnlyLocalWithoutVenueProof() {
  const mod = await loadModule();
  const ev = {
    title: "【公式】CareTEX札幌",
    venue: "ホームセンター",
    venue_address: "〒108-0073 東京都港区三田1-4-28 三田国際ビル（総合受付：11F）"
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), false);
}

async function runTests() {
  const tests = [
    ["札幌圏会場は通す", testAllowSapporoAreaVenue],
    ["札幌圏外会場は落とす", testRejectOutsideAreaVenue],
    ["札幌文字列ノイズでは通さない", testRejectOutsideAreaWithLocalNoiseAddress],
    ["複数都市まとめ会場は落とす", testRejectMultiLocationListing],
    ["タイトルだけ札幌は通さない", testRejectTitleOnlyLocalWithoutVenueProof]
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
