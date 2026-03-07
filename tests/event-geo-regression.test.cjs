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

async function testExtractTicketPiaLocalCardDate() {
  const mod = await loadModule();
  const source = { id: "t-pia-jp-hokkaido", name: "チケットぴあ", url: "https://t.pia.jp/hokkaido/", priority: "A" };
  const html = `
    <html>
      <head>
        <title>福山雅治 | チケットぴあ[チケット購入・予約]</title>
        <meta property="og:description" content="2026年1月より、13ヶ所28公演をめぐる全国アリーナツアー開催！" />
        <meta property="og:image" content="https://example.com/flyer.jpg" />
      </head>
      <body>
        <li class="ticketSalesList-2024__item">
          <p class="ticketSalesCard-2024__date">
            <span class="ticketSalesCard-2024__startDate"><time itemprop="startDate" datetime="2026-03-07T00:00:00+09:00"></time></span>
            <span class="ticketSalesCard-2024__endDate"><time itemprop="endDate" datetime="2026-03-08T00:00:00+09:00"></time></span>
          </p>
          <p class="ticketSalesCard-2024__location">
            <span class="ticketSalesCard-2024__place">マリンメッセ福岡Ａ館</span>
            (<span class="ticketSalesCard-2024__address"><span class="ticketSalesCard-2024__region">福岡県</span></span>)
          </p>
        </li>
        <li class="ticketSalesList-2024__item">
          <p class="ticketSalesCard-2024__date">
            <span class="ticketSalesCard-2024__startDate"><time itemprop="startDate" datetime="2026-06-06T00:00:00+09:00"></time></span>
            <span class="ticketSalesCard-2024__endDate"><time itemprop="endDate" datetime="2026-06-07T00:00:00+09:00"></time></span>
          </p>
          <p class="ticketSalesCard-2024__location">
            <span class="ticketSalesCard-2024__place">真駒内セキスイハイムアイスアリーナ</span>
            (<span class="ticketSalesCard-2024__address"><span class="ticketSalesCard-2024__region">北海道</span></span>)
          </p>
        </li>
      </body>
    </html>
  `;

  const events = mod.extractTicketPiaLocalSiteRuleEvents({
    source,
    url: "https://t.pia.jp/pia/event/event.do?eventBundleCd=b2563621",
    html
  });

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-06-06");
  assert.strictEqual(events[0].end_date, "2026-06-07");
  assert.strictEqual(events[0].venue, "真駒内セキスイハイムアイスアリーナ (北海道)");
}

async function testAllowKnownSapporoVenueWithoutCityName() {
  const mod = await loadModule();
  const ev = {
    title: "SUPER BEAVER 20th Anniversary TOUR 2026",
    venue: "北海道立総合体育センター 北海きたえーる",
    venue_address: ""
  };
  assert.strictEqual(mod.isSapporoAreaEvent(ev), true);
}

async function testBuildWessEventFromApiPost() {
  const mod = await loadModule();
  const source = {
    id: "wess-jp-concert-schedule",
    name: "WESS",
    url: "https://wess.jp/concert-schedule/",
    category: "コンサートプロモーター",
    priority: "S"
  };
  const post = {
    title: "SUPER BEAVER|03.08(日)|札幌 北海道立総合体育センター 北海きたえーる",
    link: "https://wess.jp/superbeaver2/",
    meta: {
      kouenbi: "20260308",
      artist: "SUPER BEAVER",
      concerttitle: "SUPER BEAVER 20th Anniversary 「都会のラクダ TOUR 2026 〜 ラクダトゥインクルー 〜」",
      kaijo: "北海道立総合体育センター 北海きたえーる",
      kaijojikan: "16:00",
      kaienjikan: "17:00",
      thumbnail_url: "https://wess.jp/example.jpg",
      freeareaahonbun: "<p>札幌公演です</p>"
    }
  };

  const ev = mod.eventFromWessPost(post, source);
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-03-08");
  assert.strictEqual(ev.title.includes("SUPER BEAVER"), true);
  assert.strictEqual(ev.venue, "北海道立総合体育センター 北海きたえーる");
  assert.strictEqual(ev.open_time, "16:00");
  assert.strictEqual(ev.start_time, "17:00");
}

async function runTests() {
  const tests = [
    ["札幌圏会場は通す", testAllowSapporoAreaVenue],
    ["札幌圏外会場は落とす", testRejectOutsideAreaVenue],
    ["札幌文字列ノイズでは通さない", testRejectOutsideAreaWithLocalNoiseAddress],
    ["複数都市まとめ会場は落とす", testRejectMultiLocationListing],
    ["タイトルだけ札幌は通さない", testRejectTitleOnlyLocalWithoutVenueProof],
    ["ぴあ bundle は札幌カードの日付を使う", testExtractTicketPiaLocalCardDate],
    ["札幌既知会場は地名なしでも通す", testAllowKnownSapporoVenueWithoutCityName],
    ["WESS API から札幌公演を組み立てる", testBuildWessEventFromApiPost]
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
