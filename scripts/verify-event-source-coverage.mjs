#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SOURCE_PATH = path.resolve(ROOT, 'config/event-sources.json');
const STRATEGY_PATH = path.resolve(ROOT, 'config/event-source-strategies.json');
const OUTPUT_PATH = path.resolve(ROOT, 'data/event-source-verification.json');

function ymdInJst(input = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
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
  const [y, m, d] = String(ymd || '').split('-').map((n) => Number(n));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const today = ymdInJst();
  const out = {
    dates: [today]
  };
  for (const arg of argv) {
    if (arg.startsWith('--dates=')) {
      const dates = arg
        .slice('--dates='.length)
        .split(',')
        .map((x) => String(x || '').trim())
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
      if (dates.length) out.dates = dates;
    }
  }
  return out;
}

function withinWindow(event, startYmd, endYmd) {
  const start = String(event?.start_date || '');
  const end = String(event?.end_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return start <= endYmd && end >= startYmd;
  }
  return start >= startYmd && start <= endYmd;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));
  return results;
}

const mod = await import(pathToFileURL(path.resolve(ROOT, 'scripts/update-events.mjs')).href);
const args = parseArgs(process.argv.slice(2));
const sourceDoc = JSON.parse(await fs.readFile(SOURCE_PATH, 'utf8'));
const strategyDoc = JSON.parse(await fs.readFile(STRATEGY_PATH, 'utf8'));
const strategyMap = strategyDoc?.strategies || {};
const enabledSources = (sourceDoc?.sources || [])
  .filter((s) => s && s.enabled !== false && s.url)
  .map((s) => ({ ...s, crawl_strategy: mod.resolveSourceStrategy(s, strategyMap) }));

const report = {
  generated_at: new Date().toISOString(),
  test_dates: args.dates,
  source_total: enabledSources.length,
  sources: []
};

report.sources = await mapLimit(enabledSources, 4, async (source) => {
  const snapshots = [];
  for (const testDate of args.dates) {
    const maxDate = addDays(testDate, 365);
    let events = [];
    let error = '';
    try {
      const result = await mod.crawlSource(source, {
        mode: 'full',
        nowYmd: testDate,
        maxDate,
        strategy: source.crawl_strategy
      });
      error = String(result?.error || '');
      events = Array.isArray(result?.events) ? result.events : [];
    } catch (err) {
      error = String(err?.message || err);
    }

    const publishable = events
      .filter((ev) => withinWindow(ev, testDate, maxDate))
      .filter((ev) => mod.isPublishable(ev))
      .filter((ev) => mod.isSapporoAreaEvent(ev, source));

    snapshots.push({
      date: testDate,
      error,
      event_count: publishable.length,
      sample_titles: publishable.slice(0, 5).map((ev) => ev.title)
    });
  }

  const bestCount = snapshots.reduce((max, row) => Math.max(max, row.event_count), 0);
  const hasError = snapshots.some((row) => row.error);
  const hasSuccessfulSnapshot = snapshots.some((row) => !row.error);
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    strategy: source.crawl_strategy,
    status: hasError ? 'error' : bestCount > 0 ? 'ok' : hasSuccessfulSnapshot ? 'no_future_events' : 'error',
    best_event_count: bestCount,
    snapshots
  };
});

report.ok_sources = report.sources.filter((row) => row.status === 'ok').length;
report.no_future_event_sources = report.sources.filter((row) => row.status === 'no_future_events').length;
report.zero_event_sources = report.no_future_event_sources;
report.error_sources = report.sources.filter((row) => row.status === 'error').length;

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`[verify] sources=${report.source_total} ok=${report.ok_sources} no_future=${report.no_future_event_sources} errors=${report.error_sources}`);
