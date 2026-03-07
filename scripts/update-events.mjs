#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TIMEZONE = 'Asia/Tokyo';
const SOURCE_PATH = path.resolve(process.cwd(), 'config/event-sources.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'data/events.json');

const PRIORITY_SCORE = { S: 4, A: 3, B: 2, C: 1 };
const EVENT_TEXT_RE = /(event|events|schedule|festival|concert|live|seminar|exhibition|show|meetup|fair|開催|公演|展示|ライブ|フェス|祭|イベント|セミナー)/i;
const BAD_TITLE_RE = /(宴会場|会議室|客室|宿泊|ご案内|施設案内|貸し会議室|トップページ|無料で使える|他のイベントを見る|今週末のおすすめイベント|公演・チケット情報|イベント一覧|大宴会場案内|^明日\(\)開催$|一覧表示|リスト表示|公演一覧|イベントスケジュール|主催公演|公演情報|イベント情報|近日開催イベント|歴史と開催結果|期間中の様々なイベント|託児サービス対象公演|ビジネスセミナー|セミナー情報|チケット詳細はこちら|NEW\s*キャンペーン|キャンペーン)/i;
const WEAK_TITLE_RE = /^(イベント|イベント情報|event|events|schedule)(\s*[|｜:].*)?$/i;
const BAD_URL_RE = /\/banq\/|\/banquet\/|\/stay\/|\/guestroom\//i;
const DETAIL_URL_SIGNAL_RE = /(event[_-]?detail|\/detail\/|eventid=|eventcd=|eventbundlecd=|[?&](id|num|no|eid)=|\/seminar\/\d+|\/\d{4}\/\d{1,2}\/\d{1,2}\/)/i;
const JSONLD_SCRIPT_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const MIN_QUALITY_SCORE = 0.56;
const MIN_QUALITY_SCORE_HEURISTIC = 0.66;

function parseArgs(argv) {
  const out = { mode: 'delta' };
  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const v = arg.slice('--mode='.length).trim();
      if (v === 'delta' || v === 'full') out.mode = v;
    }
  }
  return out;
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
    links.push({ url, text });
    if (links.length > 1200) break;
  }
  return links;
}

function parseDatesFromText(text, nowYmd) {
  const out = [];
  const nowYear = Number(String(nowYmd).slice(0, 4)) || new Date().getFullYear();

  const fullRe = /(20\d{2})\s*[\/.\-年]\s*(1[0-2]|0?[1-9])\s*[\/.\-月]\s*(3[01]|[12]?\d)\s*日?/g;
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
    const mdRe = /(1[0-2]|0?[1-9])\s*[\/.月]\s*(3[01]|[12]?\d)\s*日?/g;
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
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):?(\d{2})?)?/);
  if (!m) return { date: '', time: '' };
  const date = m[1] || '';
  const hh = m[2] || '';
  const mm = m[3] || '00';
  return { date, time: hh ? `${hh}:${mm}` : '' };
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
  const label = labels.join('|');
  const beforeMinute = text.match(new RegExp(`([01]?\\d|2[0-3])[:：]([0-5]\\d)\\s*(?:${label})`, 'i'));
  const beforeHour = text.match(new RegExp(`([01]?\\d|2[0-3])時\\s*(?:${label})`, 'i'));
  const afterMinute = text.match(new RegExp(`(?:${label})\\s*[:：]?\\s*([01]?\\d|2[0-3])[:：]([0-5]\\d)`, 'i'));
  const afterHour = text.match(new RegExp(`(?:${label})\\s*[:：]?\\s*([01]?\\d|2[0-3])時`, 'i'));

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
  const open = parseTimeTagged(text, ['開場', 'door\\s*open'], true);
  const start = parseTimeTagged(text, ['開演', '開始', 'start\\s*time'], true);
  const end = parseTimeTagged(text, ['終演', '終了', 'end\\s*time'], true);

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
  const m = text.match(/(?:会場|場所|venue)\s*[：:]\s*([^\n]{2,80})/i);
  if (!m || !m[1]) return '';
  return textPreview(m[1], 80);
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
  if (method !== 'jsonld' && !hasDetailUrlSignal(ev.detail_url || '')) return false;
  if (method !== 'jsonld' && !(EVENT_TEXT_RE.test(title) || /(ライブ|コンサート|公演|展示|フェス|祭|イベント)/.test(title))) return false;
  const score = Number(ev.quality_score || 0);
  if (method === 'jsonld') return score >= MIN_QUALITY_SCORE;
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
  const time = parseEventTimes(timeContext);
  const summary = textPreview(pickMeta(html, 'description') || pickMeta(html, 'og:description') || bodyText, 220);

  const eventTitle = normalizeTitle(title) || title || source.name;
  if (!eventTitle || eventTitle.length < 4) return null;
  if (BAD_TITLE_RE.test(eventTitle)) return null;
  if (WEAK_TITLE_RE.test(eventTitle)) return null;
  if (!hasEventSignal(eventTitle, dateContext)) return null;
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
  const startTime = (start.time === '00:00' && !end.time) ? '' : start.time;

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
    end_time: end.time || '',
    all_day: !start.time,
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
  const jsonLdEvents = extractJsonLdEvents({ html, source, detailUrl: url });
  for (const ev of jsonLdEvents) events.push(ev);

  const bodyText = stripTags(html);
  const heuristicEvent = buildEvent({
    source,
    detailUrl: url,
    title: titleHint || extractTitle(html) || source.name,
    bodyText,
    html,
    nowYmd
  });
  if (heuristicEvent) events.push(heuristicEvent);

  return uniqueBy(events, (ev) => ev.id).map(withQuality);
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

