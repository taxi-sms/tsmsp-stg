# Event Extraction Source Classification

最終更新: 2026-03-09

## 目的

`config/event-sources.json` の全 55 source を、今後の抽出品質改善のために以下の 3 区分へ固定する。

- `共通でいける`
  共通 adapter と source ごとの軽い設定だけで安定化可能。専用 parser は不要。
- `サイト群ルールでいける`
  同系統サイト向けの shared parser が必要。1 サイト単位のベタ実装ではなく、family 単位で潰す。
- `個別必須`
  年度ごとに構造が変わる、文脈依存が強い、DOM/文言が特殊、または JS 依存が強く、専用 rule が必要。

## 判定基準

- `共通でいける`
  JSON-LD、固定カレンダー、テーブル、一覧+詳細の素直な HTML で抽出できる。
- `サイト群ルールでいける`
  音楽興行、公共ホール、放送局、チケット販売、宴会/貸会議室など、同じ崩れ方をするサイト群。
- `個別必須`
  季節イベント、祭り、年次特設サイト、複雑な program ページ、複数イベントが 1 ページに混在する公式特設。

## 集計

- 共通でいける: 13
- サイト群ルールでいける: 31
- 個別必須: 11
- 合計: 55

## 共通でいける

共通 adapter の対象。`source config` の追加・微調整は必要だが、専用 parser を増やす対象ではない。

1. `www-city-sapporo-jp-keizai-kanko-event-event-html`
   札幌市イベントカレンダー。公的一覧ページ型。
2. `www-sapporo-travel-event`
   ようこそさっぽろのイベント一覧。観光 portal 一覧型。
3. `www-conventionsapporo-jp` `disabled`
   convention portal 型。再有効化時も共通 adapter で扱う。
4. `www-jetro-go-jp-j-messe-country-asia-jp-001`
   展示会 portal。一覧/詳細が素直。
5. `www-jma-or-jp-toshiken-hkd-index-php`
   展示会総合ページ。詳細導線が固定。
6. `www-business-expo-jp`
   年次 expo 公式。構造が比較的単純。
7. `www-fighters-co-jp-game-calendar`
   カレンダー型。イベント種別も明確。
8. `www-sapporo-sport-jp-tsudome-calendar`
   月次カレンダー型。
9. `www-sora-scc-jp`
   札幌コンベンションセンター。共通詳細抽出で寄せやすい。
10. `www-axes-or-jp`
    アクセスサッポロ。展示会一覧型。
11. `seminar-sapporosansin-jp`
    セミナー一覧/詳細型。
12. `www-city-sapporo-jp-keizai-seminar-index-html`
    札幌市セミナー一覧型。
13. `sapporo-caretex-jp`
    見本市テンプレ系。共通 expo adapter 対象。

## サイト群ルールでいける

family 単位の shared parser を作る対象。ここは「1 サイトずつ」ではなく「群ルール」で潰す。

### 1. 興行主 / ライブハウス / 音楽会場系

日程、開場/開演、会場、チケット文言の持ち方が近い。`music_schedule_family` としてまとめる。

1. `wess-jp-concert-schedule`
2. `www-mountalive-com-schedule`
3. `www-zepp-co-jp-hall-sapporo-schedule`
4. `www-pl24-jp-schedule-html`
5. `www-cube-garden-com-live-php`
6. `mole-sapporo-jp-schedule`
7. `spice-sapporo-jp-schedule`
8. `www-pmf-or-jp-jp-schedule`

### 2. 公共ホール / 文化施設 / 商業施設イベント系

一覧ページから詳細へ飛ぶ、またはホール月次予定表を持つ型。`public_hall_family` としてまとめる。

1. `www-sapporo-community-plaza-jp-event-php`
2. `www-kitara-sapporo-or-jp-event`
3. `www-sapporo-shiminhall-org`
4. `www-kyobun-org-event-schedule-html`
5. `chieria-slp-or-jp-schedule`
6. `homepage-kaderu27-or-jp-event-news-index-html`
7. `artpark-or-jp-tenrankai-events`
8. `sapporofactory-jp-event`

### 3. 放送局イベント系

イベント一覧から詳細へ遷移するメディア型。`broadcaster_event_family` としてまとめる。

1. `www-hbc-co-jp-event`
2. `www-stv-jp-event-index-html`
3. `www-htb-co-jp-event`
4. `www-uhb-jp-event`

### 4. プレイガイド / チケット販売系

card/listing の設計が近い。`ticket_vendor_family` としてまとめる。`browser_required` もこの family 配下で扱う。

2026-03-09 方針:
- 現在のイベント抽出改善 `Wave 1` では実装対象から外す
- source 自体の再開・停止判断は別タスクで扱う
- family 分類だけ維持する

1. `doshin-playguide-jp`
2. `t-pia-jp-hokkaido` `disabled`
3. `eplus-jp-sf-area-hokkaido-tohoku-hokkaido-sapporo` `disabled`
4. `l-tike-com-hokkaido` `disabled`

### 5. 宴会場 / ホテル / 貸会議室 / 研修会場系

イベント専用 CMS ではなく、施設ページ中の event/news を拾う型。`meeting_venue_family` としてまとめる。

