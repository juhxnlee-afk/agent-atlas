import { DAY, time, itemsOf, safeURL, kstDate, matching } from './logic.mjs?v=20261003-design';

export const NEWS_START = '2026-10-03';
export function calendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time(value)) && new Date(value).toISOString().slice(0,10) === value;
}
const text = value => typeof value === 'string' && value.trim().length > 0;
const stamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(time(value));
const sourcesValid = values => values === undefined || Array.isArray(values) && values.every(source => source && safeURL(source.url) && text(source.source || source.label));

export function newsItemValid(item, issue) {
  if (!item || !text(item.id) || !text(item.title) || !text(item.source) || !text(item.summary) || !safeURL(item.url)) return false;
  if (!calendarDate(item.published_date) || !['timestamp','date'].includes(item.published_precision) || !text(item.date_basis)) return false;
  if (item.topics !== undefined && (!Array.isArray(item.topics) || !item.topics.every(text))) return false;
  if (!sourcesValid(item.supporting_sources)) return false;
  if (item.region !== undefined && !['domestic','international'].includes(item.region)) return false;
  if (item.published_precision === 'timestamp') {
    if (!stamp(item.published_at) || time(item.published_at) > time(issue.collected_at)) return false;
    if (item.published_date_kst && item.published_date_kst !== kstDate(item.published_at)) return false;
  } else {
    // A source date without a time must never be silently converted to midnight UTC/KST.
    if (item.published_at !== null && item.published_at !== undefined) return false;
    if (item.published_date_kst && (!calendarDate(item.published_date_kst) || item.published_timezone !== 'Asia/Seoul' || item.published_date_kst !== item.published_date)) return false;
    if (!text(item.published_timezone)) return false;
  }
  return true;
}

export function normalizeNews(payload) {
  const rows = itemsOf(payload), seen = new Set();
  const started = payload?.started_on || NEWS_START;
  if (!calendarDate(started) || started < NEWS_START) throw new Error('뉴스 기록 시작일이 올바르지 않습니다');
  const valid = rows.filter(issue => {
    if (!issue || !calendarDate(issue.date) || issue.date < started || !stamp(issue.collected_at) || !['partial','final'].includes(issue.status) || !text(issue.headline) || !text(issue.summary) || !Array.isArray(issue.items) || !sourcesValid(issue.sources)) return false;
    if (issue.date > kstDate(issue.collected_at)) return false;
    if (issue.status === 'final' && time(issue.collected_at) < time(`${issue.date}T00:00:00+09:00`) + DAY) return false;
    if (!issue.items.every(item => newsItemValid(item, issue))) return false;
    const ids = new Set(), urls = new Set();
    return issue.items.every(item => {
      if (ids.has(item.id) || urls.has(safeURL(item.url))) return false;
      ids.add(item.id); urls.add(safeURL(item.url)); return true;
    });
  });
  const unique = valid.filter(issue => { if (seen.has(issue.date)) return false; seen.add(issue.date); return true; });
  return { items: unique.sort((a,b) => b.date.localeCompare(a.date)), rejected: rows.length-valid.length, duplicates: valid.length-unique.length };
}

export function filterNews(issues, { query = '', sort = 'date-desc', region = 'all', now = Date.now() } = {}) {
  return issues.filter(issue => issue.date <= kstDate(now) && time(issue.collected_at) <= now).map(issue => {
    const issueMatch = matching({ title: issue.headline, summary: `${issue.date} ${issue.summary}` }, query);
    const items = issue.items.filter(item => (region === 'all' || item.region === region) && (issueMatch || matching({ ...item, description: [item.source, item.significance, ...(item.topics || []), item.published_date].filter(Boolean).join(' ') }, query)));
    return { ...issue, items, total_items: issue.items.length, matches: items.length > 0 || region === 'all' && issueMatch && issue.items.length === 0 };
  }).filter(issue => issue.matches).sort((a,b) => (sort === 'date-asc' ? 1 : -1) * a.date.localeCompare(b.date));
}

export function mergeNews(previous, incoming) {
  const old = normalizeNews(previous), next = normalizeNews(incoming);
  if (old.rejected || next.rejected || old.duplicates || next.duplicates) throw new Error('Invalid or duplicate news issues; no data was changed.');
  const byDate = new Map(old.items.map(issue => [issue.date, issue]));
  for (const issue of next.items) {
    const existing = byDate.get(issue.date);
    if (existing) {
      if (time(issue.collected_at) < time(existing.collected_at)) throw new Error(`Older news collection for ${issue.date}; refusing to replace newer data.`);
      if (existing.status === 'final' && issue.status !== 'final') throw new Error(`Final news issue ${issue.date} cannot become partial.`);
      const items = new Map(existing.items.map(item => [item.id, item]));
      for (const item of issue.items) {
        if (items.has(item.id) && items.get(item.id).url !== item.url) throw new Error(`News ID ${item.id} changed its source URL.`);
        items.set(item.id, item);
      }
      byDate.set(issue.date, { ...existing, ...issue, items: [...items.values()] });
    } else byDate.set(issue.date, issue);
  }
  const issues = [...byDate.values()].sort((a,b) => b.date.localeCompare(a.date));
  const result = { ...previous, ...incoming, schema_version:1, timezone:'Asia/Seoul', started_on:NEWS_START, collected_at:issues.map(issue => issue.collected_at).sort((a,b)=>time(b)-time(a))[0] || incoming.collected_at, items:issues };
  const checked = normalizeNews(result);
  if (checked.rejected || checked.duplicates) throw new Error('Merged news validation failed; no data was changed.');
  return result;
}
