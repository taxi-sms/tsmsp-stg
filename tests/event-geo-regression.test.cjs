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

async function testAllowEsconFieldVenue() {
  const mod = await loadModule();
  const ev = {
    title: "北海道日本ハムファイターズ ホームゲーム",
    venue: "エスコンフィールドHOKKAIDO",
    venue_address: "北海道北広島市Fビレッジ1番地"
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

async function testParseArgsSupportsTodayAndSource() {
  const mod = await loadModule();
  const args = mod.parseArgs([
    "--mode=full",
    "--today=2026-07-01",
    "--source=wess-jp-concert-schedule,spice-sapporo-jp-schedule",
    "--output=tmp/events.json"
  ]);
  assert.strictEqual(args.mode, "full");
  assert.strictEqual(args.today, "2026-07-01");
  assert.deepStrictEqual(args.sourceIds, ["wess-jp-concert-schedule", "spice-sapporo-jp-schedule"]);
  assert.strictEqual(args.outputPath.endsWith(path.join("tmp", "events.json")), true);
}

async function testExtractHbcConcertEventsFiltersToSapporoArea() {
  const mod = await loadModule();
  const source = { id: "www-hbc-co-jp-event", name: "HBC", url: "https://www.hbc.co.jp/event/", priority: "A" };
  const html = `
    <table><tbody>
      <tr>
        <th><a href="https://example.com/a">札幌公演A</a></th>
        <td data-label="日程">4月4日(土)</td>
        <td data-label="時間">13:00開場/13:30開演</td>
        <td data-label="場所">札幌文化芸術劇場 hitaru</td>
        <td data-label="お問い合わせ">HBC</td>
        <td data-label="備考">販売中</td>
      </tr>
      <tr>
        <th rowspan="2"><a href="https://example.com/b">北海道ツアー</a></th>
        <td data-label="日程">5月13日(水)</td>
        <td data-label="時間">18:00開場/18:30開演</td>
        <td data-label="場所">北見市民会館</td>
        <td data-label="お問い合わせ" rowspan="2">HBC</td>
        <td data-label="備考" rowspan="2">販売中</td>
      </tr>
      <tr>
        <td data-label="日程">5月21日(木)</td>
        <td data-label="時間">14:00開場/14:30開演</td>
        <td data-label="場所">カナモトホール</td>
      </tr>
    </tbody></table>
  `;
  const events = mod.extractHbcConcertEvents({
    source,
    url: "https://www.hbc.co.jp/event/concert/index.html",
    html,
    nowYmd: "2026-03-08"
  });
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].venue, "札幌文化芸術劇場 hitaru");
  assert.strictEqual(events[1].venue, "カナモトホール");
}

async function testExtractKyobunScheduleEventsBuildsHallVenue() {
  const mod = await loadModule();
  const source = { id: "www-kyobun-org-event-schedule-html", name: "教文", url: "https://www.kyobun.org/event_schedule.html", priority: "A" };
  const html = `
    <dl class="schedule_all">
      <dt class="date">2026年3月8日（日）</dt>
      <dd class="event_link">
        <div class="event_text">
          <p class="icon mainhall">大ホール</p>
          <p class="title"><a href="event_schedule.html?id=11816&k=lst&ym=202603">札幌北野少年少女合唱団35周年記念コンサート</a></p>
          <p class="time">【開場】14:30 【開演】15:00</p>
        </div>
      </dd>
    </dl>
  `;
  const events = mod.extractKyobunScheduleEvents({
    source,
    url: "https://www.kyobun.org/event_schedule.html?k=lst&ym=202603",
    html,
    nowYmd: "2026-03-08"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].venue, "札幌市教育文化会館 大ホール");
  assert.strictEqual(events[0].start_time, "15:00");
}