1. `www-keioplaza-sapporo-co-jp-banq-hall`
2. `grand1934-com-meeting-banquet`
3. `www-okura-nikko-com-ja-japan-sapporo-jr-tower-hotel-nikko-sa` `disabled`
4. `grand-mercure-sapporo-odoripark-jp-events` `disabled`
5. `www-hotelgp-sapporo-com-banquet-hall-large`
6. `www-acu-h-jp-sapporo` `disabled`
7. `www-kashikaigishitsu-net-facilitys-gc-sapporo` `disabled`

## 個別必須

専用 rule を前提にする。ここを無理に汎用化しない。

1. `www-sapporo-dome-co-jp-dome`
   ドーム公式。イベント文脈がスポーツ/ライブ/施設案内で混在しやすい。
2. `odori-park-jp`
   公園 portal。イベント告知・公園情報・案内文の混在が強い。
3. `www-snowfes-com`
   年次特設サイト。構造変動が大きい。
4. `www-yosakoi-soran-jp`
   祭り公式。開催概要と program が混在。
5. `www-sapporo-travel-autumnfest`
   季節特設。現在も custom rule 対象。
6. `www-sapporo-travel-summerfes`
   季節特設。現在も custom rule 対象。
7. `www-sapporo-travel-white-illumination`
   季節特設。現在も custom rule 対象。
8. `www-sapporo-travel-white-illumination-event-munich`
   特設下位ページ。会期・個別企画が混在。
9. `www-sapporo-travel-lilacfes-about`
   季節特設。現在も custom rule 対象。
10. `sapporocityjazz-jp`
    festival/news/program が混在。記事型でも会期抽出が特殊。
11. `no-maps-jp-program`
    program 型で文脈依存が強い。個別対応を維持する。

## 実装順

`全サイトをまともに取れる状態` に近づける順番は、source 単位ではなく family 単位で進める。

### Wave 1

売上影響が大きく、件数も多い family から潰す。

- 興行主 / ライブハウス / 音楽会場系
- 公共ホール / 文化施設系

対象:

- `wess-jp-concert-schedule`
- `www-mountalive-com-schedule`
- `www-zepp-co-jp-hall-sapporo-schedule`
- `www-pl24-jp-schedule-html`
- `www-cube-garden-com-live-php`
- `mole-sapporo-jp-schedule`
- `spice-sapporo-jp-schedule`
- `www-pmf-or-jp-jp-schedule`
- `www-sapporo-community-plaza-jp-event-php`
- `www-kitara-sapporo-or-jp-event`
- `www-sapporo-shiminhall-org`
- `www-kyobun-org-event-schedule-html`
- `chieria-slp-or-jp-schedule`
- `homepage-kaderu27-or-jp-event-news-index-html`
- `artpark-or-jp-tenrankai-events`
- `sapporofactory-jp-event`

### Wave 2

公的 portal と media family を共通化して取りこぼしを減らす。

対象:

- `www-city-sapporo-jp-keizai-kanko-event-event-html`
- `www-sapporo-travel-event`
- `www-conventionsapporo-jp`
- `www-jetro-go-jp-j-messe-country-asia-jp-001`
- `www-jma-or-jp-toshiken-hkd-index-php`
- `www-business-expo-jp`
- `www-fighters-co-jp-game-calendar`
- `www-sapporo-sport-jp-tsudome-calendar`
- `www-sora-scc-jp`
- `www-axes-or-jp`
- `seminar-sapporosansin-jp`
- `www-city-sapporo-jp-keizai-seminar-index-html`
- `sapporo-caretex-jp`
- `www-hbc-co-jp-event`
- `www-stv-jp-event-index-html`
- `www-htb-co-jp-event`
- `www-uhb-jp-event`
- `www-keioplaza-sapporo-co-jp-banq-hall`
- `grand1934-com-meeting-banquet`
- `www-okura-nikko-com-ja-japan-sapporo-jr-tower-hotel-nikko-sa`
- `grand-mercure-sapporo-odoripark-jp-events`
- `www-hotelgp-sapporo-com-banquet-hall-large`
- `www-acu-h-jp-sapporo`
- `www-kashikaigishitsu-net-facilitys-gc-sapporo`

### Wave 3

最後に個別 rule 前提の難所を潰す。

対象:

- `www-sapporo-dome-co-jp-dome`
- `odori-park-jp`
- `www-snowfes-com`
- `www-yosakoi-soran-jp`
- `www-sapporo-travel-autumnfest`
- `www-sapporo-travel-summerfes`
- `www-sapporo-travel-white-illumination`
- `www-sapporo-travel-white-illumination-event-munich`
- `www-sapporo-travel-lilacfes-about`
- `sapporocityjazz-jp`
- `no-maps-jp-program`

## 実装ルール

以後は次の方針で進める。

1. `heuristic` は「候補生成」に限定し、公開ロジックは段階的に縮小する。
2. family rule を追加するときは、同 family の最低 3 source 以上に効く形で作る。
3. `個別必須` は最初から専用 rule 前提で進める。
4. source を直したら、その source 専用の fixture と regression test を必ず追加する。
5. disabled source も分類対象に含め、再有効化前提で同じ family に乗せる。

## 次にやること

1. Wave 1 の family ごとに parser 境界を定義する。
2. family 単位の fixture を追加する。
3. その後に source ごとの不足だけ個別補正する。
