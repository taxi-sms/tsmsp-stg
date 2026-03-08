#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const TIMEZONE = 'Asia/Tokyo';
const SOURCE_PATH = path.resolve(process.cwd(), 'config/event-sources.json');
const STRATEGY_PATH = path.resolve(process.cwd(), 'config/event-source-strategies.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'data/events.json');

const PRIORITY_SCORE = { S: 4, A: 3, B: 2, C: 1 };
const EVENT_TEXT_RE = /(event|events|schedule|festival|concert|live|seminar|exhibition|show|meetup|fair|開催|公演|展示|ライブ|フェス|祭|イベント|セミナー)/i;
const BAD_TITLE_RE = /(宴会場|会議室|客室|宿泊|ご案内|施設案内|貸し会議室|トップページ|無料で使える|他のイベントを見る|今週末のおすすめイベント|公演・チケット情報|イベント一覧|大宴会場案内|^明日\(\)開催$|一覧表示|リスト表示|公演一覧|イベントスケジュール|主催公演|公演情報|イベント情報|近日開催イベント|歴史と開催結果|期間中の様々なイベント|託児サービス対象公演|ビジネスセミナー|セミナー情報|チケット詳細はこちら|NEW\s*キャンペーン|キャンペーン|調査結果|結果報告|入札情報|審議会)/i;
const WEAK_TITLE_RE = /^(イベント|イベント情報|event|events|schedule)(\s*[|｜:].*)?$/i;
const BAD_URL_RE = /\/banq\/|\/banquet\/|\/stay\/|\/guestroom\//i;
const BAD_VENUE_RE = /(ご案内|ご了承ください|公開される場合|お問い合わせ|お問合せ|チケット|SOLD\s*OUT|当日券|販売|先行|整列|詳細|一覧|トップ|公式サイト|アクセスはこちら)/i;
const DETAIL_URL_SIGNAL_RE = /(event[_-]?detail|\/detail\/|eventid=|eventcd=|eventbundlecd=|[?&](id|num|no|eid)=|\/seminar\/\d+|\/\d{4}\/\d{1,2}\/\d{1,2}\/)/i;
const LISTING_URL_SIGNAL_RE = /(schedule|event|events|calendar|live|program|news|archive|month|hall|concert|seminar)/i;
const JSONLD_SCRIPT_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const MIN_QUALITY_SCORE = 0.56;
const MIN_QUALITY_SCORE_HEURISTIC = 0.58;
const SOURCE_VENUE_FALLBACK = {
  'www-kitara-sapporo-or-jp-event': '札幌コンサートホール Kitara',
  'www-zepp-co-jp-hall-sapporo-schedule': 'Zepp Sapporo',
  'www-fighters-co-jp-game-calendar': 'エスコンフィールドHOKKAIDO',
  'spice-sapporo-jp-schedule': 'SPiCE',
  'www-cube-garden-com-live-php': 'cube garden',
  'www-pl24-jp-schedule-html': 'PENNY LANE24',
  'mole-sapporo-jp-schedule': 'Sound Lab mole',
  'www-sapporo-community-plaza-jp-event-php': '札幌市民交流プラザ',
  'www-kyobun-org-event-schedule-html': '札幌市教育文化会館',
  'www-sapporo-shiminhall-org': 'カナモトホール',
  'sapporofactory-jp-event': 'サッポロファクトリー',
  'www-sapporo-dome-co-jp-dome': '大和ハウス プレミストドーム',
  'www-sora-scc-jp': '札幌コンベンションセンター',
  'www-axes-or-jp': 'アクセスサッポロ',
  'www-business-expo-jp': 'アクセスサッポロ'
  ,
  'sapporocityjazz-jp': '札幌市内会場',
  'odori-park-jp': '大通公園'
};
const SOURCE_CUSTOM_RULE_IDS = new Set([
  'www-sapporo-travel-autumnfest',
  'www-sapporo-travel-lilacfes-about',
  'www-sapporo-travel-summerfes',
  'www-sapporo-travel-white-illumination'
]);
const SAPPORO_TRAVEL_JSON_BASE = {
  'www-sapporo-travel-summerfes': 'https://www.sapporo.travel/summerfes',
  'www-sapporo-travel-lilacfes-about': 'https://www.sapporo.travel/lilacfes',
  'www-sapporo-travel-white-illumination': 'https://www.sapporo.travel/white-illumination',
  'www-sapporo-travel-white-illumination-event-munich': 'https://www.sapporo.travel/white-illumination'
};
const SOURCE_DETAIL_LIMIT_OVERRIDE = {
  'eplus-jp-sf-area-hokkaido-tohoku-hokkaido-sapporo': { full: 40, delta: 28, minScore: 2 },
  't-pia-jp-hokkaido': { full: 35, delta: 24, minScore: 2 }
};
const SAPPORO_AREA_TERMS = [
  '札幌',
  '札幌市',
  '中央区',
  '北区',
  '東区',
  '白石区',
  '厚別区',
  '豊平区',
  '清田区',
  '南区',
  '西区',
  '手稲区',
  '北広島',
  '北広島市',
  'エスコンフィールド',
  'エスコンフィールドHOKKAIDO',
  'ES CON FIELD',
  'F VILLAGE',
  'HOKKAIDO BALLPARK F VILLAGE',
  '江別',
  '江別市',
  '石狩',
  '石狩市',
  '恵庭',
  '恵庭市',
  '千歳',
  '千歳市',
  '小樽',
  '小樽市',
  '当別',
  '当別町',
  '新千歳空港',
  '大通公園',
  '中島公園',
  '真駒内',
  'すすきの',
  'さっぽろ',
  'サッポロ',
  'Zepp Sapporo',
  'Zepp札幌',
  'Kitara',
  'hitaru',
  'SCARTS',
  '北海きたえーる',
  '北海道立総合体育センター',
  'KLUB COUNTER ACTION',
  'COUNTER ACTION',
  'PENNY LANE 24',
  'ペニーレーン24',
  'cube garden',
  'PENNY LANE24',
  'SPiCE',
  'SPIRITUAL LOUNGE',
  '札幌近松',
  'BESSIE HALL',
  'Crazy Monkey',
  'Sound Lab mole',
  'カナモトホール',
  '札幌市民交流プラザ',
  '札幌文化芸術劇場',
  '札幌コンサートホール',
  '札幌コンベンションセンター',
  'アクセスサッポロ',
  'サッポロファクトリー',
  'プレミストドーム',
  'つどーむ',
  '札幌芸術の森',
  'THE FLYING PENGUINS',
  'Sapporo Social Innovation Hub',
  'IKEUCHI LAB'
];
const NON_SAPPORO_AREA_TERMS = [
  '東京',
  '東京都',
  '大阪',
  '大阪市',
  '名古屋',
  '愛知',
  '福岡',
  '仙台',
  '横浜',
  '神戸',
  '京都',
  '広島',
  '那覇',
  '旭川',
  '函館',
  '帯広',
  '釧路',
  '北見',
  '網走',
  '稚内',
  '留萌',
  '室蘭',
  '苫小牧',
  '岩見沢',
  '滝川',
  '富良野',
  '音更',
  '中標津',
  '奈井江',
  'ニセコ',
  '登別',
  '旭川市',
  '函館市',
  '帯広市',
  '釧路市',
  '北見市',
  '苫小牧市'
];
const GEO_ADDRESS_NOISE_RE = /(市長|総合受付|事務局|お問い合わせ|お問合せ|お気に入りに追加|追加しました|印刷|リスト表示|代表|経済センター\d*F)/i;
const SAPPORO_AREA_RE = new RegExp(SAPPORO_AREA_TERMS.map(escapeRegExp).join('|'), 'i');
const NON_SAPPORO_AREA_RE = new RegExp(NON_SAPPORO_AREA_TERMS.map(escapeRegExp).join('|'), 'i');

function parseArgs(argv) {
  const out = { mode: 'delta', today: '', sourceIds: [], outputPath: '' };
  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const v = arg.slice('--mode='.length).trim();
      if (v === 'delta' || v === 'full') out.mode = v;
    } else if (arg.startsWith('--today=')) {
      const v = arg.slice('--today='.length).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out.today = v;
    } else if (arg.startsWith('--source=')) {
      const v = arg.slice('--source='.length).trim();
      out.sourceIds = v
        .split(',')
        .map((x) => String(x || '').trim())
        .filter(Boolean);
    } else if (arg.startsWith('--output=')) {
      const v = arg.slice('--output='.length).trim();
      if (v) out.outputPath = path.resolve(process.cwd(), v);
    }
  }
  return out;
}

function escapeRegExp(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ymdInJst(input = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(input);
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

function addDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map((n) => Number(n));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function decodeHtmlEntities(input) {
  return String(input || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(input) {
  return decodeHtmlEntities(String(input || ''))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function textPreview(input, max = 180) {
  const t = String(input || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function normalizeGeoText(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function pickMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return '';
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = m ? stripTags(m[1]) : '';
  return title || pickMeta(html, 'og:title') || '';
}

function absolutizeUrl(baseUrl, raw) {
  if (!raw) return '';
  const href = String(raw).trim();
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return '';
  try {
    const u = new URL(href, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    u.hash = '';
    return u.toString();
  } catch (_) {
    return '';
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = absolutizeUrl(baseUrl, m[1]);
    if (!url) continue;
    const text = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) continue;
    const contextStart = Math.max(0, m.index - 180);
    const contextEnd = Math.min(html.length, re.lastIndex + 220);
    const context = stripTags(html.slice(contextStart, contextEnd)).replace(/\s+/g, ' ').trim();
    links.push({ url, text, context });
    if (links.length > 1200) break;
  }
  return links;
}

function compactYmd(ymd) {
  return String(ymd || '').replace(/\D/g, '').slice(0, 8);
}

function monthStartYmd(ymd) {
  const [y, m] = String(ymd || '').split('-').map((n) => Number(n));
  if (!y || !m) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

function nextMonthYmd(ymd) {
  const [y, m] = String(ymd || '').split('-').map((n) => Number(n));
  if (!y || !m) return '';
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function enumerateMonthStarts(fromYmd, toYmd) {
  const out = [];
  let current = monthStartYmd(fromYmd);
  const last = monthStartYmd(toYmd);
  while (current && last && current <= last) {
    out.push(current);
    current = nextMonthYmd(current);
  }
  return out;
}

function buildWindowTokens(fromYmd, toYmd, maxMonths = 6) {
  const months = enumerateMonthStarts(fromYmd, toYmd).slice(0, maxMonths);
  const tokens = new Set();
  for (const ymd of months) {
    const [y, m] = String(ymd).split('-').map((n) => Number(n));
    if (!y || !m) continue;
    tokens.add(`${y}/${m}`);
    tokens.add(`${y}/${String(m).padStart(2, '0')}`);
    tokens.add(`${y}.${m}`);
    tokens.add(`${y}.${String(m).padStart(2, '0')}`);
    tokens.add(`${y}-${m}`);
    tokens.add(`${y}-${String(m).padStart(2, '0')}`);
    tokens.add(`${y}年${m}月`);
    tokens.add(`${String(m).padStart(2, '0')}月`);
    tokens.add(`${m}月`);
  }
  return Array.from(tokens);
}

function hasWindowToken(text, tokens) {
  const t = String(text || '');
  if (!t) return false;
  return tokens.some((token) => token && t.includes(token));
}

function parseDatesFromText(text, nowYmd) {
  const out = [];
  const nowYear = Number(String(nowYmd).slice(0, 4)) || new Date().getFullYear();

  const fullRe = /(20\d{2})\s*[\/.\-年]\s*(1[0-2]|0?[1-9])\s*[\/.\-月]\s*(3[01]|[12]\d|0?[1-9])\s*日?/g;
  let m;
  while ((m = fullRe.exec(text)) !== null) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const ymd = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push({ ymd, idx: m.index });
  }

  if (out.length === 0) {
    const mdRe = /(1[0-2]|0?[1-9])\s*[\/.月]\s*(3[01]|[12]\d|0?[1-9])\s*日?/g;
    while ((m = mdRe.exec(text)) !== null) {
      const mo = Number(m[1]);
      const d = Number(m[2]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      let y = nowYear;
      const currentMd = Number(nowYmd.slice(5, 7)) * 100 + Number(nowYmd.slice(8, 10));
      const targetMd = mo * 100 + d;
      if (targetMd + 200 < currentMd) y += 1;
      const ymd = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ ymd, idx: m.index });
    }
  }

  return out;
}

function parseIsoDateParts(value) {
  const raw = String(value || '').trim();
  if (!raw) return { date: '', time: '' };
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return {
      date: `${compact[1]}-${compact[2]}-${compact[3]}`,
      time: ''
    };
  }
  const m = raw.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[T\s](\d{1,2}):?(\d{2})?)?/);
  if (!m) return { date: '', time: '' };
  const yyyy = m[1] || '';
  const mo = String(m[2] || '').padStart(2, '0');
  const dd = String(m[3] || '').padStart(2, '0');
  const date = `${yyyy}-${mo}-${dd}`;
  const hh = m[4] || '';
  const mm = m[5] || '00';
  return { date, time: hh ? `${String(hh).padStart(2, '0')}:${mm}` : '' };
}

function flattenJsonLd(input) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node['@graph'])) walk(node['@graph']);
    out.push(node);
  }
  walk(input);
  return out;
}

function readJsonLdBlocks(html) {
  const blocks = [];
  let m;
  while ((m = JSONLD_SCRIPT_RE.exec(html)) !== null) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch (_) {
      // Ignore malformed JSON-LD block
    }
  }
  return blocks;
}

function nodeTypeIncludes(node, expectedType) {
  const t = node && node['@type'];
  if (!t) return false;
  if (Array.isArray(t)) return t.some((x) => String(x || '').toLowerCase() === expectedType);
  return String(t || '').toLowerCase() === expectedType;
}

function toVenueText(location) {
  if (!location) return '';
  if (typeof location === 'string') return textPreview(location, 80);
  const name = textPreview(location.name || '', 80);
  if (name) return name;
  return '';
}

function toAddressText(location) {
  if (!location) return '';
  const addr = location.address;
  if (!addr) return '';
  if (typeof addr === 'string') return textPreview(addr, 140);
  const parts = [
    addr.postalCode || '',
    addr.addressRegion || '',
    addr.addressLocality || '',
    addr.streetAddress || ''
  ].map((x) => String(x || '').trim()).filter(Boolean);
  return textPreview(parts.join(' '), 140);
}

function normalizeHm(hour, minute = '00') {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeTagged(text, labels, preferBefore = true) {
  const normalized = String(text || '')
    .replace(/[【】\[\]（）()]/g, ' ')
    .replace(/\s+/g, ' ');
  const label = labels.join('|');
  const sep = '(?:\\s|[:：/／\\-ー〜~]|予定|開始|開演|開場)*';
  const beforeMinute = normalized.match(new RegExp(`([01]?\\d|2[0-3])[:：]([0-5]\\d)\\s*(?:${label})`, 'i'));
  const beforeHour = normalized.match(new RegExp(`([01]?\\d|2[0-3])時\\s*(?:${label})`, 'i'));
  const afterMinute = normalized.match(new RegExp(`(?:${label})${sep}([01]?\\d|2[0-3])[:：]([0-5]\\d)`, 'i'));
  const afterHour = normalized.match(new RegExp(`(?:${label})${sep}([01]?\\d|2[0-3])時`, 'i'));

  const order = preferBefore
    ? [beforeMinute, beforeHour, afterMinute, afterHour]
    : [afterMinute, afterHour, beforeMinute, beforeHour];

  for (const m of order) {
    if (!m) continue;
    if (m[2] != null) return normalizeHm(m[1], m[2]);
    return normalizeHm(m[1], '00');
  }
  return '';
}

function parseEventTimes(text) {
  const open = parseTimeTagged(text, ['開場', 'door\\s*open', 'open'], true);
  const start = parseTimeTagged(text, ['開演', '開始', 'start\\s*time', 'start'], false);
  const end = parseTimeTagged(text, ['終演', '終了', 'end\\s*time', 'end'], false);

  if (open || start || end) {
    return {
      open,
      start,
      end,
      allDay: !(open || start || end)
    };
  }

  const range = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)\s*[〜~\-－–]\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (range) {
    return {
      open: '',
      start: normalizeHm(range[1], range[2]),
      end: normalizeHm(range[3], range[4]),
      allDay: false
    };
  }
  return { open: '', start: '', end: '', allDay: true };
}

function hasEventSignal(title, bodyText) {
  if (EVENT_TEXT_RE.test(title)) return true;
  return /(開催|開演|開場|上演|公演|出演|チケット|会期|日時|入場)/.test(bodyText);
}

function normalizeUrlForCompare(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function pickVenue(text) {
  const m = text.match(/(?:会場名|会場|開催場所|場所|venue)\s*[：:]?\s*([^\n]{2,80})/i);
  if (!m || !m[1]) return '';
  const v = cleanVenue(m[1]);
  if (!v) return '';
  if (isInvalidVenueCandidate(v)) return '';
  if (!hasVenueSuffix(v) && v !== 'オンライン') return '';
  return textPreview(v, 80);
}

function cleanVenue(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:：\-ー〜~・]+/, '')
    .replace(/\s*(?:入場料|料金|お問い合わせ|問合せ|チケット|主催|出演|詳細).*/i, '')
    .trim();
}

function isInvalidVenueCandidate(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (/^[のをはが]/.test(v)) return true;
  if (v.length > 70) return true;
  if (/。/.test(v)) return true;
  if (BAD_VENUE_RE.test(v)) return true;
  return false;
}

