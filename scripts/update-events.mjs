#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TIMEZONE = 'Asia/Tokyo';
const SOURCE_PATH = path.resolve(process.cwd(), 'config/event-sources.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'data/events.json');

const PRIORITY_SCORE = { S: 4, A: 3, B: 2, C: 1 };
const EVENT_TEXT_RE = /(event|events|schedule|festival|concert|live|seminar|exhibition|show|meetup|fair|開催|公演|展示|ライブ|フェス|祭|イベント|セミナー)/i;

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

function parseTimeRangeFromText(text) {
  const range = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)\s*[〜~\-－–]\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (range) {
    return {
      start: `${String(range[1]).padStart(2, '0')}:${range[2]}`,
      end: `${String(range[3]).padStart(2, '0')}:${range[4]}`,
      allDay: false
    };
  }
  const single = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (single) {
    return { start: `${String(single[1]).padStart(2, '0')}:${single[2]}`, end: '', allDay: false };
  }
  return { start: '', end: '', allDay: true };
}

function pickVenue(text) {
  const m = text.match(/(?:会場|場所|venue)\s*[：:]\s*([^\n]{2,80})/i);
  if (!m || !m[1]) return '';
  return textPreview(m[1], 80);
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

function buildEvent({ source, detailUrl, title, bodyText, html, nowYmd }) {
  const dates = parseDatesFromText(bodyText, nowYmd);
  if (!dates.length) return null;

  const startDate = dates[0].ymd;
  let endDate = '';
  if (dates.length >= 2) {
    const gap = Math.abs(dates[1].idx - dates[0].idx);
    if (gap < 25) endDate = dates[1].ymd;
  }

  const time = parseTimeRangeFromText(bodyText);
  const summary = textPreview(pickMeta(html, 'description') || pickMeta(html, 'og:description') || bodyText, 220);

  const eventTitle = normalizeTitle(title) || title || source.name;
  const seed = `${detailUrl}|${startDate}|${eventTitle}`;
  return {
    id: makeEventId(seed),
    title: textPreview(eventTitle, 120),
    start_date: startDate,
    end_date: endDate,
    start_time: time.start,
    end_time: time.end,
    all_day: !!time.allDay,
    venue: pickVenue(bodyText),
    summary,
    flyer_image_url: pickImage(html, detailUrl),
    detail_url: detailUrl,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    source_category: source.category || '',
    source_priority: source.priority || 'B',
    source_priority_score: PRIORITY_SCORE[source.priority] || 0,
    updated_at: new Date().toISOString()
  };
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
  const detailLimit = mode === 'full' ? 2 : 1;

  let root;
  try {
    root = await fetchText(source.url, 12000);
  } catch (error) {
    return { sourceId: source.id, events: [], error: String(error?.message || error) };
  }

  const rootTitle = extractTitle(root.html) || source.name;
  const rootText = stripTags(root.html);
  const events = [];

  const rootEvent = buildEvent({
    source,
    detailUrl: root.url,
    title: rootTitle,
    bodyText: rootText,
    html: root.html,
    nowYmd
  });
  if (rootEvent) events.push(rootEvent);

  const links = extractLinks(root.html, root.url);
  const detailCandidates = uniqueBy(links, (x) => x.url)
    .map((x) => {
      let score = 0;
      if (x.url.startsWith(source.url)) score += 2;
      if (EVENT_TEXT_RE.test(x.text)) score += 3;
      if (EVENT_TEXT_RE.test(x.url)) score += 2;
      if (/\d{1,2}[\/.月]\d{1,2}日?/.test(x.text) || /20\d{2}[\/.\-年]/.test(x.text)) score += 2;
      return { ...x, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, detailLimit);

  const detailResults = await mapLimit(detailCandidates, 2, async (link) => {
    try {
      const page = await fetchText(link.url, 9000);
      const bodyText = stripTags(page.html);
      const event = buildEvent({
        source,
        detailUrl: page.url,
        title: link.text || extractTitle(page.html) || source.name,
        bodyText,
        html: page.html,
        nowYmd
      });
      return event;
    } catch (_) {
      return null;
    }
  });

  for (const row of detailResults) {
    if (row && !row.error) events.push(row);
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
    (Number(b.source_priority_score || 0) - Number(a.source_priority_score || 0)) ||
    String(a.title || '').localeCompare(String(b.title || ''), 'ja')
  );
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
  for (const result of results) {
    if (!result || result.error) {
      errorCount += 1;
      continue;
    }
    for (const ev of result.events || []) {
      if (!withinWindow(ev, minDate, maxDate)) continue;
      nextEvents.push(ev);
    }
  }

  const previous = await loadJson(OUTPUT_PATH, { events: [] });
  const previousEvents = Array.isArray(previous.events) ? previous.events : [];

  const mergedById = new Map();
  for (const ev of nextEvents) mergedById.set(ev.id, ev);

  const keepUntil = addDays(today, 120);
  for (const ev of previousEvents) {
    if (!ev || !ev.id || mergedById.has(ev.id)) continue;
    if (!withinWindow(ev, minDate, keepUntil)) continue;
    mergedById.set(ev.id, ev);
  }

  const merged = Array.from(mergedById.values()).sort(sortEvents).slice(0, 900);

  const todayCount = merged.filter((ev) => ev.start_date === today).length;
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    timezone: TIMEZONE,
    mode,
    source_total: enabledSources.length,
    source_crawled: crawlTargets.length,
    crawl_error_sources: errorCount,
    event_total: merged.length,
    event_today: todayCount,
    events: merged
  };

  await writeJson(OUTPUT_PATH, payload);

  console.log(`[events] mode=${mode} sources=${crawlTargets.length}/${enabledSources.length} errors=${errorCount} events=${merged.length} today=${todayCount}`);
}

main().catch((error) => {
  console.error('[events] failed:', error);
  process.exitCode = 1;
});