async function testExtractJetroJmesseHandlesZeroPaddedDates() {
  const mod = await loadModule();
  const source = { id: "www-jetro-go-jp-j-messe-country-asia-jp-001", name: "JETRO", url: "https://www.jetro.go.jp/j-messe/country/asia/jp/001/", priority: "A" };
  const html = `
    <ul class="var_border_bottom var_blocklink">
      <li>
        <a href="/j-messe/tradefair/detail/158950">
          <p class="font18 font_bold">北海道 エネルギー技術革新EXPO 2026</p>
          <div class="elem_text_list_note">
            <dl class="w80">
              <dt>会期</dt><dd>2026年10月07日～2026年10月08日</dd>
              <dt>開催地</dt><dd>札幌 （北海道） / 日本 / アジア</dd>
            </dl>
          </div>
        </a>
      </li>
    </ul>
  `;
  const events = mod.extractJetroJmesseSiteRuleEvents({
    source,
    url: source.url,
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-10-07");
}

async function testExtractSapporoShiminhallScheduleEventsFromMonthlyPage() {
  const mod = await loadModule();
  const source = { id: "www-sapporo-shiminhall-org", name: "カナモトホール", url: "https://www.sapporo-shiminhall.org/", priority: "A" };
  const html = `
    <main>
      <span id="year"><span>2026</span>年</span>
      <span id="month"><span>04</span>月</span>
      <tr id="event2044-2">
        <td class="tbody-date"><div class="s-date"><p class="day">2</p><p class="week">木</p></div></td>
        <td class="tbody01">社会風刺コント集団 ザ・ニュースペーパー</td>
        <td class="tbody02 tb-label" data-label="開場"><p>1回目 <span class='time'>12:30</span></p></td>
        <td class="tbody03 tb-label" data-label="開演"><p><span class='fwb'>13:00</span></p></td>
        <td class="tbody04 tb-label" data-label="お問合せ先"><p>株式会社トラスト企画クリエート</p></td>
      </tr>
    </main>
  `;
  const events = mod.extractSapporoShiminhallScheduleEvents({
    source,
    url: "https://www.sapporo-shiminhall.org/event/?ymd=2026/04/01",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-02");
  assert.strictEqual(events[0].venue, "カナモトホール");
}

async function testExtractChieriaHallScheduleEventsFromCalendarView() {
  const mod = await loadModule();
  const source = { id: "chieria-slp-or-jp-schedule", name: "ちえりあ", url: "https://chieria.slp.or.jp/schedule/", priority: "A" };
  const html = `
    <table>
      <tr>
        <th scope="rows"><p>4月29日（水曜日）</p></th>
        <td>遠回りしてDiveする オモテもウラも抱きしめて 昭和レディ・心 [13時半開場：14時00分～]</td>
      </tr>
    </table>
  `;
  const events = mod.extractChieriaHallScheduleEvents({
    source,
    url: "https://chieria.slp.or.jp/_wcv/calendar/viewcal/QWQWlO/202604.html",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-29");
  assert.strictEqual(events[0].venue, "札幌市生涯学習センター ちえりあホール");
}

async function testExtractAxesCalendarEventsFromMonthlyCalendar() {
  const mod = await loadModule();
  const source = { id: "www-axes-or-jp", name: "アクセスサッポロ", url: "https://www.axes.or.jp/", priority: "S" };
  const html = `
    <script>
      this.year = '2026';
      this.events[0] = {};
      this.events[0].id = '234';
      this.events[0].day = '4';
      this.events[0].title = '北海道キャンピングカーフェスティバル２０２６';
      this.events[1] = {};
      this.events[1].id = '234';
      this.events[1].day = '5';
      this.events[1].title = '北海道キャンピングカーフェスティバル２０２６';
    </script>
  `;
  const events = mod.extractAxesCalendarEvents({
    source,
    url: "https://www.axes.or.jp/event_calendar/index.php?input[year]=2026&input[month]=4",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-04");
  assert.strictEqual(events[0].end_date, "2026-04-05");
  assert.strictEqual(events[0].venue, "アクセスサッポロ");
}

async function testExtractFightersHomeGameEvents() {
  const mod = await loadModule();
  const source = { id: "www-fighters-co-jp-game-calendar", name: "ファイターズ", url: "https://www.fighters.co.jp/game/calendar/", priority: "S" };
  const html = `
    <div class="c-calendar-month">
      <div class="c-calendar-month-day ">
        <div class="c-calendar-month-day-text">4/1</div>
        <div class="c-calendar-month-day-container">
          <div class="c-calendar-month-day-label c-calendar-month-day-label--home">
            <div class="c-calendar-month-day-label-venue">ホーム</div>
          </div>
          <div class="c-calendar-month-main-contents">
            <div class="c-calendar-month-vs">
              <div class="c-calendar-month-game-division">公式戦</div>
              <a class="c-calendar-month-vs-status c-calendar-month-vs-status--before" href="/gamelive/result/2026040101/">試合開始
                <div class="c-calendar-month-vs-status-time">18:30</div>
              </a>
              <div class="c-calendar-month-text">エスコンフィールド</div>
            </div>
          </div>
        </div>
      </div>
      <div class="c-calendar-month-day ">
        <div class="c-calendar-month-day-text">4/2</div>
        <div class="c-calendar-month-day-container">
          <div class="c-calendar-month-day-label c-calendar-month-day-label--visitor">
            <div class="c-calendar-month-day-label-venue">ビジター</div>
          </div>
          <div class="c-calendar-month-main-contents">
            <div class="c-calendar-month-vs">
              <a class="c-calendar-month-vs-status c-calendar-month-vs-status--before" href="/gamelive/result/2026040201/">試合開始
                <div class="c-calendar-month-vs-status-time">18:00</div>
              </a>
              <div class="c-calendar-month-text">楽天モバイル 最強パーク</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const events = mod.extractFightersHomeGameEvents({
    source,
    url: "https://www.fighters.co.jp/game/calendar/202604/",
    html
  });

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-01");
  assert.strictEqual(events[0].start_time, "18:30");
  assert.strictEqual(events[0].venue, "エスコンフィールド");
  assert.strictEqual(events[0].detail_url, "https://www.fighters.co.jp/gamelive/result/2026040101/");
  assert.strictEqual(events[0].title, "北海道日本ハムファイターズ ホームゲーム（公式戦）");
}

async function testExtractKaderuVenueEventsFromHallPage() {
  const mod = await loadModule();
  const source = { id: "homepage-kaderu27-or-jp-event-news-index-html", name: "かでる2・7", url: "https://homepage.kaderu27.or.jp/event/news/index.html", priority: "A" };
  const html = `
    <html>
      <head><title>「かでるホール」のイベント | かでる2・7</title></head>
      <body>
        <section id="e2026-04" class="eventList place">
          <h2>2026年4月</h2>
          <ul class="cards">
            <li><a href="self/o03676000000040x.html">
              <div class="detail">
                <p class="eventDate">
                  <time class="start" datetime="2026-04-13">2026年4月13日(月曜日)</time>
                  〜 <time class="end" datetime="2026-04-16">4月16日(木曜日)</time>
                </p>
                <b class="title">かでるホール体験事業「第31回かでる音楽スタジオ」</b>
                <span class="org">かでる2・7主催</span>
              </div>
            </a></li>
          </ul>
        </section>
      </body>
    </html>
  `;
  const events = mod.extractKaderuVenueEvents({
    source,
    url: "https://homepage.kaderu27.or.jp/event/index.html",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-13");
  assert.strictEqual(events[0].end_date, "2026-04-16");
  assert.strictEqual(events[0].venue, "かでるホール");
}

async function testExtractSpiceScheduleListingEventsSkipsStatusRows() {
  const mod = await loadModule();
  const source = { id: "spice-sapporo-jp-schedule", name: "SPiCE", url: "https://spice-sapporo.jp/schedule/", priority: "B" };
  const html = `
    <html>
      <body>
        <a href="https://spice-sapporo.jp/event/8767/">
          <div class="cmn__eventlist__item">
            <time class="cmn__eventlist__item__date">
              <span class="year">2026</span>
              <span class="month">03</span>
              <span class="day">09</span>
              <p class="eventcat cat-closed">CLOSED</p>
            </time>
            <div class="cmn__eventlist__item__ttl">
              <p class="artist en cat-closed">CLOSED｜店舗休業日</p>
            </div>
          </div>
        </a>
        <a href="https://spice-sapporo.jp/event/8752/">
          <div class="cmn__eventlist__item">
            <time class="cmn__eventlist__item__date">
              <span class="year">2026</span>
              <span class="month">03</span>
              <span class="day">10</span>
              <p class="eventcat cat-live">LIVE EVENT</p>
            </time>
            <div class="cmn__eventlist__item__ttl">
              <p class="artist en cat-live">SHANK TOUR 2026</p>
            </div>
          </div>
        </a>
      </body>
    </html>
  `;
  const events = mod.extractSpiceScheduleListingEvents({
    source,
    url: source.url,
    html
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].title, "SHANK TOUR 2026");
  assert.strictEqual(events[0].start_date, "2026-03-10");
}

async function testExtractSpiceScheduleDetailEventUsesOpenStart() {
  const mod = await loadModule();
  const source = { id: "spice-sapporo-jp-schedule", name: "SPiCE", url: "https://spice-sapporo.jp/schedule/", priority: "B" };
  const html = `
    <html>
      <head>
        <title>SHANK TOUR 2026 | SPiCE</title>
        <meta property="og:description" content="2026年3月10日開催" />
      </head>
      <body>
        <p class="scSingleMain__start"><span>OPEN<time>17:30</time></span><span>START<time>18:00</time></span></p>
      </body>
    </html>
  `;
  const ev = mod.extractSpiceScheduleDetailEvent({
    source,
    url: "https://spice-sapporo.jp/event/8752/",
    html,
    nowYmd: "2026-03-01",
    fallbackEvent: { start_date: "2026-03-10" }
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-03-10");
  assert.strictEqual(ev.open_time, "17:30");
  assert.strictEqual(ev.start_time, "18:00");
}

async function testExtractPmfScheduleDetailEventUsesLabeledSections() {
  const mod = await loadModule();
  const source = { id: "www-pmf-or-jp-jp-schedule", name: "PMF", url: "https://www.pmf.or.jp/jp/schedule/", priority: "A" };
  const html = `
    <html>
      <body>
        <h1 class="scheduleTitle"><span class="category orchestra">ホール（オーケストラ）</span><br>PMF2026 オープニング・ナイト</h1>
        <div class="scheduleDetailCont">
          <h3>開催日</h3>
          <p>2026年7月7日（火）</p>
        </div>
        <div class="scheduleDetailCont">
          <h3>時間</h3>
          <dl class="scheduleDetailTimeList"><dt class="header">開場</dt><dd class="body">17:30</dd></dl>
          <dl class="scheduleDetailTimeList start"><dt class="header">開演</dt><dd class="body">18:30</dd></dl>
          <dl class="scheduleDetailTimeList"><dt class="header">終演（予定）</dt><dd class="body">19:30</dd></dl>
        </div>
        <div class="scheduleDetailCont">
          <h3>会場</h3>
          <p class="link"><a href="/jp/access/kitara.html">札幌コンサートホール<I>Kitara</I>（大ホール）<span>&gt; 詳細をみる</span></a></p>
        </div>
      </body>
    </html>
  `;
  const ev = mod.extractPmfScheduleDetailEvent({
    source,
    url: "https://www.pmf.or.jp/jp/schedule/orchestra/2026-opening.html",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-07-07");
  assert.strictEqual(ev.venue, "札幌コンサートホール Kitara（大ホール）");
  assert.strictEqual(ev.open_time, "17:30");
  assert.strictEqual(ev.start_time, "18:30");
}

async function testExtractSapporoCommunityPlazaSiteRuleEventSkipsInternalUse() {
  const mod = await loadModule();
  const source = { id: "www-sapporo-community-plaza-jp-event-php", name: "札幌市民交流プラザ", url: "https://www.sapporo-community-plaza.jp/event.php", priority: "S" };
  const html = `
    <html>
      <head><title>関係者のみの利用あり | イベント情報 | 札幌市民交流プラザ</title></head>
      <body>
        <dl><dt>日時</dt><dd>2026年3月9日（月）</dd><dt>会場</dt><dd>劇場</dd></dl>
      </body>
    </html>
  `;
  const ev = mod.extractSapporoCommunityPlazaSiteRuleEvent({
    source,
    url: "https://www.sapporo-community-plaza.jp/event.php?num=4991",
    html,
    nowYmd: "2026-03-01"
  });
  assert.strictEqual(ev, null);
}

async function testExtractKaderuDetailEventUsesDetailVenue() {
  const mod = await loadModule();
  const source = { id: "homepage-kaderu27-or-jp-event-news-index-html", name: "かでる2・7", url: "https://homepage.kaderu27.or.jp/event/news/index.html", priority: "A" };
  const html = `
    <html>
      <head><meta property="og:title" content="かでるホール体験事業「第31回かでる音楽スタジオ」のご案内" /></head>
      <body>
        <dl class="eventInfo">
          <dt>開催日時</dt>
          <dd><p class="eventDate"><time class="start" datetime="2026-04-13">2026年4月13日</time> から <time class="end" datetime="2026-04-16">2026年4月16日</time></p></dd>
          <dt>開催場所</dt>
          <dd><p class="place"><a href="../index.html">会場：かでるホール</a></p></dd>
        </dl>
        <section id="sOffice">
          <ul class="infoData">
            <li class="address"><span class="label">住所:</span>札幌市中央区北2条7丁目</li>
          </ul>
        </section>
      </body>
    </html>
  `;
  const ev = mod.extractKaderuDetailEvent({
    source,
    url: "https://homepage.kaderu27.or.jp/event/self/o03676000000040x.html",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-04-13");
  assert.strictEqual(ev.end_date, "2026-04-16");
  assert.strictEqual(ev.venue, "かでるホール");
  assert.strictEqual(ev.venue_address, "札幌市中央区北2条7丁目");
}

async function testExtractMountAliveSiteRuleEventUsesMetaFields() {
  const mod = await loadModule();
  const source = { id: "www-mountalive-com-schedule", name: "Mount Alive", url: "https://www.mountalive.com/schedule/", priority: "A" };
  const html = `
    <html>
      <head>
        <meta name="description" content="日程：2026年4月11日｜イベント名：KK60 ?コイズミ記念館? KYOKO KOIZUMI TOUR 2026｜アーティスト名：小泉今日子｜会場名：札幌文化芸術劇場hitaru：札幌市中央区北1条西1丁目" />
        <title>KK60 | MOUNT ALIVE</title>
      </head>
      <body>
        <p id="op_st_time">OPEN 17:00 / START 18:00</p>
      </body>
    </html>
  `;
  const ev = mod.extractMountAliveSiteRuleEvent({
    source,
    url: "https://www.mountalive.com/schedule/more.php?no=3875",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-04-11");
  assert.strictEqual(ev.venue, "札幌文化芸術劇場 hitaru");
  assert.strictEqual(ev.open_time, "17:00");
  assert.strictEqual(ev.start_time, "18:00");
}

async function testDecodeHtmlEntitiesSupportsNumericReferenceViaTitleBuilders() {
  const mod = await loadModule();
  const source = { id: "www-mountalive-com-schedule", name: "Mount Alive", url: "https://www.mountalive.com/schedule/", priority: "A" };
  const html = `
    <html>
      <head>
        <meta name="description" content="日程：2026年4月12日｜イベント名：全員優勝パレードツアー&#10084;&#65038;｜アーティスト名：全員優勝VICTORY25｜会場名：札幌文化芸術劇場hitaru：札幌市中央区北1条西1丁目" />
        <title>VICTORY25 | MOUNT ALIVE</title>
      </head>
      <body>
        <p id="op_st_time">OPEN 17:00 / START 18:00</p>
      </body>
    </html>
  `;
  const ev = mod.extractMountAliveSiteRuleEvent({
    source,
    url: "https://www.mountalive.com/schedule/more.php?no=3789",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.ok(ev.title.includes("❤"));
}

async function testExtractZeppSapporoSiteRuleEventAvoidsDuplicateArtistPrefix() {
  const mod = await loadModule();
  const source = { id: "www-zepp-co-jp-hall-sapporo-schedule", name: "Zepp Sapporo", url: "https://www.zepp.co.jp/hall/sapporo/schedule/", priority: "A" };
  const html = `
    <html>
      <body>
        <span class="sch-single-headelin-date__year">2026</span>
        <span class="sch-single-headelin-date__month">03.26</span>
        <h3 class="sch-single-headeline02">UVERworld</h3>
        <h2 class="sch-single-headelin-ttl">UVERworld ZERO LAG TOUR</h2>
        <div class="sch-single-table-time__open">17:30</div>
        <div class="sch-single-table-time__start">18:30</div>
      </body>
    </html>
  `;
  const ev = mod.extractZeppSapporoSiteRuleEvent({
    source,
    url: "https://www.zepp.co.jp/hall/sapporo/schedule/single/?rid=153803",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.title, "UVERworld ZERO LAG TOUR");
}

async function testExtractZeppSapporoSiteRuleEventDropsBracketAliasOnDuplicatePrefix() {
  const mod = await loadModule();
  const source = { id: "www-zepp-co-jp-hall-sapporo-schedule", name: "Zepp Sapporo", url: "https://www.zepp.co.jp/hall/sapporo/schedule/", priority: "A" };
  const html = `
    <html>
      <body>
        <span class="sch-single-headelin-date__year">2026</span>
        <span class="sch-single-headelin-date__month">03.22</span>
        <h3 class="sch-single-headeline02">M.S.S Project【エム エス エス プロジェクト】</h3>
        <h2 class="sch-single-headelin-ttl">M.S.S Project Tour 2026</h2>
        <div class="sch-single-table-time__open">17:15</div>
        <div class="sch-single-table-time__start">18:00</div>
      </body>
    </html>
  `;
  const ev = mod.extractZeppSapporoSiteRuleEvent({
    source,
    url: "https://www.zepp.co.jp/hall/sapporo/schedule/single/?rid=150709",
    html,
    nowYmd: "2026-03-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.title, "M.S.S Project Tour 2026");
}

async function testBuildWessEventTrimsDuplicateArtistPrefix() {
  const mod = await loadModule();
  const source = {
    id: "wess-jp-concert-schedule",
    name: "WESS",
    url: "https://wess.jp/concert-schedule/",
    category: "コンサートプロモーター",
    priority: "S"
  };
  const post = {
    title: "ASIAN KUNG-FU GENERATION",
    link: "https://wess.jp/ajikan/",
    meta: {
      kouenbi: "20260313",
      artist: "ASIAN KUNG-FU GENERATION",
      concerttitle: "ASIAN KUNG-FU GENERATIONFrom the Northern Land '26 \"Friendship\"",
      kaijo: "PENNY LANE24",
      kaijojikan: "18:00",
      kaienjikan: "19:00"
    }
  };
  const ev = mod.eventFromWessPost(post, source);
  assert.ok(ev);
  assert.strictEqual(ev.title, "ASIAN KUNG-FU GENERATION From the Northern Land '26 \"Friendship\"");
  assert.strictEqual(ev.venue, "PENNY LANE24");
}

async function testExtractArtparkDetailEventUsesLabeledFields() {
  const mod = await loadModule();
  const source = { id: "artpark-or-jp-tenrankai-events", name: "札幌芸術の森", url: "https://artpark.or.jp/tenrankai-events/", priority: "A" };
  const html = `
    <html>
      <head><title>ライラックチャリティ MUSIC LAMP Vol.15 | 札幌芸術の森</title></head>
      <body>
        <dl class="box-2 clearfix">
          <dt>会期</dt>
          <dd>2026年2月21日（土）</dd>
          <dt>時間</dt>
          <dd>開場15:15 / 開演16:00 （18:20頃終演予定）</dd>
          <dt>会場</dt>
          <dd><p><span>札幌市教育文化会館 大ホール</span><span>（札幌市中央区北1条西13丁目）</span></p></dd>
        </dl>
      </body>
    </html>
  `;
  const ev = mod.extractArtparkDetailEvent({
    source,
    url: "https://artpark.or.jp/tenrankai-event/music-lamp-vol-15/",
    html,
    nowYmd: "2026-02-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-02-21");
  assert.strictEqual(ev.venue, "札幌市教育文化会館 大ホール");
  assert.strictEqual(ev.open_time, "15:15");
  assert.strictEqual(ev.start_time, "16:00");
}

async function testExtractSapporoFactoryMonthlyEventsUsesMonthlyCards() {
  const mod = await loadModule();
  const source = { id: "sapporofactory-jp-event", name: "サッポロファクトリー", url: "https://sapporofactory.jp/event/", priority: "A" };
  const html = `
    <html>
      <body>
        <ul class="article">
          <li class="js-fadeup"><a href="/event/detail/522">
            <div class="picture"><img src="/theme/sf/files/event/ID00000522-20260307_161214-img.jpg" alt=""></div>
            <div class="text">
              <p class="date">2026年3月27日（金）～30日（月）</p>
              <p class="title">Disney公認アーティスト マセイ展</p>
            </div>
          </a></li>
        </ul>
        <table>
          <tr class="lane-cinema">
            <td class="td-ttl"><p class="td-text"><a href="/event/detail/522">Disney公認アーティスト マセイ展</a></p></td>
            <td class="td-place"><p>サッポロファクトリーホール</p></td>
          </tr>
        </table>
      </body>
    </html>
  `;
  const events = mod.extractSapporoFactoryMonthlyEvents({
    source,
    url: "https://sapporofactory.jp/event/?ym=2026-03",
    html,
    nowYmd: "2026-03-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-03-27");
  assert.strictEqual(events[0].end_date, "2026-03-30");
  assert.strictEqual(events[0].venue, "サッポロファクトリーホール");
}

async function testExtractMoleFeedEventsFromCategoryFeed() {
  const mod = await loadModule();
  const source = { id: "mole-sapporo-jp-schedule", name: "Sound Lab mole", url: "https://mole-sapporo.jp/schedule/", priority: "B" };
  const html = `
    <rss>
      <channel>
        <item>
          <title>KOHAKU Presents. release tour</title>
          <link>https://mole-sapporo.jp/kohaku-release-tour/</link>
          <description><![CDATA[2026/12/20（日） OPEN 18:30/START 19:00 前売￥3,800 出演：KOHAKU]]></description>
          <content:encoded><![CDATA[<p>2026/12/20（日）</p><p>OPEN 18:30/START 19:00</p>]]></content:encoded>
        </item>
      </channel>
    </rss>
  `;
  const events = mod.extractMoleFeedEvents({
    source,
    url: "https://mole-sapporo.jp/category/event/live/feed/",
    html,
    nowYmd: "2026-03-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-12-20");
  assert.strictEqual(events[0].venue, "Sound Lab mole");
  assert.strictEqual(events[0].open_time, "18:30");
  assert.strictEqual(events[0].start_time, "19:00");
}

async function testExtractCaretexSiteRuleEvent() {
  const mod = await loadModule();
  const source = { id: "sapporo-caretex-jp", name: "CareTEX札幌", url: "https://sapporo.caretex.jp/", priority: "A" };
  const html = `
    <html><body>
      介護業界 北海道 最大級の商談型展示会
      2026年 9 月 16 日（水）・ 17 日（木）
      （開場時間 9：30～17：00）
      アクセスサッポロ 大展示場
    </body></html>
  `;
  const ev = mod.extractCaretexSiteRuleEvent({
    source,
    url: source.url,
    html,
    nowYmd: "2026-04-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-09-16");
  assert.strictEqual(ev.end_date, "2026-09-17");
  assert.strictEqual(ev.venue, "アクセスサッポロ");
}

async function testExtractHtbEventDetailEventsPrefersSapporoSection() {
  const mod = await loadModule();
  const source = { id: "www-htb-co-jp-event", name: "HTB", url: "https://www.htb.co.jp/event/", priority: "A" };
  const body = `
    <section class="venueMunicipalities sapporo" id="sapporoLink">
      <h2><span>札幌公演 開催概要</span></h2>
      <dl><dt>公演日時</dt><dd>2026年4月10日(金) 開演18:30 開場17:45</dd></dl>
      <dl><dt>会　　場</dt><dd>札幌コンサートホール Kitara 大ホール</dd></dl>
    </section>
    <section class="venueMunicipalities otofuke" id="otofukeLink">
      <h2><span>音更公演 開催概要</span></h2>
      <dl><dt>公演日時</dt><dd>2026年4月12日(日) 開演17:00 開場16:00</dd></dl>
      <dl><dt>会　　場</dt><dd>音更町文化センター大ホール</dd></dl>
    </section>
  `;
  const html = `
    <html>
      <head>
        <title>HTB Classic 村治佳織 リサイタル北海道ツアー</title>
        <meta property="og:title" content="HTB Classic 村治佳織 リサイタル北海道ツアー" />
      </head>
      <body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { body } } })}</script>
      </body>
    </html>
  `;
  const events = mod.extractHtbEventDetailEvents({
    source,
    url: "https://www.htb.co.jp/event/muraji2026/",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].start_date, "2026-04-10");
  assert.strictEqual(events[0].venue, "札幌コンサートホール Kitara 大ホール");
}

async function testExtractSapporoCityJazzNewsEvents() {
  const mod = await loadModule();
  const source = { id: "sapporocityjazz-jp", name: "SAPPORO CITY JAZZ", url: "https://sapporocityjazz.jp/", priority: "A" };
  const html = `
    <html>
      <head><title>パークジャズライブ＆コンテスト 開催・募集日程決定！ | SAPPORO CITY JAZZ</title></head>
      <body>
        <p>■パークジャズライブ 2026年7月18日（土）、19日（日）</p>
        <p>会場：大通公園２丁目、札幌市民交流プラザ３階クリエイティブスタジオ、札幌駅前通地下歩行空間北３条広場など札幌市内約10か所を予定</p>
        <p>■パークジャズライブコンテスト 2026年7月20日（月・祝）</p>
        <p>会場：札幌市民交流プラザ３階クリエイティブスタジオ</p>
      </body>
    </html>
  `;
  const events = mod.extractSapporoCityJazzNewsEvents({
    source,
    url: "https://sapporocityjazz.jp/2026/02/03/news-799/",
    html,
    nowYmd: "2026-04-01"
  });
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].start_date, "2026-07-18");
  assert.strictEqual(events[0].end_date, "2026-07-19");
  assert.strictEqual(events[1].start_date, "2026-07-20");
}

async function testExtractSummerfesDetailEvents() {
  const mod = await loadModule();
  const source = { id: "www-sapporo-travel-summerfes", name: "夏まつり", url: "https://www.sapporo.travel/summerfes/", priority: "A" };
  const detail = {
    content: `
      <p>1 福祉協賛さっぽろ大通ビアガーデン<br>会期：2026年7月23日（木）～8月18日（火）</p>
      <p>2 北海盆踊り<br>会期：2026年8月13日（木）～8月16日（日）</p>
      <p>3 第62回すすきの祭り<br>会期：2026年8月6日(木)～8月8日(土)</p>
      <p>4 第73回狸まつり<br>会期：2026年7月23日(木)～8月18日(火)</p>
    `
  };
  const events = mod.extractSummerfesDetailEvents({
    source,
    detail,
    detailUrl: "https://www.sapporo.travel/summerfes/news/detail/621/",
    nowYmd: "2026-03-08"
  });
  assert.strictEqual(events.length, 4);
  assert.strictEqual(events[0].start_date, "2026-07-23");
  assert.strictEqual(events[1].start_date, "2026-08-13");
}

async function testExtractNoMapsNearlyEvent() {
  const mod = await loadModule();
  const source = { id: "no-maps-jp-program", name: "NoMaps", url: "https://no-maps.jp/program/", priority: "A" };
  const html = `
    <html>
      <head><title>北海道 × 東京 “共創BAR” | NoMaps</title></head>
      <body>
        <h1 class="page_article_title">北海道 × 東京 “共創BAR”</h1>
        <dl><dt>日時</dt><dd>2026年3月24日（火）<br />19:00～23:00</dd></dl>
        <dl><dt>会場</dt><dd><a href="https://example.com">BAR / THE FLYING PENGUINS</a></dd></dl>
      </body>
    </html>
  `;
  const ev = mod.extractNoMapsNearlyEvent({
    source,
    url: "https://no-maps.jp/nearly-event/260324/",
    html,
    nowYmd: "2026-03-08"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-03-24");
  assert.strictEqual(ev.venue, "BAR THE FLYING PENGUINS");
}

async function testExtractGrand1934EventDetailEvent() {
  const mod = await loadModule();
  const source = { id: "grand1934-com-meeting-banquet", name: "札幌グランドホテル", url: "https://grand1934.com/event/", priority: "B" };
  const html = `
    <html>
      <head><title>林 美奈子 個展 | 札幌グランドホテル</title></head>
      <body>
        <h2 class="eventDetail-info_ttl">林 美奈子 個展 粒々研究所 g 分室</h2>
        <section class="eventDetail-summary">
          <ul>
            <li><p>開催日</p><p>2026年2月26日(木)－2026年4月14日(火)</p></li>
            <li><p>会場</p><p>グランビスタ ギャラリー サッポロ</p></li>
          </ul>
        </section>
      </body>
    </html>
  `;
  const ev = mod.extractGrand1934EventDetailEvent({
    source,
    url: "https://grand1934.com/event/gallery_202602/",
    html,
    nowYmd: "2026-03-08"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-02-26");
  assert.strictEqual(ev.end_date, "2026-04-14");
}

async function testExtractKeioPlazaEventDetailEvent() {
  const mod = await loadModule();
  const source = { id: "www-keioplaza-sapporo-co-jp-banq-hall", name: "京王プラザホテル札幌", url: "https://www.keioplaza-sapporo.co.jp/event/", priority: "B" };
  const html = `
    <html>
      <head><title>シマエナガルーム | 京王プラザホテル札幌</title></head>
      <body>
        <p class="ja_nameonly">シマエナガルーム</p>
        <div>販売期間 2025年12月24日(水)～2026年1月4日(日)</div>
      </body>
    </html>
  `;
  const ev = mod.extractKeioPlazaEventDetailEvent({
    source,
    url: "https://www.keioplaza-sapporo.co.jp/event/detail_1598.html",
    html,
    nowYmd: "2025-12-01"
  });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2025-12-24");
  assert.strictEqual(ev.end_date, "2026-01-04");
}

async function testExtractSnowfesSiteRuleEvent() {
  const mod = await loadModule();
  const source = { id: "www-snowfes-com", name: "雪まつり", url: "https://www.snowfes.com/", priority: "S" };
  const html = `<html><body>次回は2027年2月4日（木）～2月11日（木・祝）で開催予定です。</body></html>`;
  const ev = mod.extractSnowfesSiteRuleEvent({ source, url: source.url, html, nowYmd: "2026-03-08" });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2027-02-04");
  assert.strictEqual(ev.end_date, "2027-02-11");
}

async function testExtractYosakoiSiteRuleEvent() {
  const mod = await loadModule();
  const source = { id: "www-yosakoi-soran-jp", name: "YOSAKOI", url: "https://www.yosakoi-soran.jp/", priority: "S" };
  const html = `<html><body>2026年 第35回YOSAKOIソーラン祭り 6月10日(水)～14日(日)開催！</body></html>`;
  const ev = mod.extractYosakoiSiteRuleEvent({ source, url: source.url, html, nowYmd: "2026-03-08" });
  assert.ok(ev);
  assert.strictEqual(ev.start_date, "2026-06-10");
  assert.strictEqual(ev.end_date, "2026-06-14");
}

async function testSiteRuleUsesCuratedPublishThreshold() {
  const mod = await loadModule();
  const ev = {
    title: "さっぽろ雪まつり",
    start_date: "2027-02-04",
    end_date: "2027-02-11",
    venue: "大通公園・つどーむ・すすきの",
    venue_address: "札幌市内各会場",
    detail_url: "https://www.snowfes.com/",
    extraction_method: "site_rule",
    quality_score: 0.57
  };
  assert.strictEqual(mod.isPublishable(ev), true);
}

async function testMergeCrossSourceNearDuplicatesMergesSimilarTitles() {
  const mod = await loadModule();
  const events = [
    {
      id: "community-plaza-akira",
      source_id: "www-sapporo-community-plaza-jp-event-php",
      source_priority_score: 3,
      quality_score: 0.88,
      title: "AKIRA FUSE LIVE TOUR 2026",
      start_date: "2026-03-17",
      venue: "札幌文化芸術劇場 hitaru",
      start_time: "18:00",
      detail_url: "https://www.sapporo-community-plaza.jp/event.php?num=4800",
      flyer_image_url: ""
    },
    {
      id: "hbc-akira",
      source_id: "www-hbc-co-jp-event",
      source_priority_score: 3,
      quality_score: 0.81,
      title: "布施明 AKIRA FUSE LIVE TOUR 2025-2026",
      start_date: "2026-03-17",
      venue: "札幌文化芸術劇場hitaru",
      start_time: "18:00",
      detail_url: "https://adash.jp/fuse2026-0317.html",
      flyer_image_url: "https://example.com/fuse.jpg"
    }
  ];

  const merged = mod.mergeCrossSourceNearDuplicates(events);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].title, "AKIRA FUSE LIVE TOUR 2026");
  assert.strictEqual(merged[0].flyer_image_url, "https://example.com/fuse.jpg");
}

async function testMergeCrossSourceNearDuplicatesKeepsProgramVariantsSeparate() {
  const mod = await loadModule();
  const events = [
    {
      id: "kitara-a",
      source_id: "www-kitara-sapporo-or-jp-event",
      source_priority_score: 3,
      quality_score: 0.9,
      title: "UNDERTALE 10th Anniversary Concert 2026 札幌公演 プログラムA",
      start_date: "2026-03-14",
      venue: "札幌コンサートホール Kitara 大ホール",
      start_time: "",
      detail_url: "https://www.kitara-sapporo.or.jp/event/event_detail.php?num=6935"
    },
    {
      id: "kitara-b",
      source_id: "www-hbc-co-jp-event",
      source_priority_score: 3,
      quality_score: 0.82,
      title: "UNDERTALE 10th Anniversary Concert 2026 札幌公演 プログラムB",
      start_date: "2026-03-14",
      venue: "札幌コンサートホール Kitara(大ホール)",
      start_time: "",
      detail_url: "https://example.com/undertale-program-b"
    }
  ];

  const merged = mod.mergeCrossSourceNearDuplicates(events);
  assert.strictEqual(merged.length, 2);
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
    ["エスコンフィールドは札幌圏判定で通す", testAllowEsconFieldVenue],
    ["WESS API から札幌公演を組み立てる", testBuildWessEventFromApiPost],
    ["CLI 引数で未来日と対象ソースを指定できる", testParseArgsSupportsTodayAndSource],
    ["HBC 一覧は札幌圏会場だけ拾う", testExtractHbcConcertEventsFiltersToSapporoArea],
    ["教文一覧はホール情報付きで組み立てる", testExtractKyobunScheduleEventsBuildsHallVenue],
    ["JETRO 一覧はゼロ埋め日付を正しく拾う", testExtractJetroJmesseHandlesZeroPaddedDates],
    ["カナモトホール月別ページを組み立てる", testExtractSapporoShiminhallScheduleEventsFromMonthlyPage],
    ["ちえりあカレンダーHTMLを組み立てる", testExtractChieriaHallScheduleEventsFromCalendarView],
    ["アクセスサッポロ月別カレンダーを組み立てる", testExtractAxesCalendarEventsFromMonthlyCalendar],
    ["ファイターズ日程はホームゲームだけ拾う", testExtractFightersHomeGameEvents],
    ["かでる会場別イベントを組み立てる", testExtractKaderuVenueEventsFromHallPage],
    ["SPiCE一覧は休業日を除外する", testExtractSpiceScheduleListingEventsSkipsStatusRows],
    ["SPiCE詳細は OPEN/START を拾う", testExtractSpiceScheduleDetailEventUsesOpenStart],
    ["PMF詳細はラベル付き項目から組み立てる", testExtractPmfScheduleDetailEventUsesLabeledSections],
    ["市民交流プラザは内部利用を除外する", testExtractSapporoCommunityPlazaSiteRuleEventSkipsInternalUse],
    ["かでる詳細は詳細ページの会場を優先する", testExtractKaderuDetailEventUsesDetailVenue],
    ["Mount Alive 詳細は meta と時間行から組み立てる", testExtractMountAliveSiteRuleEventUsesMetaFields],
    ["numeric entity はタイトルへデコードされる", testDecodeHtmlEntitiesSupportsNumericReferenceViaTitleBuilders],
    ["Zepp は artist/title の重複連結を避ける", testExtractZeppSapporoSiteRuleEventAvoidsDuplicateArtistPrefix],
    ["Zepp は括弧付き別名の重複を落とす", testExtractZeppSapporoSiteRuleEventDropsBracketAliasOnDuplicatePrefix],
    ["WESS は artist/title の重複接頭辞を詰める", testBuildWessEventTrimsDuplicateArtistPrefix],
    ["芸術の森詳細はラベル付き項目から組み立てる", testExtractArtparkDetailEventUsesLabeledFields],
    ["サッポロファクトリー月別ページを組み立てる", testExtractSapporoFactoryMonthlyEventsUsesMonthlyCards],
    ["mole RSS から日付と時間を拾う", testExtractMoleFeedEventsFromCategoryFeed],
    ["CareTEX札幌の会期を拾う", testExtractCaretexSiteRuleEvent],
    ["HTB詳細は札幌セクションを優先する", testExtractHtbEventDetailEventsPrefersSapporoSection],
    ["CITY JAZZ のニュース記事から開催日を拾う", testExtractSapporoCityJazzNewsEvents],
    ["夏まつり JSON 詳細から各行事を拾う", testExtractSummerfesDetailEvents],
    ["NoMaps 近日イベント詳細から日時と会場を拾う", testExtractNoMapsNearlyEvent],
    ["札幌グランドホテル詳細から会期を拾う", testExtractGrand1934EventDetailEvent],
    ["京王プラザ詳細から会期を拾う", testExtractKeioPlazaEventDetailEvent],
    ["雪まつりの次回会期を拾う", testExtractSnowfesSiteRuleEvent],
    ["YOSAKOIの開催日を拾う", testExtractYosakoiSiteRuleEvent],
    ["site_rule は curated 閾値で公開する", testSiteRuleUsesCuratedPublishThreshold],
    ["cross-source dedupe は近似タイトルを統合する", testMergeCrossSourceNearDuplicatesMergesSimilarTitles],
    ["cross-source dedupe はプログラム違いを残す", testMergeCrossSourceNearDuplicatesKeepsProgramVariantsSeparate]
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