function isInvalidAddressCandidate(value) {
  const v = normalizeGeoText(value);
  if (!v) return true;
  if (v.length > 140) return true;
  if (GEO_ADDRESS_NOISE_RE.test(v)) return true;
  return false;
}

function hasVenueSuffix(value) {
  return /(ホール|アリーナ|ドーム|劇場|会館|センター|スタジオ|プラザ|ファクトリー|きたえーる|Kitara|hitaru|SCARTS|Zepp)/i.test(String(value || ''));
}

function pickVenueLoose(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!t) return '';
  const labeled = t.match(/(?:会場名|会場|開催場所|場所|venue)\s*[：:]?\s*([^]{2,100}?)(?:\s+(?:入場料|料金|お問い合わせ|問合せ|主催|出演|チケット|開場|開演|終演)|$)/i);
  if (labeled && labeled[1]) {
    const v = cleanVenue(labeled[1]);
    if (v && hasVenueSuffix(v) && !isInvalidVenueCandidate(v)) return textPreview(v, 80);
  }

  const tokenRe = /([A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF・＆&\-－\s]{2,80}(?:ホール|アリーナ|ドーム|劇場|会館|センター|スタジオ|プラザ|ファクトリー|きたえーる|Kitara|hitaru|SCARTS|Zepp\s*[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]+))/gi;
  let m;
  while ((m = tokenRe.exec(t)) !== null) {
    const cand = cleanVenue(m[1]);
    if (!cand) continue;
    if (/イベント|スケジュール|チケット|一覧|案内|トップ|公式|発売/.test(cand)) continue;
    if (isInvalidVenueCandidate(cand)) continue;
    return textPreview(cand, 80);
  }
  if (/オンライン/.test(t)) return 'オンライン';
  return '';
}

function pickAddress(text) {
  const m = text.match(/(?:住所|所在地|address)\s*[：:]\s*([^\n]{6,140})/i);
  if (m && m[1]) return textPreview(m[1], 140);
  const postal = text.match(/(〒\s*\d{3}-\d{4}[^\n]{3,120})/);
  if (postal && postal[1]) return textPreview(postal[1], 140);
  const sapporoAddress = text.match(/(札幌市[^\n]{4,120})/);
  if (sapporoAddress && sapporoAddress[1]) return textPreview(sapporoAddress[1], 140);
  return '';
}

function pickImage(html, baseUrl) {
  const candidates = [
    pickMeta(html, 'og:image'),
    pickMeta(html, 'twitter:image')
  ];
  const imgRe = /<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    candidates.push(m[1]);
    if (candidates.length > 25) break;
  }
  for (const raw of candidates) {
    const abs = absolutizeUrl(baseUrl, raw);
    if (!abs) continue;
    if (/logo|icon|sprite|avatar/i.test(abs)) continue;
    return abs;
  }
  return '';
}

function pickSectionById(html, id) {
  const escaped = String(id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<dt\\b[^>]*id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)<\\/dd>`, 'i');
  const m = html.match(re);
  if (!m || !m[1]) return '';
  return stripTags(m[1]);
}

function pickLabeledValue(html, label) {
  const escaped = escapeRegExp(label);
  const patterns = [
    new RegExp(`<dt\\b[^>]*>\\s*${escaped}\\s*<\\/dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)<\\/dd>`, 'i'),
    new RegExp(`<th\\b[^>]*>\\s*${escaped}\\s*<\\/th>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return stripTags(m[1]);
  }
  return '';
}