async function crawlSource(source, options) {
  const { mode, nowYmd } = options;
  const priority = String(source.priority || 'B').toUpperCase();
  let detailLimit = 3;
  if (priority === 'S') detailLimit = mode === 'full' ? 14 : 10;
  else if (priority === 'A') detailLimit = mode === 'full' ? 10 : 7;
  else if (priority === 'B') detailLimit = mode === 'full' ? 6 : 4;
  else detailLimit = mode === 'full' ? 4 : 3;

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

  const links = extractLinks(root.html, root.url);
  const detailCandidates = uniqueBy(links, (x) => x.url)
    .map((x) => {
      let score = 0;
      if (x.url.startsWith(source.url)) score += 2;
      if (EVENT_TEXT_RE.test(x.text)) score += 3;
      if (EVENT_TEXT_RE.test(x.url)) score += 2;
      if (/\d{1,2}[\/.月]\d{1,2}日?/.test(x.text) || /20\d{2}[\/.\-年]/.test(x.text)) score += 2;
      if (hasDetailUrlSignal(x.url)) score += 3;
      return { ...x, score };
    })
    .filter((x) => !BAD_TITLE_RE.test(x.text))
    .filter((x) => !BAD_URL_RE.test(x.url))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, detailLimit);

  const perSourceConcurrency = mode === 'full' ? 4 : 3;
  const detailResults = await mapLimit(detailCandidates, perSourceConcurrency, async (link) => {
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

  const sourceDoc = await loadJson(SOURCE_PATH, { sources: [] });
  const allSources = Array.isArray(sourceDoc.sources) ? sourceDoc.sources : [];
  const enabledSources = allSources.filter((s) => s && s.enabled !== false && s.url);

  const crawlTargets = enabledSources
    .filter((s) => {
      if (mode === 'full') return true;
      const score = PRIORITY_SCORE[s.priority] || 0;
      return score >= PRIORITY_SCORE.A;
    })
    .sort((a, b) => (PRIORITY_SCORE[b.priority] || 0) - (PRIORITY_SCORE[a.priority] || 0));

  const today = ymdInJst();
  const minDate = addDays(today, -2);
  const maxDate = addDays(today, 365);

  const results = await mapLimit(crawlTargets, 5, (source) => crawlSource(source, { mode, nowYmd: today }));

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
    const previous = await loadJson(OUTPUT_PATH, { events: [] });
    const previousEvents = Array.isArray(previous.events) ? previous.events : [];
    const keepUntil = addDays(today, 120);
    for (const ev of previousEvents) {
      if (!ev || !ev.id || mergedById.has(ev.id)) continue;
      if (!withinWindow(ev, minDate, keepUntil)) continue;
      mergedById.set(ev.id, withQuality(ev));
    }
  }
  if (mode === 'full' && failedSourceIds.size > 0) {
    const previous = await loadJson(OUTPUT_PATH, { events: [] });
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
      bestByCanonical.set(key, ev);
      continue;
    }
    if (nextScore === prevScore && Number(ev.source_priority_score || 0) > Number(prev.source_priority_score || 0)) {
      bestByCanonical.set(key, ev);
    }
  }

  const mergedCanonical = Array.from(bestByCanonical.values())
    .filter((ev) => withinWindow(ev, minDate, maxDate))
    .filter((ev) => isPublishable(ev))
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
      bestByUrlDate.set(key, ev);
      continue;
    }
    if (nextScore === prevScore && Number(ev.source_priority_score || 0) > Number(prev.source_priority_score || 0)) {
      bestByUrlDate.set(key, ev);
    }
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

  await writeJson(OUTPUT_PATH, payload);

  console.log(`[events] mode=${mode} sources=${crawlTargets.length}/${enabledSources.length} errors=${errorCount} events=${mergedPublic.length} today=${todayCount}`);
}

main().catch((error) => {
  console.error('[events] failed:', error);
  process.exitCode = 1;
});