function pickLabeledValueByPattern(html, labelPattern) {
  const pattern = String(labelPattern || '').trim();
  if (!pattern) return '';
  const patterns = [
    new RegExp(`<dt\\b[^>]*>\\s*${pattern}\\s*<\\/dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)<\\/dd>`, 'i'),
    new RegExp(`<th\\b[^>]*>\\s*${pattern}\\s*<\\/th>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return stripTags(m[1]);
  }
  return '';
}

function readNextDataBodyHtml(html) {
  const match = String(html || '').match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1]) return '';
  try {
    const data = JSON.parse(match[1]);
    return String(data?.props?.pageProps?.body || '');
  } catch (_) {
    return '';
  }
}

function buildSiteRuleEvent({
  source,
  detailUrl,
  title,
  startDate,
  endDate = '',
  venue = '',
  venueAddress = '',
  time = { open: '', start: '', end: '', allDay: true },
  summary = '',
  flyerImageUrl = ''
}) {
  if (!source || !detailUrl || !title || !startDate) return null;
  const seed = `${detailUrl}|${startDate}|${time.open || ''}|${time.start || ''}|${time.end || ''}|${title}`;
  return {
    id: makeEventId(seed),
    title: textPreview(title, 120),
    start_date: startDate,
    end_date: endDate,
    open_time: time.open || '',
    start_time: time.start || '',
    end_time: time.end || '',
    all_day: !!time.allDay,
    venue: textPreview(venue || '', 80),
    venue_address: textPreview(venueAddress || '', 140),
    summary: textPreview(summary || '', 220),
    flyer_image_url: flyerImageUrl || '',
    detail_url: detailUrl,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    source_category: source.category || '',
    source_priority: source.priority || 'B',
    source_priority_score: PRIORITY_SCORE[source.priority] || 0,
    extraction_method: 'site_rule',
    updated_at: new Date().toISOString()
  };
}

function extractKitaraSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-kitara-sapporo-or-jp-event') return null;
  const titleRaw = extractTitle(html);
  const title = String(titleRaw || '').split('|')[0].trim();
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const dateBlock = pickSectionById(html, 'd_time');
  if (!dateBlock) return null;
  const dates = parseDatesFromText(dateBlock, nowYmd);
  if (!dates.length) return null;
  const startDate = dates[0].ymd;
  const endDate = dates.length >= 2 ? dates[1].ymd : '';
  const time = parseEventTimes(dateBlock);
  const venue = textPreview((html.match(/<b\b[^>]*class=["'][^"']*place[^"']*["'][^>]*>([^<]+)<\/b>/i) || [])[1] || '', 80);
  const summary = pickMeta(html, 'description') || dateBlock;
  const venueAddress = '札幌市中央区中島公園1番15号';

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    endDate,
    venue,
    venueAddress,
    time,
    summary,
    flyerImageUrl: pickImage(html, url)
  });
}

function extractSapporoTravelSeasonEvent({ source, url, html, nowYmd }) {
  if (!SOURCE_CUSTOM_RULE_IDS.has(source.id)) return null;
  const bodyText = stripTags(html);
  const dates = parseDatesFromText(bodyText, nowYmd);
  if (!dates.length) return null;
  const startDate = dates[0].ymd;
  const endDate = dates.length >= 2 ? dates[1].ymd : '';
  const ctxStart = Math.max(0, dates[0].idx - 120);
  const ctxEnd = Math.min(bodyText.length, dates[0].idx + 220);
  const context = bodyText.slice(ctxStart, ctxEnd);
  const summary = pickMeta(html, 'description') || context || bodyText;
  const address = pickAddress(bodyText) || '札幌市内';
  const venue = pickVenue(bodyText) || '札幌市内';

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title: source.name,
    startDate,
    endDate,
    venue,
    venueAddress: address,
    time: { open: '', start: '', end: '', allDay: true },
    summary,
    flyerImageUrl: pickImage(html, url)
  });
}

function buildSiteRuleEventFromText({
  source,
  detailUrl,
  title,
  text,
  nowYmd,
  venue = '',
  venueAddress = '',
  summary = ''
}) {
  const dates = parseDatesFromText(text, nowYmd);
  if (!dates.length) return null;
  return buildSiteRuleEvent({
    source,
    detailUrl,
    title,
    startDate: dates[0].ymd,
    endDate: dates.length >= 2 ? dates[1].ymd : '',
    venue,
    venueAddress,
    time: parseEventTimes(text),
    summary: summary || text
  });
}

function parseJapaneseDateRange(text) {
  const value = String(text || '');
  const range = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:(20\d{2})年\s*)?(\d{1,2})月\s*(\d{1,2})(?:\s*日)?/);
  if (range) {
    return {
      startDate: `${range[1]}-${String(range[2]).padStart(2, '0')}-${String(range[3]).padStart(2, '0')}`,
      endDate: `${range[4] || range[1]}-${String(range[5]).padStart(2, '0')}-${String(range[6]).padStart(2, '0')}`
    };
  }
  const sameMonthRange = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(\d{1,2})(?:\s*日)?/);
  if (sameMonthRange) {
    return {
      startDate: `${sameMonthRange[1]}-${String(sameMonthRange[2]).padStart(2, '0')}-${String(sameMonthRange[3]).padStart(2, '0')}`,
      endDate: `${sameMonthRange[1]}-${String(sameMonthRange[2]).padStart(2, '0')}-${String(sameMonthRange[4]).padStart(2, '0')}`
    };
  }
  const slashRange = value.match(/(20\d{2})[\/.年]\s*(\d{1,2})[\/.月]\s*(\d{1,2})(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:(20\d{2})[\/.年]\s*)?(\d{1,2})[\/.月]\s*(\d{1,2})(?:\s*日)?/);
  if (slashRange) {
    return {
      startDate: `${slashRange[1]}-${String(slashRange[2]).padStart(2, '0')}-${String(slashRange[3]).padStart(2, '0')}`,
      endDate: `${slashRange[4] || slashRange[1]}-${String(slashRange[5]).padStart(2, '0')}-${String(slashRange[6]).padStart(2, '0')}`
    };
  }
  const sameMonthSlashRange = value.match(/(20\d{2})[\/.年]\s*(\d{1,2})[\/.月]\s*(\d{1,2})(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(\d{1,2})(?:\s*日)?/);
  if (sameMonthSlashRange) {
    return {
      startDate: `${sameMonthSlashRange[1]}-${String(sameMonthSlashRange[2]).padStart(2, '0')}-${String(sameMonthSlashRange[3]).padStart(2, '0')}`,
      endDate: `${sameMonthSlashRange[1]}-${String(sameMonthSlashRange[2]).padStart(2, '0')}-${String(sameMonthSlashRange[4]).padStart(2, '0')}`
    };
  }
  const pair = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})(?:\s*日)?[^0-9]{0,16}[、,]\s*(\d{1,2})(?:\s*日)?/);
  if (pair) {
    return {
      startDate: `${pair[1]}-${String(pair[2]).padStart(2, '0')}-${String(pair[3]).padStart(2, '0')}`,
      endDate: `${pair[1]}-${String(pair[2]).padStart(2, '0')}-${String(pair[4]).padStart(2, '0')}`
    };
  }
  const single = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (single) {
    return {
      startDate: `${single[1]}-${String(single[2]).padStart(2, '0')}-${String(single[3]).padStart(2, '0')}`,
      endDate: ''
    };
  }
  return null;
}

function resolveDateSpan(text, nowYmd) {
  const range = parseJapaneseDateRange(text);
  if (range?.startDate) return range;
  const dates = parseDatesFromText(text, nowYmd);
  return {
    startDate: dates[0]?.ymd || '',
    endDate: dates.length >= 2 ? dates[1].ymd : ''
  };
}

function stripEventStatusPrefix(title) {
  return String(title || '')
    .replace(/^(開催中|予告|近日開催|募集中|終了)\s*[:：]\s*/u, '')
    .trim();
}

function readXmlTagText(xml, tagName) {
  const escaped = escapeRegExp(tagName);
  const match = String(xml || '').match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  if (!match || !match[1]) return '';
  return stripTags(match[1]);
}

function buildSiteRuleEventFromRangeText({
  source,
  detailUrl,
  title,
  text,
  venue = '',
  venueAddress = '',
  summary = ''
}) {
  const range = parseJapaneseDateRange(text);
  if (!range || !range.startDate) return null;
  return buildSiteRuleEvent({
    source,
    detailUrl,
    title,
    startDate: range.startDate,
    endDate: range.endDate,
    venue,
    venueAddress,
    time: parseEventTimes(text),
    summary: summary || text
  });
}

function sliceTextAroundPattern(text, pattern, span = 220) {
  const sourceText = String(text || '');
  const re = pattern instanceof RegExp ? pattern : new RegExp(escapeRegExp(String(pattern || '')), 'i');
  const match = sourceText.match(re);
  const index = match ? match.index || 0 : -1;
  if (index < 0) return '';
  return sourceText.slice(index, Math.min(sourceText.length, index + span));
}

function extractSummerfesDetailEvents({ source, detail, detailUrl, nowYmd }) {
  if (source.id !== 'www-sapporo-travel-summerfes') return [];
  const text = stripTags(detail?.content || '');
  const rows = [
    {
      title: '福祉協賛さっぽろ大通ビアガーデン',
      key: '福祉協賛さっぽろ大通ビアガーデン',
      pattern: /福祉協賛さっぽろ大通ビアガーデン[\s\S]{0,40}?((?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?)/,
      venue: '大通公園',
      venueAddress: '札幌市中央区大通公園'
    },
    {
      title: '北海盆踊り',
      key: '北海盆踊り',
      pattern: /北海盆踊り[\s\S]{0,32}?((?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?)/,
      venue: '大通公園西2丁目',
      venueAddress: '札幌市中央区大通西2丁目'
    },
    {
      title: 'すすきの祭り',
      key: 'すすきの祭り',
      pattern: /第62\s*回すすきの祭り[\s\S]{0,32}?((?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?)/,
      venue: 'すすきの',
      venueAddress: '札幌市中央区すすきの'
    },
    {
      title: '狸まつり',
      key: '狸まつり',
      pattern: /第73回狸まつり[\s\S]{0,32}?((?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}(?:\s*日)?)/,
      venue: '狸小路',
      venueAddress: '札幌市中央区狸小路'
    }
  ];
  const events = [];
  for (const row of rows) {
    const snippet = (text.match(row.pattern) || [])[1] || sliceTextAroundPattern(text, row.key, 80);
    const ev = buildSiteRuleEventFromRangeText({
      source,
      detailUrl,
      title: row.title,
      text: snippet,
      venue: row.venue,
      venueAddress: row.venueAddress,
      summary: snippet || textPreview(text, 220)
    });
    if (ev) events.push(ev);
  }
  return events;
}

function extractLilacfesDetailEvents({ source, detail, detailUrl, nowYmd }) {
  if (source.id !== 'www-sapporo-travel-lilacfes-about') return [];
  const text = stripTags(detail?.content || '');
  const rows = [
    {
      title: 'さっぽろライラックまつり 大通会場',
      key: '大通会場',
      pattern: /大通会場[^0-9]{0,40}(\d{4}年\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[～\-ー〜]\s*\d{1,2}(?:\s*日)?)/,
      venue: '大通公園',
      venueAddress: '札幌市中央区大通西5丁目〜7丁目'
    },
    {
      title: 'さっぽろライラックまつり 川下会場',
      key: '川下会場',
      pattern: /川下会場[^0-9]{0,40}(\d{4}年\d{1,2}月\d{1,2}(?:\s*日)?[^0-9]{0,16}[、,]\s*\d{1,2}(?:\s*日)?)/,
      venue: '川下公園',
      venueAddress: '札幌市白石区川下2651番地3外'
    }
  ];
  const events = [];
  for (const row of rows) {
    const snippet = (text.match(row.pattern) || [])[1] || sliceTextAroundPattern(text, row.key, 90);
    const ev = buildSiteRuleEventFromRangeText({
      source,
      detailUrl,
      title: row.title,
      text: snippet,
      venue: row.venue,
      venueAddress: row.venueAddress,
      summary: snippet || textPreview(text, 220)
    });
    if (ev) events.push(ev);
  }
  return events;
}

function extractWhiteIlluminationDetailEvents({ source, detail, detailUrl, nowYmd }) {
  const text = stripTags(detail?.content || '');
  if (!text) return [];
  if (source.id === 'www-sapporo-travel-white-illumination-event-munich') {
    const snippet = sliceTextAroundPattern(text, /ミュンヘン・クリスマス市 in Sapporo/, 180);
    const ev = buildSiteRuleEventFromText({
      source,
      detailUrl,
      title: 'ミュンヘン・クリスマス市 in Sapporo',
      text: snippet || text,
      nowYmd,
      venue: '大通公園2丁目',
      venueAddress: '札幌市中央区大通西2丁目',
      summary: snippet || textPreview(text, 220)
    });
    return ev ? [ev] : [];
  }
  if (source.id !== 'www-sapporo-travel-white-illumination') return [];
  const snippet = sliceTextAroundPattern(text, /次回は|大通会場/, 220) || text;
  const ev = buildSiteRuleEventFromText({
    source,
    detailUrl,
    title: 'さっぽろホワイトイルミネーション',
    text: snippet,
    nowYmd,
    venue: '大通公園ほか札幌市内各会場',
    venueAddress: '札幌市中央区大通公園ほか',
    summary: textPreview(snippet, 220)
  });
  return ev ? [ev] : [];
}

function extractNoMapsNearlyEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'no-maps-jp-program') return null;
  if (!/\/nearly-event\//i.test(url)) return null;
  const rawTitle = String(extractTitle(html) || '').trim();
  const pageText = stripTags(html);
  const title = textPreview(
    stripTags((html.match(/<h1\b[^>]*class=["'][^"']*page_article_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '') ||
    rawTitle.split('|').slice(1).join('|').trim() ||
    rawTitle.split('|')[0].trim(),
    120
  );
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;
  const dateBlock = pickLabeledValue(html, '日時');
  const venue = cleanVenue(pickLabeledValue(html, '会場').replace(/\s*\/\s*/g, ' ')) || '札幌市内会場';
  const hasOnlineVenue = /(オンライン|YouTube|Zoom|Teams|配信)/i.test(`${title}\n${venue}\n${pageText}`);
  const ev = buildSiteRuleEventFromText({
    source,
    detailUrl: url,
    title,
    text: dateBlock,
    nowYmd,
    venue,
    venueAddress: !hasOnlineVenue && hasSapporoAreaSignal(`${venue}\n${pageText}`) ? (pickAddress(pageText) || '札幌市内会場') : '',
    summary: pickMeta(html, 'description') || dateBlock || pageText
  });
  return ev;
}

function extractGrand1934EventDetailEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'grand1934-com-meeting-banquet') return null;
  if (!/https:\/\/grand1934\.com\/event\/[^/?#]+\/?$/i.test(url) || /\/event\/?$/i.test(url)) return null;
  const title = textPreview(
    stripTags((html.match(/<h2\b[^>]*class=["'][^"']*eventDetail-info_ttl[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '') ||
    String(extractTitle(html) || '').split('|')[0].trim(),
    120
  );
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;
  const dateBlock = pickLabeledValueByPattern(html, '開催日') ||
    stripTags((html.match(/<p\b[^>]*>\s*開催日\s*<\/p>\s*<div\b[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '') ||
    stripTags((html.match(/<p\b[^>]*>\s*開催日\s*<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
  const venue = cleanVenue(
    pickLabeledValueByPattern(html, '会場') ||
    stripTags((html.match(/<p\b[^>]*>\s*会場\s*<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '')
  ) || '札幌グランドホテル';
  const summary = pickMeta(html, 'description') || stripTags((html.match(/<section\b[^>]*class=["'][^"']*eventDetail-summary[^"']*["'][^>]*>([\s\S]*?)<\/section>/i) || [])[1] || html);
  return buildSiteRuleEventFromText({
    source,
    detailUrl: url,
    title,
    text: dateBlock,
    nowYmd,
    venue,
    venueAddress: '札幌市中央区北1条西4丁目',
    summary
  });
}

function extractKeioPlazaEventDetailEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-keioplaza-sapporo-co-jp-banq-hall') return null;
  if (!/\/event\/detail_\d+\.html$/i.test(url)) return null;
  const title = textPreview(
    stripTags((html.match(/<p\b[^>]*class=["'][^"']*ja_nameonly[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '') ||
    String(extractTitle(html) || '').split('|')[0].trim(),
    120
  );
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;
  const bodyText = stripTags(html);
  let dateBlock = pickLabeledValue(html, '開催日') || pickLabeledValue(html, '日時');
  if (!dateBlock) {
    const candidates = bodyText.match(/20\d{2}[年./]\d{1,2}[月./]\d{1,2}日?(?:\([^)]*\))?(?:\s*[～\-ー〜]\s*(?:20\d{2}[年./])?\d{1,2}[月./]\d{1,2}日?(?:\([^)]*\))?)?/g) || [];
    dateBlock = candidates.find((row) => /20(?:26|27)/.test(row) && !/\b20(?:23|24)\b/.test(row)) || '';
  }
  return buildSiteRuleEventFromText({
    source,
    detailUrl: url,
    title,
    text: dateBlock,
    nowYmd,
    venue: '京王プラザホテル札幌',
    venueAddress: '札幌市中央区北5条西7丁目2番地1',
    summary: pickMeta(html, 'description') || bodyText
  });
}

function extractSnowfesSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-snowfes-com') return null;
  const bodyText = stripTags(html);
  const periodMatch = bodyText.match(/次回は(\d{4}年\d{1,2}月\d{1,2}日[^0-9]{0,6}\d{1,2}月\d{1,2}日)/);
  const periodText = periodMatch ? periodMatch[1] : (bodyText.match(/2026年2月4日[^0-9]{0,12}2月11日/) || [])[0] || '';
  const dates = parseDatesFromText(periodText, nowYmd);
  if (!dates.length) return null;
  let endDate = dates.length >= 2 ? dates[1].ymd : '';
  if (!endDate) {
    const startYear = String(dates[0].ymd || '').slice(0, 4);
    const endMd = periodText.match(/[～\-ー〜]\s*(\d{1,2})月(\d{1,2})日/);
    if (startYear && endMd) {
      endDate = `${startYear}-${String(endMd[1]).padStart(2, '0')}-${String(endMd[2]).padStart(2, '0')}`;
    }
  }
  const summary = textPreview(periodText || pickMeta(html, 'description') || bodyText, 220);
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title: 'さっぽろ雪まつり',
    startDate: dates[0].ymd,
    endDate,
    venue: '大通公園・つどーむ・すすきの',
    venueAddress: '札幌市内各会場',
    time: { open: '', start: '', end: '', allDay: true },
    summary
  });
}

function extractYosakoiSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-yosakoi-soran-jp') return null;
  const bodyText = stripTags(html);
  const title = 'YOSAKOIソーラン祭り';
  const period = bodyText.match(/(20\d{2})年[^0-9]{0,12}(?:第\s*\d+\s*回)?YOSAKOIソーラン祭り[^0-9]{0,20}(\d{1,2})月(\d{1,2})日[^0-9]{0,12}[～\-ー〜]\s*(?:(\d{1,2})月)?(\d{1,2})日/i)
    || bodyText.match(/(20\d{2})年[^0-9]{0,20}第\s*\d+\s*回YOSAKOIソーラン祭り[^0-9]{0,20}(\d{1,2})月(\d{1,2})日[^0-9]{0,12}[～\-ー〜]\s*(?:(\d{1,2})月)?(\d{1,2})日/i);
  if (!period) return null;
  const startDate = `${period[1]}-${String(period[2]).padStart(2, '0')}-${String(period[3]).padStart(2, '0')}`;
  const endMonth = period[4] || period[2];
  const endDate = `${period[1]}-${String(endMonth).padStart(2, '0')}-${String(period[5]).padStart(2, '0')}`;
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    endDate,
    venue: '大通公園をはじめとする札幌市内各会場',
    venueAddress: '札幌市内各会場',
    time: { open: '', start: '', end: '', allDay: true },
    summary: textPreview(period[0] || bodyText, 220)
  });
}

function extractSapporoCommunityPlazaSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-sapporo-community-plaza-jp-event-php') return null;
  if (!/\/event\.php\?num=\d+/i.test(url)) return null;
  const title = String(extractTitle(html) || '').split('|')[0].trim();
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const dateBlock = pickLabeledValue(html, '日時');
  const venue = textPreview(pickLabeledValue(html, '会場'), 80);
  const dates = parseDatesFromText(dateBlock, nowYmd);
  if (!dates.length) return null;

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate: dates[0].ymd,
    endDate: dates.length >= 2 ? dates[1].ymd : '',
    venue,
    time: parseEventTimes(dateBlock),
    summary: pickMeta(html, 'description') || dateBlock || stripTags(html),
    flyerImageUrl: pickImage(html, url)
  });
}

function extractPl24ScheduleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-pl24-jp-schedule-html') return [];
  if (!/\/schedule(?:_n+)?\.html$/i.test(url)) return [];
  const blocks = [...html.matchAll(/<div id="waku_sp">([\s\S]*?)<\/div>/gi)];
  const events = [];
  for (const match of blocks) {
    const block = String(match[1] || '');
    const dayLine = stripTags((block.match(/<p id="font_day">([\s\S]*?)<\/p>/i) || [])[1] || '');
    const title = textPreview(stripTags((block.match(/<p id="font_title">([\s\S]*?)<\/p>/i) || [])[1] || ''), 120);
    const artist = textPreview(stripTags((block.match(/<p id="font_name">([\s\S]*?)<\/p>/i) || [])[1] || ''), 80);
    const dates = parseDatesFromText(dayLine, nowYmd);
    if (!dates.length) continue;
    const body = stripTags(block);
    const time = parseEventTimes(body);
    const detailUrl = absolutizeUrl(url, (block.match(/<a\b[^>]*href="([^"]+)"[^>]*>/i) || [])[1] || '') || url;
    const eventTitle = textPreview([artist, title].filter(Boolean).join(' ').trim() || title || artist, 120);
    if (!eventTitle || BAD_TITLE_RE.test(eventTitle) || WEAK_TITLE_RE.test(eventTitle)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title: eventTitle,
      startDate: dates[0].ymd,
      venue: 'PENNY LANE24',
      time,
      summary: body,
      flyerImageUrl: absolutizeUrl(url, (block.match(/<img\b[^>]*src="([^"]+)"/i) || [])[1] || '') || ''
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractCubeGardenScheduleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-cube-garden-com-live-php') return [];
  if (!/\/live\.php/i.test(url)) return [];
  const blocks = [...html.matchAll(/<div id="e[^"]+" class="cubeEvent">([\s\S]*?)<b class="cubeEvent_pageTop/gi)];
  const events = [];
  for (const match of blocks) {
    const block = String(match[1] || '');
    const title = textPreview(stripTags((block.match(/<h3\b[^>]*class="cubeEventTitle_name"[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || ''), 120);
    const dateText = stripTags((block.match(/<th>\s*開催日\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i) || [])[1] || '');
    const dates = parseDatesFromText(dateText, nowYmd);
    if (!title || !dates.length) continue;
    const artist = textPreview(stripTags((block.match(/<th>\s*出演\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i) || [])[1] || ''), 100);
    const timeText = stripTags((block.match(/<th>\s*開場開演\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i) || [])[1] || '');
    const ticketHref = absolutizeUrl(url, (block.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*チケット詳細はこちら/i) || [])[1] || '') || url;
    const imageUrl = absolutizeUrl(url, (block.match(/<img\b[^>]*src="([^"]+)"[^>]*>/i) || [])[1] || '') || '';
    const body = stripTags(block);
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: ticketHref,
      title: textPreview([artist, title].filter(Boolean).join(' ').trim() || title, 120),
      startDate: dates[0].ymd,
      venue: 'cube garden',
      time: parseEventTimes(timeText || body),
      summary: body,
      flyerImageUrl: imageUrl
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractHbcConcertEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-hbc-co-jp-event') return [];
  if (!/\/event\/concert\/index\.html$/i.test(url)) return [];
  const events = [];
  let currentTitle = '';
  let currentDetailUrl = '';
  let currentTime = '';
  let currentVenue = '';
  let currentContact = '';
  let currentNote = '';
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of rows) {
    const rowHtml = String(match[1] || '');
    const titleCell = rowHtml.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
    if (titleCell && titleCell[1]) {
      currentTitle = textPreview(stripTags(titleCell[1]), 120);
      currentDetailUrl = absolutizeUrl(url, (titleCell[1].match(/<a\b[^>]*href="([^"]+)"/i) || [])[1] || '') || url;
    }
    const fields = {};
    for (const cell of rowHtml.matchAll(/<td\b[^>]*data-label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi)) {
      fields[String(cell[1] || '').trim()] = stripTags(cell[2]).replace(/\s+/g, ' ').trim();
    }
    if (fields['時間']) currentTime = fields['時間'];
    if (fields['場所']) currentVenue = cleanVenue(fields['場所']);
    if (fields['お問い合わせ']) currentContact = fields['お問い合わせ'];
    if (fields['☎']) currentContact = fields['☎'];
    if (fields['☏']) currentContact = fields['☏'];
    if (fields['備考']) currentNote = fields['備考'];

    const dateText = fields['日程'] || '';
    const dates = parseDatesFromText(dateText, nowYmd);
    if (!currentTitle || !dates.length || !currentVenue) continue;
    if (!hasSapporoAreaSignal(currentVenue)) continue;
    if (BAD_TITLE_RE.test(currentTitle) || WEAK_TITLE_RE.test(currentTitle)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: currentDetailUrl || url,
      title: currentTitle,
      startDate: dates[0].ymd,
      venue: currentVenue,
      time: parseEventTimes(currentTime || dateText),
      summary: [dateText, currentTime, currentVenue, currentContact, currentNote].filter(Boolean).join(' / ')
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractSoraConventionEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-sora-scc-jp') return [];
  if (!/\/event\/?$/i.test(url)) return [];
  const events = [];
  const items = [...html.matchAll(/<li>\s*<time[^>]*>([\s\S]*?)<\/time>([\s\S]*?)<\/li>/gi)];
  for (const [index, match] of items.entries()) {
    const dateText = stripTags(match[1]).replace(/\s+/g, ' ').trim();
    const bodyHtml = String(match[2] || '');
    const title = textPreview(stripTags((bodyHtml.match(/<dt>\s*催事名\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i) || [])[1] || ''), 120);
    const dates = parseDatesFromText(dateText, nowYmd);
    if (!title || !dates.length) continue;
    if (BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const summary = stripTags(bodyHtml).replace(/\s+/g, ' ').trim();
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: `${url}?event=${compactYmd(dates[0].ymd)}-${index + 1}`,
      title,
      startDate: dates[0].ymd,
      venue: '札幌コンベンションセンター',
      venueAddress: '札幌市白石区東札幌6条1丁目1-1',
      time: { open: '', start: '', end: '', allDay: true },
      summary
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractKyobunScheduleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-kyobun-org-event-schedule-html') return [];
  if (!/\/event_schedule\.html/i.test(url)) return [];
  const events = [];
  const pairs = [...html.matchAll(/<dt\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*class=["'][^"']*event_link[^"']*["'][^>]*>([\s\S]*?)<\/dd>/gi)];
  for (const match of pairs) {
    const dateText = stripTags(match[1]).replace(/\s+/g, ' ').trim();
    const block = String(match[2] || '');
    const titleHtml = (block.match(/<p\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '';
    const title = textPreview(stripTags(titleHtml), 120);
    if (!title || title === '催事あり' || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const dates = parseDatesFromText(dateText, nowYmd);
    if (!dates.length) continue;
    const hall = textPreview(stripTags((block.match(/<p\b[^>]*class=["'][^"']*(mainhall|smallhall|gallery)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[2] || ''), 40);
    const timeText = stripTags((block.match(/<p\b[^>]*class=["'][^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const detailUrl = absolutizeUrl(url, (titleHtml.match(/<a\b[^>]*href="([^"]+)"/i) || [])[1] || '') || url;
    const venue = [SOURCE_VENUE_FALLBACK[source.id], hall].filter(Boolean).join(' ').trim();
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate: dates[0].ymd,
      endDate: dates.length >= 2 ? dates[1].ymd : '',
      venue,
      time: parseEventTimes(timeText || dateText),
      summary: [dateText, timeText].filter(Boolean).join(' '),
      flyerImageUrl: absolutizeUrl(url, (block.match(/<img\b[^>]*src="([^"]+)"/i) || [])[1] || '') || ''
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractTsudomeCalendarEvents({ source, url, html }) {
  if (source.id !== 'www-sapporo-sport-jp-tsudome-calendar') return [];
  if (!/\/tsudome\/calendar\//i.test(url)) return [];
  const ym = url.match(/[?&]ty=(\d{4})[^\d]+tm=(\d{1,2})/i);
  if (!ym) return [];
  const year = Number(ym[1]);
  const month = Number(ym[2]);
  if (!year || !month) return [];
  const events = [];
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of rows) {
    const rowHtml = String(match[1] || '');
    const day = Number(stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*cdate[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || ''));
    const content = stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*ccont[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    if (!day || !content) continue;
    if (/(一般開放|施設整備日|休館|時間割)/.test(content)) continue;
    const title = textPreview(content.replace(/（[^）]*\d{1,2}:\d{2}[^）]*）/g, '').trim(), 120);
    if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: `${url}#d${day}`,
      title,
      startDate,
      venue: 'つどーむ',
      venueAddress: '札幌市東区栄町885番地1',
      time: parseEventTimes(content),
      summary: content
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractSapporoShiminhallScheduleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-sapporo-shiminhall-org') return [];
  if (!/\/event\/(?:index\.asp|\?ymd=|$)/i.test(url)) return [];
  const ymdMatch = url.match(/[?&]ymd=(\d{4})%2F(\d{2})%2F\d{2}|[?&]ymd=(\d{4})\/(\d{2})\/\d{2}/i);
  const year = Number(ymdMatch?.[1] || ymdMatch?.[3] || '');
  const month = Number(ymdMatch?.[2] || ymdMatch?.[4] || '');
  const fallbackYear = Number((html.match(/id="year"><span>(\d{4})<\/span>/i) || [])[1] || '');
  const fallbackMonth = Number((html.match(/id="month"><span>(\d{1,2})<\/span>/i) || [])[1] || '');
  const baseYear = year || fallbackYear;
  const baseMonth = month || fallbackMonth;
  if (!baseYear || !baseMonth) return [];

  const events = [];
  const rows = [...html.matchAll(/<tr\b[^>]*id=["']event[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of rows) {
    const rowHtml = String(match[1] || '');
    const day = Number(stripTags((rowHtml.match(/<p\b[^>]*class=["'][^"']*day[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ''));
    const title = textPreview(stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*tbody01[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || ''), 120);
    if (!day || !title) continue;
    if (/関係者のみの使用がございます|休館/.test(title)) continue;
    if (BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const openText = stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*tbody02[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const startText = stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*tbody03\b[^"']*tb-label[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const inquiry = stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*tbody04[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const flyerUrl = absolutizeUrl(url, (rowHtml.match(/<p\b[^>]*class=["'][^"']*flyer[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '') || '';
    const startDate = `${String(baseYear).padStart(4, '0')}-${String(baseMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const detailUrl = `${url.split('#')[0]}#${(match[0].match(/id=["']([^"']+)["']/i) || [])[1] || `event-${day}`}`;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      venue: 'カナモトホール',
      venueAddress: '札幌市中央区北1条西1丁目',
      time: parseEventTimes(`${openText} ${startText}`),
      summary: [openText, startText, inquiry].filter(Boolean).join(' / '),
      flyerImageUrl: flyerUrl
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractChieriaHallScheduleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'chieria-slp-or-jp-schedule') return [];
  if (!/\/_wcv\/calendar\/viewcal\/[^/]+\/20\d{4}\.html$/i.test(url)) return [];
  const yearMonth = url.match(/\/(20\d{2})(\d{2})\.html$/i);
  const year = Number(yearMonth?.[1] || '');
  const month = Number(yearMonth?.[2] || '');
  if (!year || !month) return [];
  const events = [];
  const rows = [...html.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)];
  for (const match of rows) {
    const dateText = stripTags(match[1]).replace(/\s+/g, ' ').trim();
    const cellText = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    const dates = parseDatesFromText(`${year}年${dateText}`, nowYmd);
    if (!dates.length || !cellText || cellText === '&nbsp;') continue;
    if (/関係者のみの催事がございます|休館日|点検日/.test(cellText)) continue;
    const title = textPreview(cellText.replace(/\[[^\]]+\]/g, '').trim(), 120);
    if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: `${url}#${compactYmd(dates[0].ymd)}`,
      title,
      startDate: dates[0].ymd,
      venue: '札幌市生涯学習センター ちえりあホール',
      venueAddress: '札幌市西区宮の沢1条1丁目1-10',
      time: parseEventTimes(cellText),
      summary: cellText
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractAxesCalendarEvents({ source, url, html }) {
  if (source.id !== 'www-axes-or-jp') return [];
  if (!/\/event_calendar\/index\.php/i.test(url)) return [];
  const year = Number((url.match(/[?&]input\[year\]=(\d{4})/i) || html.match(/this\.year\s*=\s*['"](\d{4})['"]/i) || [])[1] || '');
  const month = Number((url.match(/[?&]input\[month\]=(\d{1,2})/i) || [])[1] || '');
  if (!year || !month) return [];

  const grouped = new Map();
  const entryRe = /this\.events\[\d+\]\s*=\s*\{\};\s*this\.events\[\d+\]\.id\s*=\s*'(\d+)';\s*this\.events\[\d+\]\.day\s*=\s*'(\d{1,2})';\s*this\.events\[\d+\]\.title\s*=\s*'([^']+)'/g;
  for (const match of html.matchAll(entryRe)) {
    const eventId = String(match[1] || '').trim();
    const day = Number(match[2] || 0);
    const title = textPreview(stripTags(match[3] || '').trim(), 120);
    if (!eventId || !day || !title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const row = grouped.get(eventId) || { title, days: [] };
    row.days.push(day);
    grouped.set(eventId, row);
  }

  const events = [];
  for (const [eventId, row] of grouped.entries()) {
    const days = [...new Set(row.days)].sort((a, b) => a - b);
    if (!days.length) continue;
    const startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(days[0]).padStart(2, '0')}`;
    const endDate = days.length >= 2
      ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(days[days.length - 1]).padStart(2, '0')}`
      : '';
    const detailUrl = absolutizeUrl(url, `./event_detail.php?input[event_id]=${eventId}`) || url;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title: row.title,
      startDate,
      endDate,
      venue: 'アクセスサッポロ',
      venueAddress: '札幌市白石区流通センター4丁目3-55',
      time: { open: '', start: '', end: '', allDay: true },
      summary: row.title
    });
    if (ev) events.push(ev);
  }

  return uniqueBy(events, (ev) => ev.id);
}

function extractFightersHomeGameEvents({ source, url, html }) {
  if (source.id !== 'www-fighters-co-jp-game-calendar') return [];
  if (!/\/game\/calendar\/(?:20\d{4}\/)?$/i.test(url)) return [];
  const dayMarkers = [...html.matchAll(/<div\b[^>]*class=["'][^"']*c-calendar-month-day-text[^"']*["'][^>]*>(\d{1,2})\/(\d{1,2})<\/div>/gi)];
  const events = [];

  for (let index = 0; index < dayMarkers.length; index += 1) {
    const match = dayMarkers[index];
    const month = Number(match[1] || 0);
    const day = Number(match[2] || 0);
    const blockStart = match.index || 0;
    const blockEnd = index + 1 < dayMarkers.length ? (dayMarkers[index + 1].index || html.length) : html.length;
    const block = html.slice(blockStart, blockEnd);
    if (!month || !day) continue;
    if (!/c-calendar-month-day-label--home/i.test(block)) continue;

    const year = Number((url.match(/\/game\/calendar\/(20\d{2})\d{2}\//i) || [])[1] || '');
    if (!year) continue;

    const detailHref = (block.match(/<a\b[^>]*class=["'][^"']*c-calendar-month-vs-status[^"']*["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '';
    const detailUrl = absolutizeUrl(url, detailHref) || `${url}#${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    const venue = textPreview(stripTags((block.match(/<div\b[^>]*class=["'][^"']*c-calendar-month-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || ''), 80);
    const division = textPreview(stripTags((block.match(/<div\b[^>]*class=["'][^"']*c-calendar-month-game-division[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || ''), 40);
    const timeText = stripTags((block.match(/<div\b[^>]*class=["'][^"']*c-calendar-month-vs-status-time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const hm = timeText.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);
    const startTime = hm ? normalizeHm(hm[1], hm[2]) : '';
    const startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const title = division
      ? `北海道日本ハムファイターズ ホームゲーム（${division}）`
      : '北海道日本ハムファイターズ ホームゲーム';
    const summary = [
      'ホームゲーム',
      division,
      venue,
      startTime ? `開始 ${startTime}` : ''
    ].filter(Boolean).join(' / ');

    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      venue: venue || 'エスコンフィールドHOKKAIDO',
      venueAddress: '北海道北広島市Fビレッジ1番地',
      time: startTime ? { open: '', start: startTime, end: '', allDay: false } : { open: '', start: '', end: '', allDay: true },
      summary
    });
    if (ev) events.push(ev);
  }

  return uniqueBy(events, (ev) => ev.id);
}

function extractKaderuVenueEvents({ source, url, html }) {
  if (source.id !== 'homepage-kaderu27-or-jp-event-news-index-html') return [];
  if (!/\/event\/(?:index|exhibition|rooms|self\/index)\.html$/i.test(url)) return [];

  const pageText = stripTags(String(extractTitle(html) || '').split('|')[0] || '');
  let venue = 'かでる2・7';
  if (/\/event\/self\/index\.html$/i.test(url)) {
    venue = 'かでる2・7';
  } else if (/\/event\/index\.html$/i.test(url) || /かでるホール/i.test(pageText)) {
    venue = 'かでるホール';
  } else if (/\/event\/exhibition\.html$/i.test(url) || /展示ホール/i.test(pageText)) {
    venue = 'かでる2・7 展示ホール';
  } else if (/\/event\/rooms\.html$/i.test(url) || /会議室/i.test(pageText)) {
    venue = 'かでる2・7 会議室';
  }

  const events = [];
  const cardRe = /<li>\s*<a href="([^"]+)">[\s\S]*?<p class="eventDate">[\s\S]*?<time class="start" datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?(?:<time class="end" datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?)?<b class="title">([\s\S]*?)<\/b>[\s\S]*?(?:<span class="org">([\s\S]*?)<\/span>)?[\s\S]*?<\/a><\/li>/gi;
  for (const match of html.matchAll(cardRe)) {
    const detailUrl = absolutizeUrl(url, match[1] || '') || '';
    const startDate = String(match[2] || '').trim();
    const endDate = String(match[3] || '').trim();
    const title = textPreview(stripTags(match[4] || '').trim(), 120);
    const summary = textPreview(stripTags(match[5] || '').trim(), 180);
    if (!detailUrl || !startDate || !title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      endDate,
      venue,
      venueAddress: '札幌市中央区北2条西7丁目',
      time: { open: '', start: '', end: '', allDay: true },
      summary
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractArtparkListingEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'artpark-or-jp-tenrankai-events') return [];
  if (!/artpark\.or\.jp\/tenrankai-events(?:\/page\/\d+\/)?(?:[?#].*)?$/i.test(url)) return [];
  const events = [];
  const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/gi;
  for (const match of html.matchAll(itemRe)) {
    const block = String(match[0] || '');
    const title = textPreview(
      stripEventStatusPrefix(stripTags((block.match(/<h3>\s*<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i) || [])[1] || '')),
      120
    );
    const detailUrl = absolutizeUrl(url, (block.match(/<h3>\s*<a\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '') || '';
    const dateText = stripTags((block.match(/<p\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const { startDate, endDate } = resolveDateSpan(dateText, nowYmd);
    const category = textPreview(stripTags((block.match(/<p\b[^>]*class=["'][^"']*category[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*te-category[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/p>/i) || [])[1] || ''), 80);
    const kind = textPreview(stripTags((block.match(/<p\b[^>]*class=["'][^"']*bunrui[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ''), 80);
    const flyerImageUrl = absolutizeUrl(url, (block.match(/<img\b[^>]*src=["']([^"']+)["']/i) || [])[1] || '') || '';
    if (!detailUrl || !/\/tenrankai-event\//i.test(detailUrl) || !title || !startDate) continue;
    if (/募集|申込|受付/i.test(title) || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      endDate,
      venue: category || '札幌芸術の森',
      venueAddress: '札幌市南区芸術の森2丁目75',
      time: { open: '', start: '', end: '', allDay: true },
      summary: [dateText, category, kind].filter(Boolean).join(' / '),
      flyerImageUrl
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractArtparkDetailEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'artpark-or-jp-tenrankai-events') return null;
  if (!/artpark\.or\.jp\/tenrankai-event\/[^/?#]+\/?$/i.test(url)) return null;
  const title = textPreview(stripEventStatusPrefix(String(extractTitle(html) || '').split('|')[0].trim()), 120);
  if (!title || /募集|申込|受付/i.test(title) || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;
  const dateText = pickLabeledValue(html, '会期') || pickLabeledValue(html, '開催日') || pickLabeledValue(html, '日時');
  const timeText = pickLabeledValue(html, '時間');
  const venueBlock = pickLabeledValue(html, '会場');
  const { startDate, endDate } = resolveDateSpan(dateText, nowYmd);
  if (!startDate) return null;
  const venueAddress = textPreview(
    (String(venueBlock || '').match(/（([^）]+)）/) || [])[1] ||
    pickAddress(stripTags(html)) ||
    '札幌市南区芸術の森2丁目75',
    140
  );
  const venue = textPreview(
    cleanVenue(String(venueBlock || '').replace(/（[^）]+）/g, ' ').replace(/\s+/g, ' ')) || '札幌芸術の森',
    80
  );
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    endDate,
    venue,
    venueAddress,
    time: parseEventTimes(`${dateText} ${timeText}`.trim()),
    summary: [dateText, timeText, venueBlock].filter(Boolean).join(' / '),
    flyerImageUrl: pickImage(html, url)
  });
}

function extractSapporoFactoryMonthlyEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'sapporofactory-jp-event') return [];
  if (!/sapporofactory\.jp\/event\/(?:\?ym=\d{4}-\d{2})?$/i.test(url)) return [];
  const events = [];
  const venueByDetailUrl = new Map();
  const rowRe = /<tr\b[^>]*class=["'][^"']*lane[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(rowRe)) {
    const rowHtml = String(match[1] || '');
    const detailUrl = absolutizeUrl(url, (rowHtml.match(/<p\b[^>]*class=["'][^"']*td-text[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '') || '';
    const venue = textPreview(stripTags((rowHtml.match(/<td\b[^>]*class=["'][^"']*td-place[^"']*["'][^>]*>\s*<p>([\s\S]*?)<\/p>\s*<\/td>/i) || [])[1] || ''), 80);
    if (detailUrl && venue) venueByDetailUrl.set(detailUrl, venue);
  }
  const cardRe = /<li\b[^>]*class=["'][^"']*js-fadeup[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  for (const match of html.matchAll(cardRe)) {
    const detailUrl = absolutizeUrl(url, match[1] || '') || '';
    const block = String(match[2] || '');
    const title = textPreview(stripTags((block.match(/<p\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ''), 120);
    const dateText = stripTags((block.match(/<p\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const { startDate, endDate } = resolveDateSpan(dateText, nowYmd);
    if (!detailUrl || !title || !startDate) continue;
    if (/%\s*OFF|カードセゾン|キャンペーン/i.test(title) || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      endDate,
      venue: venueByDetailUrl.get(detailUrl) || 'サッポロファクトリー',
      venueAddress: '札幌市中央区北2条東4丁目',
      time: { open: '', start: '', end: '', allDay: true },
      summary: [dateText, venueByDetailUrl.get(detailUrl) || 'サッポロファクトリー'].filter(Boolean).join(' / '),
      flyerImageUrl: absolutizeUrl(url, (block.match(/<img\b[^>]*src=["']([^"']+)["']/i) || [])[1] || '') || ''
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractMoleFeedEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'mole-sapporo-jp-schedule') return [];
  if (!/mole-sapporo\.jp\/(?:category\/event\/(?:live|club)\/feed|feed)\/?$/i.test(url)) return [];
  const events = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  for (const match of html.matchAll(itemRe)) {
    const itemXml = String(match[1] || '');
    const title = textPreview(stripEventStatusPrefix(readXmlTagText(itemXml, 'title')), 120);
    const detailUrl = readXmlTagText(itemXml, 'link');
    const description = readXmlTagText(itemXml, 'description');
    const content = readXmlTagText(itemXml, 'content:encoded');
    const text = [description, content].filter(Boolean).join('\n');
    const { startDate, endDate } = resolveDateSpan(text, nowYmd);
    if (!detailUrl || !title || !startDate) continue;
    if (BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) continue;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate,
      endDate,
      venue: 'Sound Lab mole',
      venueAddress: '札幌市中央区南3条西2丁目 ニコービルB1F',
      time: parseEventTimes(text),
      summary: textPreview(text, 220),
      flyerImageUrl: absolutizeUrl(detailUrl, (String(itemXml).match(/<img\b[^>]*src=["']([^"']+)["']/i) || [])[1] || '') || ''
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractDoshinPlayguideSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'doshin-playguide-jp') return null;
  if (!/doshin-playguide\.jp\/(?:ticket\/detail\/\d+|event\/)/i.test(url)) return null;

  const title = String(extractTitle(html) || '').split('|')[0].trim();
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const dateMatch = html.match(/(20\d{2}年\d{1,2}月\d{1,2}日(?:\([^)]+\))?)/);
  const dateText = dateMatch ? decodeHtmlEntities(dateMatch[1]).replace(/\\u3000/g, ' ') : '';
  const dates = parseDatesFromText(dateText, nowYmd);
  if (!dates.length) return null;

  const timeMatch = html.match(/(開場\s*[0-2]?\d[:：][0-5]\d\s*[^"]*?開演\s*[0-2]?\d[:：][0-5]\d)/);
  const timeText = timeMatch ? decodeHtmlEntities(timeMatch[1]).replace(/\\u3000/g, ' ') : '';
  const hallMatch = html.match(/(札幌[^"]+(?:ホール|会館|劇場|アリーナ|ドーム|センター|プラザ|きたえーる|Kitara)[^"]*)/);
  const venue = hallMatch ? decodeHtmlEntities(hallMatch[1]).replace(/\\u3000/g, ' ').replace(/\\+$/,'').trim() : '';

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate: dates[0].ymd,
    venue,
    time: parseEventTimes(timeText || dateText),
    summary: pickMeta(html, 'description') || `${dateText} ${timeText}`.trim(),
    flyerImageUrl: pickMeta(html, 'og:image') || ''
  });
}

function extractCaretexSiteRuleEvent({ source, url, html }) {
  if (source.id !== 'sapporo-caretex-jp') return null;
  const bodyText = stripTags(html);
  const match = bodyText.match(/(20\d{2})年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[^0-9]{0,12}[・～\-ー〜]\s*(\d{1,2})\s*日[\s\S]{0,120}?アクセスサッポロ/i);
  if (!match) return null;
  const startDate = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const endDate = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[4]).padStart(2, '0')}`;
  const timeMatch = bodyText.match(/開場時間\s*(\d{1,2})[:：](\d{2})\s*[～\-ー〜]\s*(\d{1,2})[:：](\d{2})/);
  const time = timeMatch
    ? {
        open: '',
        start: `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`,
        end: `${String(timeMatch[3]).padStart(2, '0')}:${timeMatch[4]}`,
        allDay: false
      }
    : { open: '', start: '', end: '', allDay: true };
  const summary = textPreview(match[0], 220);
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title: 'CareTEX札幌',
    startDate,
    endDate,
    venue: 'アクセスサッポロ',
    venueAddress: '札幌市白石区流通センター4丁目3-55',
    time,
    summary,
    flyerImageUrl: pickImage(html, url)
  });
}

function extractSapporoCityJazzNewsEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'sapporocityjazz-jp') return [];
  if (!/\/20\d{2}\/\d{2}\/\d{2}\/news-\d+\/?$/i.test(url)) return [];
  const title = textPreview(String(extractTitle(html) || '').split('|')[0].trim(), 120);
  const bodyText = stripTags(html);
  const events = [];

  const liveMatch = bodyText.match(/パークジャズライブ[^\n]*?(20\d{2})年(\d{1,2})月(\d{1,2})日[^0-9]{0,8}[、・]\s*(\d{1,2})日/i);
  if (liveMatch) {
    const startDate = `${liveMatch[1]}-${String(liveMatch[2]).padStart(2, '0')}-${String(liveMatch[3]).padStart(2, '0')}`;
    const endDate = `${liveMatch[1]}-${String(liveMatch[2]).padStart(2, '0')}-${String(liveMatch[4]).padStart(2, '0')}`;
    const venueLine = textPreview((bodyText.match(/会場[：:]\s*([^\n]+)/i) || [])[1] || '札幌市内各会場', 120);
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: url,
      title: 'SAPPORO CITY JAZZ パークジャズライブ',
      startDate,
      endDate,
      venue: venueLine,
      venueAddress: '札幌市内各会場',
      time: { open: '', start: '', end: '', allDay: true },
      summary: textPreview(title || bodyText, 220),
      flyerImageUrl: pickImage(html, url)
    });
    if (ev) events.push(ev);
  }

  const contestMatch = bodyText.match(/パークジャズライブコンテスト[^\n]*?(20\d{2})年(\d{1,2})月(\d{1,2})日/i);
  if (contestMatch) {
    const startDate = `${contestMatch[1]}-${String(contestMatch[2]).padStart(2, '0')}-${String(contestMatch[3]).padStart(2, '0')}`;
    const contestVenue = textPreview((bodyText.match(/パークジャズライブコンテスト[^\n]*?会場[：:]\s*([^\n]+)/i) || [])[1] || '札幌市民交流プラザ3階クリエイティブスタジオ', 120);
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: `${url}#contest`,
      title: 'SAPPORO CITY JAZZ パークジャズライブコンテスト',
      startDate,
      venue: contestVenue,
      venueAddress: '札幌市中央区北1条西1丁目',
      time: { open: '', start: '', end: '', allDay: true },
      summary: textPreview(title || bodyText, 220),
      flyerImageUrl: pickImage(html, url)
    });
    if (ev) events.push(ev);
  }

  return uniqueBy(events, (ev) => ev.id);
}

function buildHtbEventFromSection({ source, url, html, title, sectionHtml, nowYmd }) {
  const dateBlock = pickLabeledValue(sectionHtml, '公演日時');
  const venue = pickLabeledValueByPattern(sectionHtml, '会[^<]{0,4}場');
  if (!dateBlock || !venue) return null;
  const dates = parseDatesFromText(dateBlock, nowYmd);
  if (!dates.length) return null;
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate: dates[0].ymd,
    endDate: dates.length >= 2 ? dates[1].ymd : '',
    venue,
    venueAddress: pickAddress(stripTags(sectionHtml)) || '',
    time: parseEventTimes(dateBlock),
    summary: textPreview(stripTags(sectionHtml), 220),
    flyerImageUrl: pickImage(html, url)
  });
}

function extractHtbEventDetailEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-htb-co-jp-event') return [];
  if (!/^https:\/\/www\.htb\.co\.jp\/event\//i.test(url)) return [];
  const bodyHtml = readNextDataBodyHtml(html) || html;
  const title = textPreview(pickMeta(html, 'og:title') || extractTitle(html) || source.name, 120);
  const events = [];

  const sapporoSections = [...bodyHtml.matchAll(/<section\b[^>]*class=["'][^"']*venueMunicipalities[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi)]
    .map((match) => String(match[1] || ''))
    .filter((sectionHtml) => /札幌公演|札幌コンサートホール|札幌文化芸術劇場|カナモトホール|hitaru|Kitara/i.test(sectionHtml));

  if (sapporoSections.length) {
    for (const sectionHtml of sapporoSections) {
      const ev = buildHtbEventFromSection({ source, url, html, title, sectionHtml, nowYmd });
      if (ev) events.push(ev);
    }
    return uniqueBy(events, (ev) => ev.id);
  }

  const summaryMatch = bodyHtml.match(/<section\b[^>]*class=["'][^"']*eventSummary[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  if (!summaryMatch || !summaryMatch[1]) return [];
  const summaryHtml = String(summaryMatch[1] || '');
  if (!SAPPORO_AREA_RE.test(stripTags(summaryHtml))) return [];
  const ev = buildHtbEventFromSection({ source, url, html, title, sectionHtml: summaryHtml, nowYmd });
  return ev ? [ev] : [];
}

function extractJetroJmesseSiteRuleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-jetro-go-jp-j-messe-country-asia-jp-001') return [];
  const events = [];
  const items = [...html.matchAll(/<li>\s*<a\b[^>]*href="([^"]*\/j-messe\/tradefair\/detail\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi)];
  for (const match of items) {
    const detailUrl = absolutizeUrl(url, match[1]) || '';
    const block = String(match[2] || '');
    const title = textPreview(stripTags((block.match(/<p\b[^>]*class=["'][^"']*font18[^"']*font_bold[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ''), 120);
    const dateText = stripTags((block.match(/<dt>\s*会期\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const locationText = stripTags((block.match(/<dt>\s*開催地\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const dates = parseDatesFromText(dateText, nowYmd);
    if (!title || !detailUrl || !dates.length) continue;
    if (!hasSapporoAreaSignal(locationText)) continue;
    const summary = [dateText, locationText].filter(Boolean).join(' / ');
    const ev = buildSiteRuleEvent({
      source,
      detailUrl,
      title,
      startDate: dates[0].ymd,
      endDate: dates.length >= 2 ? dates[1].ymd : '',
      venue: 'アクセスサッポロ',
      venueAddress: '札幌市白石区流通センター4丁目3-55',
      time: { open: '', start: '', end: '', allDay: true },
      summary
    });
    if (ev) events.push(ev);
  }
  return uniqueBy(events, (ev) => ev.id);
}

function extractJetroTradefairDetailEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-jetro-go-jp-j-messe-country-asia-jp-001') return null;
  if (!/\/j-messe\/tradefair\/detail\//i.test(url)) return null;
  const title = String(extractTitle(html) || '').split('|')[0].replace(/\s*-\s*20\d{2}年\d{1,2}月.*$/, '').trim();
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;
  const schedule = pickLabeledValue(html, '会期') || stripTags(html);
  const dates = parseDatesFromText(schedule, nowYmd);
  if (!dates.length) return null;
  const venue = cleanVenue(pickLabeledValue(html, '会場')) || 'アクセスサッポロ';
  const summary = pickLabeledValue(html, '出展対象品目') || pickMeta(html, 'description') || stripTags(html).slice(0, 220);
  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate: dates[0].ymd,
    endDate: dates.length >= 2 ? dates[1].ymd : '',
    venue,
    venueAddress: '札幌市白石区流通センター4丁目3-55',
    time: { open: '', start: '', end: '', allDay: true },
    summary
  });
}

function extractJmaHokkaidoExpoSiteRuleEvents({ source, url, html, nowYmd }) {
  if (source.id !== 'www-jma-or-jp-toshiken-hkd-index-php') return [];
  const body = stripTags(html);
  const dates = parseDatesFromText(body, nowYmd);
  if (dates.length < 2) return [];
  const startDate = dates[0].ymd;
  const endDate = dates[1].ymd;
  const titles = [
    '第7回 北海道 建設開発総合展',
    '第7回 北海道 災害リスク対策推進展',
    '第4回 北海道 エネルギー技術革新EXPO',
    '第2回 北海道 インフラ検査・維持管理・更新展',
    '第1回 土木・建設DX/システム/ツール展',
    '観光・ホテル・産業展-HOKKAIDO2026-'
  ].filter((title) => body.includes(title));
  return titles.map((title) => buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    endDate,
    venue: 'アクセスサッポロ',
    venueAddress: '札幌市白石区流通センター4丁目3-55',
    time: { open: '', start: '10:00', end: '16:00', allDay: false },
    summary: `${title} ${startDate}〜${endDate}`
  })).filter(Boolean);
}

function extractMountAliveSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-mountalive-com-schedule') return null;
  if (!/\/schedule\/more\.php/i.test(url)) return null;
  const desc = pickMeta(html, 'description') || pickMeta(html, 'og:description') || '';
  const bodyText = stripTags(html);
  const dateMatch = desc.match(/日程：\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  let startDate = '';
  if (dateMatch) {
    startDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
  } else {
    const dates = parseDatesFromText(bodyText, nowYmd);
    startDate = dates[0]?.ymd || '';
  }
  if (!startDate) return null;

  const eventName = textPreview((desc.match(/イベント名：([^｜\n]+)/) || [])[1] || '', 120);
  const artist = textPreview((desc.match(/アーティスト名：([^｜\n]+)/) || [])[1] || '', 80);
  const venueRaw = cleanVenue((desc.match(/会場名：([^：｜\n]+)/) || [])[1] || '');
  const venueAddress = textPreview(cleanVenue((desc.match(/会場名：[^：｜\n]+：([^｜\n]+)/) || [])[1] || ''), 140);
  const timeLine = stripTags((html.match(/<p\b[^>]*id=["']op_st_time["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
  const time = parseEventTimes(timeLine || bodyText);

  const title = eventName || artist || textPreview(extractTitle(html).split('|')[0], 120);
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    venue: isInvalidVenueCandidate(venueRaw) ? '' : venueRaw,
    venueAddress,
    time,
    summary: desc || bodyText,
    flyerImageUrl: pickImage(html, url)
  });
}

function extractZeppSapporoSiteRuleEvent({ source, url, html, nowYmd }) {
  if (source.id !== 'www-zepp-co-jp-hall-sapporo-schedule') return null;
  if (!/\/schedule\/single\//i.test(url)) return null;
  const bodyText = stripTags(html);
  const year = (html.match(/sch-single-headelin-date__year[^>]*>\s*(\d{4})\s*</i) || [])[1] || '';
  const md = html.match(/sch-single-headelin-date__month[^>]*>\s*(\d{1,2})\.(\d{1,2})\s*</i);
  let startDate = '';
  if (year && md) {
    startDate = `${year}-${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}`;
  } else {
    startDate = parseDatesFromText(bodyText, nowYmd)[0]?.ymd || '';
  }
  if (!startDate) return null;

  const eventTitle = textPreview(stripTags((html.match(/<h2\b[^>]*class=["'][^"']*sch-single-headelin-ttl[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || ''), 120);
  const artist = textPreview(stripTags((html.match(/<h3\b[^>]*class=["'][^"']*sch-single-headeline02[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || ''), 80);
  const title = textPreview(`${artist} ${eventTitle}`.replace(/\s+/g, ' ').trim(), 120);
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const open = (html.match(/sch-single-table-time__open[^>]*>\s*([0-2]?\d[:：][0-5]\d)\s*</i) || [])[1] || '';
  const start = (html.match(/sch-single-table-time__start[^>]*>\s*([0-2]?\d[:：][0-5]\d)\s*</i) || [])[1] || '';

  return buildSiteRuleEvent({
    source,
    detailUrl: url,
    title,
    startDate,
    venue: 'Zepp Sapporo',
    venueAddress: '',
    time: { open: open.replace('：', ':'), start: start.replace('：', ':'), end: '', allDay: !(open || start) },
    summary: pickMeta(html, 'description') || bodyText,
    flyerImageUrl: pickImage(html, url)
  });
}

function extractTicketPiaLocalSiteRuleEvents({ source, url, html }) {
  if (source.id !== 't-pia-jp-hokkaido') return [];
  if (!/[?&]eventBundleCd=/.test(url)) return [];

  const title = textPreview(extractTitle(html).split('|')[0], 120) || source.name;
  const summary = pickMeta(html, 'og:description') || pickMeta(html, 'description') || stripTags(html);
  const flyerImageUrl = pickImage(html, url);
  const events = [];

  const cardRe = /<p\b[^>]*class=["'][^"']*ticketSalesCard-2024__date[^"']*["'][^>]*>([\s\S]*?)<\/p>\s*<p\b[^>]*class=["'][^"']*ticketSalesCard-2024__location[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const dateHtml = String(m[1] || '');
    const locationHtml = String(m[2] || '');
    const start = parseIsoDateParts((dateHtml.match(/<time\b[^>]*itemprop=["']startDate["'][^>]*datetime=["']([^"']+)["']/i) || [])[1] || '');
    if (!start.date) continue;
    const end = parseIsoDateParts((dateHtml.match(/<time\b[^>]*itemprop=["']endDate["'][^>]*datetime=["']([^"']+)["']/i) || [])[1] || '');
    const place = textPreview(stripTags((locationHtml.match(/<span\b[^>]*class=["'][^"']*ticketSalesCard-2024__place[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''), 80);
    const address = textPreview(stripTags((locationHtml.match(/<span\b[^>]*class=["'][^"']*ticketSalesCard-2024__address[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''), 80);
    const geoText = [place, address].filter(Boolean).join('\n');
    if (!place || !hasSapporoAreaSignal(geoText)) continue;

    const venue = address ? `${place} (${address})` : place;
    const ev = buildSiteRuleEvent({
      source,
      detailUrl: url,
      title,
      startDate: start.date,
      endDate: end.date || '',
      venue,
      venueAddress: '',
      time: { open: '', start: '', end: '', allDay: true },
      summary,
      flyerImageUrl
    });
    if (ev) events.push(ev);
  }

  return uniqueBy(events, (ev) => ev.id);
}

function makeEventId(seed) {
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 20);
}

function normalizeTitle(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\d{4}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2}日?/g, '')
    .replace(/\d{1,2}[\/.月]\d{1,2}日?/g, '')
    .replace(/([01]?\d|2[0-3])[:：][0-5]\d(\s*[〜~\-－–]\s*([01]?\d|2[0-3])[:：][0-5]\d)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeTitleKey(text) {
  return normalizeTitle(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isGenericHallName(text) {
  return /^(小ホール|大ホール|中ホール|メインホール|ホール|スタジオ\d*|会場A|会場B|会場C)$/.test(String(text || '').trim());
}

function sourceVenueName(source) {
  if (!source || !source.id) return '';
  return String(SOURCE_VENUE_FALLBACK[source.id] || '').trim();
}

function hasSapporoAreaSignal(text) {
  const t = normalizeGeoText(text);
  if (!t) return false;
  return SAPPORO_AREA_RE.test(t);
}

function hasNonSapporoAreaSignal(text) {
  const t = normalizeGeoText(text);
  if (!t) return false;
  return NON_SAPPORO_AREA_RE.test(t);
}

export function isSapporoAreaEvent(ev, source = null) {
  if (!ev || typeof ev !== 'object') return false;

  const title = normalizeGeoText(ev.title || '');
  const venue = cleanVenue(ev.venue || '');
  const rawAddress = normalizeGeoText(ev.venue_address || '');
  const address = isInvalidAddressCandidate(rawAddress) ? '' : rawAddress;
  const sourceVenue = cleanVenue(sourceVenueName(source));
  const hasTrustedSourceVenue = !!(sourceVenue && hasSapporoAreaSignal(sourceVenue));

  const locationText = [venue, address, sourceVenue].filter(Boolean).join('\n');
  const broadText = [title, venue, address].filter(Boolean).join('\n');

  const hasLocalLocation = hasSapporoAreaSignal(locationText);
  const hasLocalBroad = hasSapporoAreaSignal(broadText);
  const hasOutsideBroad = hasNonSapporoAreaSignal(broadText);
  const hasMultiLocationListing = /[／/]/.test(venue) || /[／/]/.test(address);

  if (hasOutsideBroad && !hasLocalLocation) return false;
  if (hasMultiLocationListing && hasOutsideBroad && hasLocalBroad) return false;
  if (venue && hasNonSapporoAreaSignal(venue) && !hasSapporoAreaSignal(venue)) return false;
  if (address && hasNonSapporoAreaSignal(address) && !hasSapporoAreaSignal(address)) return false;

  return hasLocalLocation || (hasLocalBroad && hasTrustedSourceVenue);
}

function enrichVenue(ev, source, contextText) {
  if (!ev) return ev;
  let venue = cleanVenue(ev.venue || '');
  if (isInvalidVenueCandidate(venue)) venue = '';
  const srcVenue = sourceVenueName(source);
  if (!venue) venue = cleanVenue(pickVenue(contextText));
  if (isInvalidVenueCandidate(venue)) venue = '';
  if (!venue) venue = cleanVenue(pickVenueLoose(`${ev.summary || ''}\n${ev.title || ''}\n${contextText || ''}`));
  if (isInvalidVenueCandidate(venue)) venue = '';
  if (!venue && srcVenue) venue = srcVenue;
  if (venue && isGenericHallName(venue) && srcVenue) venue = `${srcVenue} ${venue}`;
  return { ...ev, venue: textPreview(venue, 80) };
}

function hasDetailUrlSignal(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  return DETAIL_URL_SIGNAL_RE.test(u);
}

function isLikelyListingEvent(ev) {
  const title = String(ev?.title || '').trim();
  const detailUrl = String(ev?.detail_url || '').trim();
  if (!title || !detailUrl) return true;
  if (BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return true;
  if (BAD_URL_RE.test(detailUrl)) return true;
  const hasSpecificData = !!(ev.open_time || ev.start_time || ev.end_time || ev.venue || ev.venue_address);
  if (!hasSpecificData && !hasDetailUrlSignal(detailUrl)) return true;
  return false;
}

function qualityScore(ev) {
  let score = 0.0;
  const title = String(ev?.title || '');
  if (String(ev?.start_date || '').length === 10) score += 0.18;
  if (title.length >= 8) score += 0.12;
  if (!BAD_TITLE_RE.test(title) && !WEAK_TITLE_RE.test(title)) score += 0.12;
  if (hasDetailUrlSignal(ev?.detail_url || '')) score += 0.2;
  if (ev?.open_time) score += 0.08;
  if (ev?.start_time) score += 0.1;
  if (ev?.end_time) score += 0.05;
  if (ev?.venue) score += 0.07;
  if (ev?.venue_address) score += 0.04;
  if (String(ev?.summary || '').length >= 30) score += 0.04;
  if (String(ev?.extraction_method || '') === 'jsonld') score += 0.15;
  if (String(ev?.extraction_method || '') === 'jsonld' && !ev?.open_time && !ev?.start_time && !ev?.end_time) score -= 0.08;
  const priority = String(ev?.source_priority || 'B').toUpperCase();
  if (priority === 'S') score += 0.07;
  if (priority === 'A') score += 0.04;
  if (isLikelyListingEvent(ev)) score -= 0.35;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function withQuality(ev) {
  const normalized = { ...ev };
  if (String(normalized.start_time || '') === '00:00' && !normalized.open_time && !normalized.end_time) {
    normalized.start_time = '';
  }
  const score = qualityScore(normalized);
  return { ...normalized, quality_score: score };
}

function isPublishable(ev) {
  if (!ev) return false;
  const title = String(ev.title || '').trim();
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return false;
  if (BAD_URL_RE.test(String(ev.detail_url || ''))) return false;
  if (isLikelyListingEvent(ev)) return false;
  const method = String(ev.extraction_method || 'heuristic');
  if (method !== 'jsonld') {
    const hasStrongSignal = (
      hasDetailUrlSignal(ev.detail_url || '') ||
      !!ev.open_time ||
      !!ev.start_time ||
      !!ev.end_time ||
      !!ev.venue ||
      !!ev.venue_address
    );
    if (!hasStrongSignal) return false;
  }
  const score = Number(ev.quality_score || 0);
  if (method === 'jsonld' || method === 'site_rule') return score >= MIN_QUALITY_SCORE;
  return score >= MIN_QUALITY_SCORE_HEURISTIC;
}

function buildEvent({ source, detailUrl, title, bodyText, html, nowYmd }) {
  if (BAD_URL_RE.test(detailUrl)) return null;
  const dates = parseDatesFromText(bodyText, nowYmd);
  if (!dates.length) return null;

  const firstDate = dates[0];
  const startDate = firstDate.ymd;
  let endDate = '';
  if (dates.length >= 2) {
    const gap = Math.abs(dates[1].idx - dates[0].idx);
    if (gap < 25) endDate = dates[1].ymd;
  }

  const contextStart = Math.max(0, firstDate.idx - 120);
  const contextEnd = Math.min(bodyText.length, firstDate.idx + 180);
  const dateContext = bodyText.slice(contextStart, contextEnd);
  const timeContext = `${title}\n${dateContext}`;
  let time = parseEventTimes(timeContext);
  if (!(time.open || time.start || time.end) && hasDetailUrlSignal(detailUrl)) {
    const bodyTime = parseEventTimes(bodyText);
    if (bodyTime.open || bodyTime.start || bodyTime.end) time = bodyTime;
  }
  const summary = textPreview(pickMeta(html, 'description') || pickMeta(html, 'og:description') || bodyText, 220);

  const eventTitle = normalizeTitle(title) || title || source.name;
  if (!eventTitle || eventTitle.length < 4) return null;
  if (BAD_TITLE_RE.test(eventTitle)) return null;
  if (WEAK_TITLE_RE.test(eventTitle)) return null;
  if (!hasEventSignal(eventTitle, dateContext) && !hasDetailUrlSignal(detailUrl)) return null;
  if (normalizeUrlForCompare(detailUrl) === normalizeUrlForCompare(source.url) && normalizeTitle(eventTitle) === normalizeTitle(source.name)) {
    return null;
  }

  const seed = `${detailUrl}|${startDate}|${time.open || ''}|${time.start || ''}|${time.end || ''}`;
  return {
    id: makeEventId(seed),
    title: textPreview(eventTitle, 120),
    start_date: startDate,
    end_date: endDate,
    open_time: time.open,
    start_time: time.start,
    end_time: time.end,
    all_day: !!time.allDay,
    venue: pickVenue(bodyText),
    venue_address: pickAddress(bodyText),
    summary,
    flyer_image_url: pickImage(html, detailUrl),
    detail_url: detailUrl,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    source_category: source.category || '',
    source_priority: source.priority || 'B',
    source_priority_score: PRIORITY_SCORE[source.priority] || 0,
    extraction_method: 'heuristic',
    updated_at: new Date().toISOString()
  };
}

function eventFromJsonLdNode(node, source, detailUrl) {
  if (!nodeTypeIncludes(node, 'event')) return null;
  const title = textPreview(node.name || node.headline || '', 120);
  if (!title) return null;
  if (BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const start = parseIsoDateParts(node.startDate || node.doorTime || '');
  if (!start.date) return null;
  const end = parseIsoDateParts(node.endDate || '');
  let startTime = start.time || '';
  let endTime = end.time || '';
  if (startTime === '00:00') {
    startTime = '';
    if (endTime === '23:59') endTime = '';
  }

  const location = node.location && Array.isArray(node.location) ? node.location[0] : node.location;
  const venue = toVenueText(location);
  const venueAddress = toAddressText(location);
  const image = Array.isArray(node.image) ? node.image[0] : node.image || '';
  const summary = textPreview(node.description || '', 220);

  const eventUrl = absolutizeUrl(detailUrl, node.url || '') || detailUrl;
  if (!eventUrl || BAD_URL_RE.test(eventUrl)) return null;

  const seed = `${eventUrl}|${start.date}|${startTime || ''}|${title}`;
  return {
    id: makeEventId(seed),
    title,
    start_date: start.date,
    end_date: end.date || '',
    open_time: '',
    start_time: startTime || '',
    end_time: endTime,
    all_day: !(startTime || endTime),
    venue,
    venue_address: venueAddress,
    summary,
    flyer_image_url: absolutizeUrl(detailUrl, image) || '',
    detail_url: eventUrl,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    source_category: source.category || '',
    source_priority: source.priority || 'B',
    source_priority_score: PRIORITY_SCORE[source.priority] || 0,
    extraction_method: 'jsonld',
    updated_at: new Date().toISOString()
  };
}

function extractJsonLdEvents({ html, source, detailUrl }) {
  const blocks = readJsonLdBlocks(html);
  if (!blocks.length) return [];
  const out = [];
  for (const block of blocks) {
    const nodes = flattenJsonLd(block);
    for (const node of nodes) {
      const ev = eventFromJsonLdNode(node, source, detailUrl);
      if (ev) out.push(ev);
    }
  }
  return uniqueBy(out, (ev) => ev.id);
}

function extractEventsFromPage({ source, url, html, titleHint, nowYmd }) {
  const events = [];
  const bodyText = stripTags(html);
  const moleFeedEvents = extractMoleFeedEvents({ source, url, html, nowYmd });
  for (const ev of moleFeedEvents) events.push(withQuality(ev));
  const kitaraEvent = extractKitaraSiteRuleEvent({ source, url, html, nowYmd });
  if (kitaraEvent) events.push(withQuality(kitaraEvent));
  const seasonEvent = extractSapporoTravelSeasonEvent({ source, url, html, nowYmd });
  if (seasonEvent) events.push(withQuality(seasonEvent));
  const snowfesEvent = extractSnowfesSiteRuleEvent({ source, url, html, nowYmd });
  if (snowfesEvent) events.push(withQuality(snowfesEvent));
  const yosakoiEvent = extractYosakoiSiteRuleEvent({ source, url, html, nowYmd });
  if (yosakoiEvent) events.push(withQuality(yosakoiEvent));
  const plazaEvent = extractSapporoCommunityPlazaSiteRuleEvent({ source, url, html, nowYmd });
  if (plazaEvent) events.push(withQuality(plazaEvent));
  const artparkListingEvents = extractArtparkListingEvents({ source, url, html, nowYmd });
  for (const ev of artparkListingEvents) events.push(withQuality(ev));
  const artparkDetailEvent = extractArtparkDetailEvent({ source, url, html, nowYmd });
  if (artparkDetailEvent) events.push(withQuality(artparkDetailEvent));
  const factoryEvents = extractSapporoFactoryMonthlyEvents({ source, url, html, nowYmd });
  for (const ev of factoryEvents) events.push(withQuality(ev));
  const pl24Events = extractPl24ScheduleEvents({ source, url, html, nowYmd });
  for (const ev of pl24Events) events.push(withQuality(ev));
  const cubeEvents = extractCubeGardenScheduleEvents({ source, url, html, nowYmd });
  for (const ev of cubeEvents) events.push(withQuality(ev));
  const hbcEvents = extractHbcConcertEvents({ source, url, html, nowYmd });
  for (const ev of hbcEvents) events.push(withQuality(ev));
  const soraEvents = extractSoraConventionEvents({ source, url, html, nowYmd });
  for (const ev of soraEvents) events.push(withQuality(ev));
  const kyobunEvents = extractKyobunScheduleEvents({ source, url, html, nowYmd });
  for (const ev of kyobunEvents) events.push(withQuality(ev));
  const tsudomeEvents = extractTsudomeCalendarEvents({ source, url, html, nowYmd });
  for (const ev of tsudomeEvents) events.push(withQuality(ev));
  const shiminhallEvents = extractSapporoShiminhallScheduleEvents({ source, url, html, nowYmd });
  for (const ev of shiminhallEvents) events.push(withQuality(ev));
  const chieriaEvents = extractChieriaHallScheduleEvents({ source, url, html, nowYmd });
  for (const ev of chieriaEvents) events.push(withQuality(ev));
  const axesEvents = extractAxesCalendarEvents({ source, url, html, nowYmd });
  for (const ev of axesEvents) events.push(withQuality(ev));
  const kaderuEvents = extractKaderuVenueEvents({ source, url, html, nowYmd });
  for (const ev of kaderuEvents) events.push(withQuality(ev));
  const doshinEvent = extractDoshinPlayguideSiteRuleEvent({ source, url, html, nowYmd });
  if (doshinEvent) events.push(withQuality(doshinEvent));
  const caretexEvent = extractCaretexSiteRuleEvent({ source, url, html, nowYmd });
  if (caretexEvent) events.push(withQuality(caretexEvent));
  const cityJazzNewsEvents = extractSapporoCityJazzNewsEvents({ source, url, html, nowYmd });
  for (const ev of cityJazzNewsEvents) events.push(withQuality(ev));
  const htbEvents = extractHtbEventDetailEvents({ source, url, html, nowYmd });
  for (const ev of htbEvents) events.push(withQuality(ev));
  const noMapsEvent = extractNoMapsNearlyEvent({ source, url, html, nowYmd });
  if (noMapsEvent) events.push(withQuality(noMapsEvent));
  const grandEvent = extractGrand1934EventDetailEvent({ source, url, html, nowYmd });
  if (grandEvent) events.push(withQuality(grandEvent));
  const keioEvent = extractKeioPlazaEventDetailEvent({ source, url, html, nowYmd });
  if (keioEvent) events.push(withQuality(keioEvent));
  const jetroEvents = extractJetroJmesseSiteRuleEvents({ source, url, html, nowYmd });
  for (const ev of jetroEvents) events.push(withQuality(ev));
  const jetroDetailEvent = extractJetroTradefairDetailEvent({ source, url, html, nowYmd });
  if (jetroDetailEvent) events.push(withQuality(jetroDetailEvent));
  const jmaEvents = extractJmaHokkaidoExpoSiteRuleEvents({ source, url, html, nowYmd });
  for (const ev of jmaEvents) events.push(withQuality(ev));
  const mountAliveEvent = extractMountAliveSiteRuleEvent({ source, url, html, nowYmd });
  if (mountAliveEvent) events.push(withQuality(mountAliveEvent));
  const zeppEvent = extractZeppSapporoSiteRuleEvent({ source, url, html, nowYmd });
  if (zeppEvent) events.push(withQuality(zeppEvent));
  const ticketPiaEvents = extractTicketPiaLocalSiteRuleEvents({ source, url, html });
  for (const ev of ticketPiaEvents) events.push(withQuality(ev));

  const jsonLdEvents = extractJsonLdEvents({ html, source, detailUrl: url });
  for (const ev of jsonLdEvents) {
    const hasPreciseTime = (
      (ev?.start_time && ev.start_time !== '00:00') ||
      (ev?.open_time && ev.open_time !== '00:00') ||
      (ev?.end_time && ev.end_time !== '00:00' && ev.end_time !== '23:59')
    );
    if (hasPreciseTime) {
      events.push(ev);
      continue;
    }
    const fallbackTime = parseEventTimes(`${titleHint || ''}\n${bodyText}`);
    if (fallbackTime.open || fallbackTime.start || fallbackTime.end) {
      events.push({
        ...ev,
        open_time: fallbackTime.open || ev.open_time || '',
        start_time: fallbackTime.start || ev.start_time || '',
        end_time: fallbackTime.end || ev.end_time || '',
        all_day: !(fallbackTime.open || fallbackTime.start || fallbackTime.end)
      });
    } else {
      events.push(ev);
    }
  }

  const hasCuratedExtraction = events.some((ev) => String(ev?.extraction_method || '') === 'site_rule');
  if (!hasCuratedExtraction && !mountAliveEvent && !zeppEvent && ticketPiaEvents.length === 0) {
    const heuristicEvent = buildEvent({
      source,
      detailUrl: url,
      title: titleHint || extractTitle(html) || source.name,
      bodyText,
      html,
      nowYmd
    });
    if (heuristicEvent) events.push(heuristicEvent);
  }

  return uniqueBy(events, (ev) => ev.id)
    .map((ev) => enrichVenue(ev, source, bodyText))
    .map(withQuality);
}

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'TSMS-EventCrawler/1.0 (+https://taxi-sms.github.io/tsmsp/)'
      }
    });
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text') && !contentType.includes('xml') && !contentType.includes('html')) {
      throw new Error('unsupported_content_type');
    }
    return {
      url: res.url,
      html: await res.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'TSMS-EventCrawler/1.0 (+https://taxi-sms.github.io/tsmsp/)'
      }
    });
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function uniqueBy(array, keyFn) {
  const out = [];
  const seen = new Set();
  for (const row of array) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function eventFromWessPost(post, source) {
  const meta = (post && typeof post === 'object' && post.meta && typeof post.meta === 'object') ? post.meta : {};
  const startDate = parseIsoDateParts(String(meta.kouenbi || '')).date;
  if (!startDate) return null;

  const artist = textPreview(meta.artist || '', 80);
  const concertTitle = textPreview(meta.concerttitle || '', 120);
  const title = textPreview([artist, concertTitle].filter(Boolean).join(' ').trim() || String(post.title || ''), 120);
  if (!title || BAD_TITLE_RE.test(title) || WEAK_TITLE_RE.test(title)) return null;

  const summary = textPreview(
    stripTags(meta.freeareaahonbun || meta.koenjoho || meta.tentohanbaicomment || meta.ryokincomment || ''),
    220
  );
  const venue = textPreview(meta.kaijo || '', 80);
  const openTime = String(meta.kaijojikan || '').trim().replace('：', ':');
  const startTime = String(meta.kaienjikan || '').trim().replace('：', ':');
  const detailUrl = absolutizeUrl(source.url, post.link || '') || '';
  if (!detailUrl) return null;

  return {
    id: makeEventId(`${detailUrl}|${startDate}|${openTime}|${startTime}|${title}`),
    title,
    start_date: startDate,
    end_date: '',
    open_time: openTime,
    start_time: startTime,
    end_time: '',
    all_day: !(openTime || startTime),
    venue,
    venue_address: '',
    summary,
    flyer_image_url: absolutizeUrl(source.url, meta.thumbnail_url || '') || '',
    detail_url: detailUrl,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    source_category: source.category || '',
    source_priority: source.priority || 'B',
    source_priority_score: PRIORITY_SCORE[source.priority] || 0,
    extraction_method: 'site_rule',
    updated_at: new Date().toISOString()
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) break;
      try {
        results[i] = await mapper(items[i], i);
      } catch (error) {
        results[i] = { error };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function crawlWessSource(source, options) {
  const { nowYmd, maxDate } = options;
  const months = enumerateMonthStarts(nowYmd, maxDate);
  const events = [];

  for (const monthYmd of months) {
    const from = compactYmd(monthYmd);
    const to = compactYmd(nextMonthYmd(monthYmd));
    const nowCompact = compactYmd(nowYmd);
    const params = new URLSearchParams();
    params.set('filter[posts_per_page]', '100');
    params.set('filter[offset]', '0');
    params.set('filter[meta_query][0][key]', 'kouenbi');
    params.set('filter[meta_query][0][value]', from);
    params.set('filter[meta_query][0][compare]', '>=');
    params.set('filter[meta_query][0][type]', 'NUMERIC');
    params.set('filter[meta_query][1][key]', 'kouenbi');
    params.set('filter[meta_query][1][value]', to);
    params.set('filter[meta_query][1][compare]', '<');
    params.set('filter[meta_query][1][type]', 'NUMERIC');
    params.set('filter[meta_query][2][key]', 'kouenbi');
    params.set('filter[meta_query][2][value]', nowCompact);
    params.set('filter[meta_query][2][compare]', '>=');
    params.set('filter[meta_query][2][type]', 'NUMERIC');
    params.set('filter[meta_query][relation]', 'AND');
    params.set('filter[orderby]', 'meta_value');
    params.set('filter[order]', 'ASC');
    params.set('filter[meta_key]', 'kouenbi');

    const url = `https://wess.jp/wp-json/posts?${params.toString()}`;
    let rows = [];
    try {
      const payload = await fetchJson(url, 15000);
      rows = Array.isArray(payload) ? payload : [];
    } catch (_) {
      continue;
    }

    for (const row of rows) {
      const ev = eventFromWessPost(row, source);
      if (ev) events.push(withQuality(ev));
    }
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: ''
  };
}

async function crawlDoshinPlayguideSource(source, options) {
  const { nowYmd } = options;
  let root;
  try {
    root = await fetchText(source.url, 12000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }

  const urls = [...root.html.matchAll(/https:\/\/doshin-playguide\.jp\/(ticket\/detail\/\d+|event\/[a-zA-Z0-9._/-]+)/g)]
    .map((m) => `https://doshin-playguide.jp/${m[1]}`);
  const detailPages = await mapLimit(uniqueBy(urls, (x) => x), 4, async (url) => {
    try {
      return await fetchText(url, 10000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of detailPages) {
    if (!page || page.error) continue;
    const pageEvents = extractEventsFromPage({
      source,
      url: page.url,
      html: page.html,
      titleHint: extractTitle(page.html) || source.name,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: ''
  };
}

async function crawlMonthlyDetailSource(source, options, buildMonthUrl, detailUrlRe) {
  const { nowYmd, maxDate } = options;
  const months = enumerateMonthStarts(nowYmd, maxDate);
  const monthPages = await mapLimit(months, 4, async (monthYmd) => {
    try {
      return await fetchText(buildMonthUrl(monthYmd), 12000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  const detailLinks = [];
  for (const page of monthPages) {
    if (!page || page.error) continue;
    const pageEvents = extractEventsFromPage({
      source,
      url: page.url,
      html: page.html,
      titleHint: extractTitle(page.html) || source.name,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));

    const links = extractLinks(page.html, page.url);
    for (const link of links) {
      if (detailUrlRe.test(link.url)) detailLinks.push(link.url);
    }
  }

  const detailPages = await mapLimit(uniqueBy(detailLinks, (x) => x), 4, async (url) => {
    try {
      return await fetchText(url, 10000);
    } catch (_) {
      return null;
    }
  });

  for (const page of detailPages) {
    if (!page || page.error) continue;
    const pageEvents = extractEventsFromPage({
      source,
      url: page.url,
      html: page.html,
      titleHint: extractTitle(page.html) || source.name,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: ''
  };
}

async function crawlSeededDetailSource(source, options, seedUrls, detailUrlRe) {
  const { nowYmd } = options;
  const seeds = await mapLimit(seedUrls, 4, async (url) => {
    try {
      return await fetchText(url, 12000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  const detailLinks = [];
  for (const page of seeds) {
    if (!page || page.error) continue;
    const pageEvents = extractEventsFromPage({
      source,
      url: page.url,
      html: page.html,
      titleHint: extractTitle(page.html) || source.name,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));
    for (const link of extractLinks(page.html, page.url)) {
      if (detailUrlRe.test(link.url)) detailLinks.push(link.url);
    }
  }

  const details = await mapLimit(uniqueBy(detailLinks, (x) => x), 4, async (url) => {
    try {
      return await fetchText(url, 10000);
    } catch (_) {
      return null;
    }
  });

  for (const page of details) {
    if (!page || page.error) continue;
    const pageEvents = extractEventsFromPage({
      source,
      url: page.url,
      html: page.html,
      titleHint: extractTitle(page.html) || source.name,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: ''
  };
}

async function crawlSeededListSource(source, options, seedUrls, pageParser = null) {
  const { nowYmd } = options;
  const pages = await mapLimit(seedUrls, 4, async (url) => {
    try {
      return await fetchText(url, 12000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const pageEvents = pageParser
      ? pageParser({ source, url: page.url, html: page.html, nowYmd })
      : extractEventsFromPage({
          source,
          url: page.url,
          html: page.html,
          titleHint: extractTitle(page.html) || source.name,
          nowYmd
        });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: ''
  };
}

async function crawlSlowSeededListSource(source, options, seedUrls, pageParser = null, timeoutMs = 25000) {
  const { nowYmd } = options;
  const pages = await mapLimit(seedUrls, 2, async (url) => {
    try {
      return await fetchText(url, timeoutMs);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  let successCount = 0;
  for (const page of pages) {
    if (!page || page.error) continue;
    successCount += 1;
    const pageEvents = pageParser
      ? pageParser({ source, url: page.url, html: page.html, nowYmd })
      : extractEventsFromPage({
          source,
          url: page.url,
          html: page.html,
          titleHint: extractTitle(page.html) || source.name,
          nowYmd
        });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (x) => x.id),
    error: successCount > 0 ? '' : 'fetch_failed'
  };
}

async function crawlHtbEventSource(source, options) {
  const { nowYmd, maxDate } = options;
  let rows;
  try {
    rows = await fetchJson('https://www.htb.co.jp/event/event.json', 15000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }
  const candidates = uniqueBy(
    (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const startDate = parseIsoDateParts(String(row?.startDate || '')).date;
        const endDate = parseIsoDateParts(String(row?.endDate || '')).date || startDate;
        return {
          url: String(row?.url || '').trim(),
          startDate,
          endDate
        };
      })
      .filter((row) => /^https:\/\/www\.htb\.co\.jp\/event\//i.test(row.url))
      .filter((row) => !row.startDate || row.startDate <= maxDate)
      .filter((row) => !row.endDate || row.endDate >= nowYmd),
    (row) => row.url
  );

  const pages = await mapLimit(candidates, 3, async (row) => {
    try {
      return await fetchText(row.url, 15000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const pageEvents = extractHtbEventDetailEvents({
      source,
      url: page.url,
      html: page.html,
      nowYmd
    });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (ev) => ev.id),
    error: ''
  };
}

async function crawlSapporoCityJazzSource(source, options) {
  const { nowYmd } = options;
  const seedUrls = [
    'https://sapporocityjazz.jp/',
    'https://sapporocityjazz.jp/news/',
    'https://sapporocityjazz.jp/event/'
  ];
  const pages = await mapLimit(seedUrls, 2, async (url) => {
    try {
      return await fetchText(url, 25000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  const detailCandidates = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const links = extractLinks(page.html, page.url)
      .filter((link) => /^https:\/\/sapporocityjazz\.jp\//i.test(link.url))
      .filter((link) => /\/event\/|\/20\d{2}\/\d{2}\/\d{2}\//i.test(link.url));
    for (const link of links) detailCandidates.push(link);
  }

  const detailPages = await mapLimit(
    uniqueBy(detailCandidates, (link) => link.url).slice(0, 16),
    2,
    async (link) => {
      try {
        return await fetchText(link.url, 25000);
      } catch (_) {
        return null;
      }
    }
  );

  for (const page of detailPages) {
    if (!page || page.error) continue;
    const pageEvents = /\/20\d{2}\/\d{2}\/\d{2}\/news-\d+\/?$/i.test(page.url)
      ? extractSapporoCityJazzNewsEvents({
          source,
          url: page.url,
          html: page.html,
          nowYmd
        })
      : extractEventsFromPage({
          source,
          url: page.url,
          html: page.html,
          titleHint: extractTitle(page.html) || source.name,
          nowYmd
        });
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (ev) => ev.id),
    error: ''
  };
}

async function crawlSapporoTravelSeasonJsonSource(source, options) {
  const { nowYmd } = options;
  const base = SAPPORO_TRAVEL_JSON_BASE[source.id];
  if (!base) return { sourceId: source.id, events: [], error: 'unsupported_source' };

  let archive;
  try {
    archive = await fetchJson(`${base}/data/json/archive.json`, 15000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }

  const rows = Array.isArray(archive) ? archive.slice(0, 12) : [];
  const detailIds = rows
    .map((row) => Number(row?.id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);
  const detailPayloads = await mapLimit(detailIds, 3, async (id) => {
    try {
      const detail = await fetchJson(`${base}/data/json/detail/${id}.json`, 15000);
      return { id, detail };
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const row of detailPayloads) {
    if (!row || !row.detail) continue;
    const detailUrl = absolutizeUrl(base, row.detail?.important_link || row.detail?.permalink || row.detail?.link || '') || `${base}/`;
    let pageEvents = [];
    if (source.id === 'www-sapporo-travel-summerfes') {
      pageEvents = extractSummerfesDetailEvents({ source, detail: row.detail, detailUrl, nowYmd });
    } else if (source.id === 'www-sapporo-travel-lilacfes-about') {
      pageEvents = extractLilacfesDetailEvents({ source, detail: row.detail, detailUrl, nowYmd });
    } else {
      pageEvents = extractWhiteIlluminationDetailEvents({ source, detail: row.detail, detailUrl, nowYmd });
    }
    for (const ev of pageEvents) events.push(withQuality(ev));
  }

  const bestByTitle = new Map();
  const spanDays = (ev) => {
    const start = String(ev?.start_date || '');
    const end = String(ev?.end_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
    const a = new Date(`${start}T00:00:00Z`);
    const b = new Date(`${end}T00:00:00Z`);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  };
  for (const ev of events) {
    const key = String(ev?.title || '');
    if (!key) continue;
    const prev = bestByTitle.get(key);
    if (!prev) {
      bestByTitle.set(key, ev);
      continue;
    }
    const prevFuture = String(prev.start_date || '') >= nowYmd;
    const nextFuture = String(ev.start_date || '') >= nowYmd;
    if (nextFuture && !prevFuture) {
      bestByTitle.set(key, ev);
      continue;
    }
    if (nextFuture === prevFuture && spanDays(ev) > spanDays(prev)) {
      bestByTitle.set(key, ev);
      continue;
    }
    if (nextFuture === prevFuture && spanDays(ev) === spanDays(prev) && String(ev.start_date || '') > String(prev.start_date || '')) {
      bestByTitle.set(key, ev);
    }
  }

  return {
    sourceId: source.id,
    events: Array.from(bestByTitle.values()),
    error: ''
  };
}

async function crawlNoMapsSource(source, options) {
  const { nowYmd } = options;
  let root;
  try {
    root = await fetchText('https://no-maps.jp/nearly-event/', 20000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }
  const detailLinks = uniqueBy(
    extractLinks(root.html, root.url)
      .filter((link) => /^https:\/\/no-maps\.jp\/nearly-event\/[^/?#]+\/?$/i.test(link.url))
      .filter((link) => !/\/page\/\d+/i.test(link.url)),
    (link) => link.url
  ).slice(0, 16);

  const pages = await mapLimit(detailLinks, 3, async (link) => {
    try {
      return await fetchText(link.url, 20000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const ev = extractNoMapsNearlyEvent({
      source,
      url: page.url,
      html: page.html,
      nowYmd
    });
    if (ev) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (ev) => ev.id),
    error: ''
  };
}

async function crawlGrand1934EventSource(source, options) {
  const { nowYmd } = options;
  let root;
  try {
    root = await fetchText(source.url, 15000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }
  const detailLinks = uniqueBy(
    extractLinks(root.html, root.url)
      .filter((link) => /^https:\/\/grand1934\.com\/event\/[^/?#]+\/?$/i.test(link.url))
      .filter((link) => !/\/event\/?$/i.test(link.url))
      .filter((link) => !/\/feed\/?$/i.test(link.url)),
    (link) => link.url
  ).slice(0, 16);

  const pages = await mapLimit(detailLinks, 3, async (link) => {
    try {
      return await fetchText(link.url, 15000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const ev = extractGrand1934EventDetailEvent({
      source,
      url: page.url,
      html: page.html,
      nowYmd
    });
    if (ev) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (ev) => ev.id),
    error: ''
  };
}

async function crawlKeioPlazaEventSource(source, options) {
  const { nowYmd } = options;
  let root;
  try {
    root = await fetchText(source.url, 15000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }
  const detailLinks = uniqueBy(
    extractLinks(root.html, root.url)
      .filter((link) => /^https:\/\/www\.keioplaza-sapporo\.co\.jp\/event\/detail_\d+\.html$/i.test(link.url)),
    (link) => link.url
  ).slice(0, 24);

  const pages = await mapLimit(detailLinks, 3, async (link) => {
    try {
      return await fetchText(link.url, 15000);
    } catch (_) {
      return null;
    }
  });

  const events = [];
  for (const page of pages) {
    if (!page || page.error) continue;
    const ev = extractKeioPlazaEventDetailEvent({
      source,
      url: page.url,
      html: page.html,
      nowYmd
    });
    if (ev) events.push(withQuality(ev));
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events, (ev) => ev.id),
    error: ''
  };
}

async function crawlMonthlyListSource(source, options, buildMonthUrl, pageParser) {
  const { nowYmd, maxDate } = options;
  const months = enumerateMonthStarts(nowYmd, maxDate);
  const seedUrls = months.map((monthYmd) => buildMonthUrl(monthYmd));
  return crawlSeededListSource(source, options, seedUrls, pageParser);
}

async function crawlMusicScheduleFamilySource(source, options) {
  if (source.id === 'www-pl24-jp-schedule-html') {
    return crawlSeededListSource(
      source,
      options,
      [
        'https://www.pl24.jp/schedule.html',
        'https://www.pl24.jp/schedule_n.html',
        'https://www.pl24.jp/schedule_nn.html',
        'https://www.pl24.jp/schedule_nnn.html',
        'https://www.pl24.jp/schedule_nnnn.html',
        'https://www.pl24.jp/schedule_nnnnn.html'
      ],
      extractPl24ScheduleEvents
    );
  }
  if (source.id === 'www-cube-garden-com-live-php') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => `https://www.cube-garden.com/live.php?month=${monthYmd.slice(0, 7).replace('-', '')}`,
      extractCubeGardenScheduleEvents
    );
  }
  if (source.id === 'mole-sapporo-jp-schedule') {
    return crawlSeededListSource(
      source,
      options,
      [
        'https://mole-sapporo.jp/category/event/live/feed/',
        'https://mole-sapporo.jp/category/event/club/feed/'
      ],
      extractMoleFeedEvents
    );
  }
  return null;
}

async function crawlPublicHallFamilySource(source, options) {
  if (source.id === 'www-sapporo-shiminhall-org') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://www.sapporo-shiminhall.org/event/?ymd=${y}/${m}/01`;
      },
      extractSapporoShiminhallScheduleEvents
    );
  }
  if (source.id === 'chieria-slp-or-jp-schedule') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://chieria.slp.or.jp/_wcv/calendar/viewcal/QWQWlO/${y}${m}.html`;
      },
      extractChieriaHallScheduleEvents
    );
  }
  if (source.id === 'www-kyobun-org-event-schedule-html') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://www.kyobun.org/event_schedule.html?k=lst&ym=${y}${m}`;
      },
      extractKyobunScheduleEvents
    );
  }
  if (source.id === 'artpark-or-jp-tenrankai-events') {
    return crawlSeededDetailSource(
      source,
      options,
      [
        'https://artpark.or.jp/tenrankai-events/',
        'https://artpark.or.jp/tenrankai-events/page/2/',
        'https://artpark.or.jp/tenrankai-events/page/3/'
      ],
      /\/tenrankai-event\/[^/?#]+\/?$/i
    );
  }
  if (source.id === 'sapporofactory-jp-event') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => `https://sapporofactory.jp/event/?ym=${monthYmd.slice(0, 7)}`,
      extractSapporoFactoryMonthlyEvents
    );
  }
  return null;
}

function resolveSourceStrategy(source, strategyMap) {
  const raw = String(
    source?.crawl_strategy ||
    strategyMap?.[source?.id] ||
    ''
  ).trim().toLowerCase();
  const allowed = new Set(['detail', 'detail_light', 'feed_then_detail', 'custom_rule', 'browser_required']);
  if (allowed.has(raw)) return raw;
  return 'detail';
}

function buildCrawlPlan(source, mode, strategy) {
  const priority = String(source.priority || 'B').toUpperCase();
  let detailLimit = 3;
  if (priority === 'S') detailLimit = mode === 'full' ? 14 : 10;
  else if (priority === 'A') detailLimit = mode === 'full' ? 10 : 7;
  else if (priority === 'B') detailLimit = mode === 'full' ? 6 : 4;
  else detailLimit = mode === 'full' ? 4 : 3;

  let minScore = 3;
  let skipDetails = false;

  if (strategy === 'detail_light') {
    detailLimit = Math.max(2, Math.floor(detailLimit * 0.6));
  } else if (strategy === 'feed_then_detail') {
    detailLimit += mode === 'full' ? 4 : 2;
    minScore = 3;
  } else if (strategy === 'custom_rule') {
    detailLimit = Math.max(2, Math.floor(detailLimit * 0.5));
    minScore = 3;
  } else if (strategy === 'browser_required') {
    detailLimit = 0;
    skipDetails = true;
  }

  const override = SOURCE_DETAIL_LIMIT_OVERRIDE[String(source?.id || '')];
  if (override) {
    detailLimit = Number(mode === 'full' ? override.full : override.delta) || detailLimit;
    minScore = Number(override.minScore || minScore) || minScore;
  }

  return { detailLimit, minScore, skipDetails };
}

async function crawlSource(source, options) {
  const { mode, nowYmd, maxDate, strategy } = options;
  if (source.id === 'wess-jp-concert-schedule') {
    return crawlWessSource(source, options);
  }
  const musicFamilyResult = await crawlMusicScheduleFamilySource(source, options);
  if (musicFamilyResult) return musicFamilyResult;
  const publicHallFamilyResult = await crawlPublicHallFamilySource(source, options);
  if (publicHallFamilyResult) return publicHallFamilyResult;
  if (source.id === 'doshin-playguide-jp') {
    return crawlDoshinPlayguideSource(source, options);
  }
  if (source.id === 'www-kitara-sapporo-or-jp-event') {
    return crawlMonthlyDetailSource(
      source,
      options,
      (monthYmd) => `https://www.kitara-sapporo.or.jp/event/index.html?month=${monthYmd.slice(0, 7)}`,
      /\/event\/event_detail\.php\?num=\d+/i
    );
  }
  if (source.id === 'www-zepp-co-jp-hall-sapporo-schedule') {
    return crawlMonthlyDetailSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://www.zepp.co.jp/hall/sapporo/schedule/?_y=${Number(y)}&_m=${Number(m)}`;
      },
      /\/schedule\/single\/\?rid=\d+/i
    );
  }
  if (source.id === 'www-sapporo-community-plaza-jp-event-php') {
    return crawlSeededDetailSource(
      source,
      options,
      [
        'https://www.sapporo-community-plaza.jp/event.php',
        'https://www.sapporo-community-plaza.jp/event_theater.php',
        'https://www.sapporo-community-plaza.jp/event_scarts.php'
      ],
      /\/event\.php\?num=\d+/i
    );
  }
  if (
    source.id === 'www-sapporo-travel-summerfes' ||
    source.id === 'www-sapporo-travel-lilacfes-about' ||
    source.id === 'www-sapporo-travel-white-illumination' ||
    source.id === 'www-sapporo-travel-white-illumination-event-munich'
  ) {
    return crawlSapporoTravelSeasonJsonSource(source, options);
  }
  if (source.id === 'www-jetro-go-jp-j-messe-country-asia-jp-001') {
    return crawlSeededListSource(
      source,
      options,
      ['https://www.jetro.go.jp/j-messe/country/asia/jp/001/'],
      extractJetroJmesseSiteRuleEvents
    );
  }
  if (source.id === 'www-hbc-co-jp-event') {
    return crawlSeededListSource(
      source,
      options,
      ['https://www.hbc.co.jp/event/concert/index.html'],
      extractHbcConcertEvents
    );
  }
  if (source.id === 'www-sora-scc-jp') {
    return crawlSeededListSource(
      source,
      options,
      ['https://www.sora-scc.jp/event/'],
      extractSoraConventionEvents
    );
  }
  if (source.id === 'sapporocityjazz-jp') {
    return crawlSapporoCityJazzSource(source, options);
  }
  if (source.id === 'no-maps-jp-program') {
    return crawlNoMapsSource(source, options);
  }
  if (source.id === 'www-sapporo-sport-jp-tsudome-calendar') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://www.sapporo-sport.jp/tsudome/calendar/?ty=${y}&tm=${Number(m)}`;
      },
      extractTsudomeCalendarEvents
    );
  }
  if (source.id === 'www-fighters-co-jp-game-calendar') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => `https://www.fighters.co.jp/game/calendar/${monthYmd.slice(0, 7).replace('-', '')}/`,
      extractFightersHomeGameEvents
    );
  }
  if (source.id === 'www-axes-or-jp') {
    return crawlMonthlyListSource(
      source,
      options,
      (monthYmd) => {
        const [y, m] = monthYmd.slice(0, 7).split('-');
        return `https://www.axes.or.jp/event_calendar/index.php?input[year]=${y}&input[month]=${Number(m)}`;
      },
      extractAxesCalendarEvents
    );
  }
  if (source.id === 'homepage-kaderu27-or-jp-event-news-index-html') {
    return crawlSeededListSource(
      source,
      options,
      [
        'https://homepage.kaderu27.or.jp/event/index.html',
        'https://homepage.kaderu27.or.jp/event/exhibition.html',
        'https://homepage.kaderu27.or.jp/event/rooms.html',
        'https://homepage.kaderu27.or.jp/event/self/index.html'
      ],
      extractKaderuVenueEvents
    );
  }
  if (source.id === 'www-htb-co-jp-event') {
    return crawlHtbEventSource(source, options);
  }
  if (source.id === 'grand1934-com-meeting-banquet') {
    return crawlGrand1934EventSource(source, options);
  }
  if (source.id === 'www-keioplaza-sapporo-co-jp-banq-hall') {
    return crawlKeioPlazaEventSource(source, options);
  }
  const plan = buildCrawlPlan(source, mode, strategy);
  const listingLimit = Math.max(3, Math.min(10, Math.floor(plan.detailLimit * 0.8)));
  const windowTokens = buildWindowTokens(nowYmd, maxDate, 6);

  let root;
  try {
    root = await fetchText(source.url, 12000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }

  const rootTitle = extractTitle(root.html) || source.name;
  const events = [];
  const rootEvents = extractEventsFromPage({
    source,
    url: root.url,
    html: root.html,
    titleHint: rootTitle,
    nowYmd
  });
  for (const ev of rootEvents) events.push(ev);

  const rootLinks = extractLinks(root.html, root.url);
  const listingCandidates = uniqueBy(rootLinks, (x) => x.url)
    .map((x) => {
      let score = 0;
      if (x.url.startsWith(source.url)) score += 2;
      if (LISTING_URL_SIGNAL_RE.test(x.url)) score += 2;
      if (LISTING_URL_SIGNAL_RE.test(x.text)) score += 1;
      if (EVENT_TEXT_RE.test(x.text) || EVENT_TEXT_RE.test(x.url)) score += 2;
      if (hasWindowToken(`${x.url}\n${x.text}\n${x.context || ''}`, windowTokens)) score += 4;
      if (parseDatesFromText(String(x.context || ''), nowYmd).length) score += 2;
      if (hasDetailUrlSignal(x.url)) score -= 2;
      return { ...x, score };
    })
    .filter((x) => !BAD_TITLE_RE.test(x.text))
    .filter((x) => !BAD_URL_RE.test(x.url))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, listingLimit);

  const listingPages = [];
  if (listingCandidates.length) {
    const perSourceConcurrency = mode === 'full' ? 4 : 3;
    const fetched = await mapLimit(listingCandidates, perSourceConcurrency, async (link) => {
      try {
        const page = await fetchText(link.url, 9000);
        return { ...page, titleHint: link.text || extractTitle(page.html) || source.name };
      } catch (_) {
        return null;
      }
    });
    for (const row of fetched) {
      if (!row || row.error) continue;
      listingPages.push(row);
      const pageEvents = extractEventsFromPage({
        source,
        url: row.url,
        html: row.html,
        titleHint: row.titleHint,
        nowYmd
      });
      for (const ev of pageEvents) events.push(ev);
    }
  }

  const links = [
    ...rootLinks,
    ...listingPages.flatMap((page) => extractLinks(page.html, page.url))
  ];
  const detailCandidates = uniqueBy(links, (x) => x.url)
    .map((x) => {
      let score = 0;
      if (x.url.startsWith(source.url)) score += 2;
      if (EVENT_TEXT_RE.test(x.text)) score += 3;
      if (EVENT_TEXT_RE.test(x.url)) score += 2;
      if (/\d{1,2}[\/.月]\d{1,2}日?/.test(x.text) || /20\d{2}[\/.\-年]/.test(x.text)) score += 2;
      if (hasWindowToken(`${x.url}\n${x.text}\n${x.context || ''}`, windowTokens)) score += 3;
      if (parseDatesFromText(String(x.context || ''), nowYmd).length) score += 2;
      if (hasEventSignal(x.text, String(x.context || ''))) score += 1;
      if (hasDetailUrlSignal(x.url)) score += 3;
      return { ...x, score };
    })
    .filter((x) => !BAD_TITLE_RE.test(x.text))
    .filter((x) => !BAD_URL_RE.test(x.url))
    .filter((x) => x.score >= plan.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, plan.detailLimit);

  let detailResults = [];
  if (!plan.skipDetails && detailCandidates.length) {
    const perSourceConcurrency = mode === 'full' ? 4 : 3;
    detailResults = await mapLimit(detailCandidates, perSourceConcurrency, async (link) => {
      try {
        const page = await fetchText(link.url, 9000);
        const pageEvents = extractEventsFromPage({
          source,
          url: page.url,
          html: page.html,
          titleHint: link.text || extractTitle(page.html) || source.name,
          nowYmd
        });
        return pageEvents;
      } catch (_) {
        return [];
      }
    });
  }

  for (const row of detailResults) {
    if (!row || row.error) continue;
    if (Array.isArray(row)) {
      for (const ev of row) events.push(ev);
    }
  }

  return {
    sourceId: source.id,
    events: uniqueBy(events.filter(Boolean), (x) => x.id),
    error: ''
  };
}

function withinWindow(event, startYmd, endYmd) {
  if (!event || !event.start_date) return false;
  return event.start_date >= startYmd && event.start_date <= endYmd;
}

function sortEvents(a, b) {
  return (
    String(a.start_date || '').localeCompare(String(b.start_date || '')) ||
    String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')) ||
    (Number(b.quality_score || 0) - Number(a.quality_score || 0)) ||
    (Number(b.source_priority_score || 0) - Number(a.source_priority_score || 0)) ||
    String(a.title || '').localeCompare(String(b.title || ''), 'ja')
  );
}

function mergeEventCompleteness(primary, secondary) {
  const out = { ...primary };
  if (!out.flyer_image_url && secondary?.flyer_image_url) out.flyer_image_url = secondary.flyer_image_url;
  if ((!out.venue || isInvalidVenueCandidate(out.venue)) && secondary?.venue && !isInvalidVenueCandidate(secondary.venue)) out.venue = secondary.venue;
  if (!out.venue_address && secondary?.venue_address) out.venue_address = secondary.venue_address;
  if ((!out.open_time || out.open_time === '00:00') && secondary?.open_time && secondary.open_time !== '00:00') out.open_time = secondary.open_time;
  if ((!out.start_time || out.start_time === '00:00') && secondary?.start_time && secondary.start_time !== '00:00') out.start_time = secondary.start_time;
  if ((!out.end_time || out.end_time === '00:00') && secondary?.end_time && secondary.end_time !== '00:00') out.end_time = secondary.end_time;
  return out;
}

function canonicalEventKey(ev) {
  const t = normalizeTitleKey(ev?.title || '');
  const d = String(ev?.start_date || '');
  const v = normalizeTitleKey(ev?.venue || '');
  return `${d}|${t}|${v}`;
}

function isOnToday(ev, today) {
  const start = String(ev?.start_date || '');
  const end = String(ev?.end_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) return start <= today && today <= end;
  return start === today;
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode;
  const outputPath = args.outputPath || OUTPUT_PATH;

  const sourceDoc = await loadJson(SOURCE_PATH, { sources: [] });
  const strategyDoc = await loadJson(STRATEGY_PATH, { strategies: {} });
  const strategyMap = (strategyDoc && typeof strategyDoc === 'object' && strategyDoc.strategies && typeof strategyDoc.strategies === 'object')
    ? strategyDoc.strategies
    : {};
  const allSources = Array.isArray(sourceDoc.sources) ? sourceDoc.sources : [];
  const enabledSources = allSources
    .filter((s) => s && s.enabled !== false && s.url)
    .filter((s) => args.sourceIds.length === 0 || args.sourceIds.includes(String(s.id || '')));

  const crawlTargets = enabledSources
    .map((s) => ({ ...s, crawl_strategy: resolveSourceStrategy(s, strategyMap) }))
    .sort((a, b) => (PRIORITY_SCORE[b.priority] || 0) - (PRIORITY_SCORE[a.priority] || 0));

  const today = args.today || ymdInJst();
  const minDate = addDays(today, -2);
  const maxDate = addDays(today, 365);

  const results = await mapLimit(crawlTargets, 5, (source) => crawlSource(source, {
    mode,
    nowYmd: today,
    maxDate,
    strategy: source.crawl_strategy
  }));

  const nextEvents = [];
  let errorCount = 0;
  const failedSourceIds = new Set();
  for (const result of results) {
    if (!result || result.error) {
      errorCount += 1;
      if (result && result.sourceId) failedSourceIds.add(String(result.sourceId));
      continue;
    }
    for (const ev of result.events || []) {
      if (!withinWindow(ev, minDate, maxDate)) continue;
      nextEvents.push(ev);
    }
  }

  const mergedById = new Map();
  for (const ev of nextEvents) mergedById.set(ev.id, withQuality(ev));

  if (mode !== 'full') {
    const previous = await loadJson(outputPath, { events: [] });
    const previousEvents = Array.isArray(previous.events) ? previous.events : [];
    const keepUntil = addDays(today, 120);
    for (const ev of previousEvents) {
      if (!ev || !ev.id || mergedById.has(ev.id)) continue;
      if (!withinWindow(ev, minDate, keepUntil)) continue;
      mergedById.set(ev.id, withQuality(ev));
    }
  }
  if (mode === 'full' && failedSourceIds.size > 0) {
    const previous = await loadJson(outputPath, { events: [] });
    const previousEvents = Array.isArray(previous.events) ? previous.events : [];
    const keepUntil = addDays(today, 90);
    for (const ev of previousEvents) {
      const sid = String(ev?.source_id || '');
      if (!sid || !failedSourceIds.has(sid)) continue;
      if (!ev || !ev.id || mergedById.has(ev.id)) continue;
      if (!withinWindow(ev, minDate, keepUntil)) continue;
      mergedById.set(ev.id, withQuality(ev));
    }
  }

  const merged = Array.from(mergedById.values());
  const bestByCanonical = new Map();
  for (const ev of merged) {
    const key = canonicalEventKey(ev);
    if (!key) continue;
    const prev = bestByCanonical.get(key);
    if (!prev) {
      bestByCanonical.set(key, ev);
      continue;
    }
    const prevScore = Number(prev.quality_score || 0);
    const nextScore = Number(ev.quality_score || 0);
    if (nextScore > prevScore) {
      bestByCanonical.set(key, mergeEventCompleteness(ev, prev));
      continue;
    }
    if (nextScore === prevScore && Number(ev.source_priority_score || 0) > Number(prev.source_priority_score || 0)) {
      bestByCanonical.set(key, mergeEventCompleteness(ev, prev));
      continue;
    }
    bestByCanonical.set(key, mergeEventCompleteness(prev, ev));
  }

  const mergedCanonical = Array.from(bestByCanonical.values())
    .filter((ev) => withinWindow(ev, minDate, maxDate))
    .filter((ev) => isPublishable(ev))
    .filter((ev) => {
      const source = crawlTargets.find((row) => row.id === ev.source_id) || null;
      return isSapporoAreaEvent(ev, source);
    })
    .sort(sortEvents);

  const bestByUrlDate = new Map();
  for (const ev of mergedCanonical) {
    const url = normalizeUrlForCompare(ev.detail_url || '');
    const key = `${String(ev.start_date || '')}|${url}`;
    const prev = bestByUrlDate.get(key);
    if (!prev) {
      bestByUrlDate.set(key, ev);
      continue;
    }
    const prevScore = Number(prev.quality_score || 0);
    const nextScore = Number(ev.quality_score || 0);
    if (nextScore > prevScore) {
      bestByUrlDate.set(key, mergeEventCompleteness(ev, prev));
      continue;
    }
    if (nextScore === prevScore && Number(ev.source_priority_score || 0) > Number(prev.source_priority_score || 0)) {
      bestByUrlDate.set(key, mergeEventCompleteness(ev, prev));
      continue;
    }
    bestByUrlDate.set(key, mergeEventCompleteness(prev, ev));
  }

  const mergedPublic = Array.from(bestByUrlDate.values()).sort(sortEvents).slice(0, 900);

  const todayCount = mergedPublic.filter((ev) => isOnToday(ev, today)).length;
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    timezone: TIMEZONE,
    mode,
    source_total: enabledSources.length,
    source_crawled: crawlTargets.length,
    crawl_error_sources: errorCount,
    event_total: mergedPublic.length,
    event_today: todayCount,
    quality_threshold: MIN_QUALITY_SCORE,
    quality_threshold_heuristic: MIN_QUALITY_SCORE_HEURISTIC,
    events: mergedPublic
  };

  await writeJson(outputPath, payload);

  console.log(`[events] mode=${mode} sources=${crawlTargets.length}/${enabledSources.length} errors=${errorCount} events=${mergedPublic.length} today=${todayCount}`);
}

export {
  crawlSource,
  extractArtparkDetailEvent,
  extractArtparkListingEvents,
  eventFromWessPost,
  extractAxesCalendarEvents,
  extractCaretexSiteRuleEvent,
  extractChieriaHallScheduleEvents,
  extractFightersHomeGameEvents,
  extractGrand1934EventDetailEvent,
  extractHbcConcertEvents,
  extractHtbEventDetailEvents,
  extractJetroJmesseSiteRuleEvents,
  extractKaderuVenueEvents,
  extractKeioPlazaEventDetailEvent,
  extractKyobunScheduleEvents,
  extractLilacfesDetailEvents,
  extractNoMapsNearlyEvent,
  extractMoleFeedEvents,
  extractSapporoCityJazzNewsEvents,
  extractSapporoFactoryMonthlyEvents,
  extractSnowfesSiteRuleEvent,
  extractSapporoShiminhallScheduleEvents,
  extractSoraConventionEvents,
  extractSummerfesDetailEvents,
  extractTicketPiaLocalSiteRuleEvents,
  extractTsudomeCalendarEvents,
  extractWhiteIlluminationDetailEvents,
  extractYosakoiSiteRuleEvent,
  isPublishable,
  parseArgs,
  resolveSourceStrategy
};

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch (_) {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((error) => {
    console.error('[events] failed:', error);
    process.exitCode = 1;
  });
}
