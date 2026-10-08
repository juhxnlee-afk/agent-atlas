export const DAY = 86_400_000;
export const HISTORY_START = Date.parse('2026-01-01T00:00:00+09:00');
// Timeline dates follow their primary source, independently of repository History.
export const TIMELINE_START = '2025-01-01';
export const time = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
export const safeURL = value => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; }
  catch { return ''; }
};
export function itemsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  throw new Error('데이터 형식이 올바르지 않습니다 (배열 또는 items 배열 필요)');
}
export function uniqueRepos(items) {
  const byKey = new Map();
  for (const repo of items) {
    const key = String(repo.id || repo.name || '').toLowerCase();
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous || time(repo.collected_at || repo.observed_at) > time(previous.collected_at || previous.observed_at)) byKey.set(key, repo);
  }
  // GitHub IDs remain stable across renames; case-insensitive names catch duplicate rows lacking IDs.
  const names = new Set();
  return [...byKey.values()].filter(repo => {
    const name = String(repo.name).toLowerCase();
    if (names.has(name)) return false;
    names.add(name); return true;
  });
}
export function normalizeRepos(payload) {
  const rows = itemsOf(payload);
  const valid = rows.filter(r => r && typeof r.name === 'string' && r.name.includes('/') && Number.isFinite(time(r.created_at)) && safeURL(r.url));
  return { items: uniqueRepos(valid.map(r => ({ ...r, stars: Number.isFinite(Number(r.stars)) ? Math.max(0, Number(r.stars)) : 0 }))), rejected: rows.length - valid.length };
}
export function normalizePapers(payload) {
  const rows = itemsOf(payload); const seen = new Set();
  const valid = rows.filter(p => p && typeof p.title === 'string' && Number.isFinite(time(p.date)) && safeURL(p.url));
  return { items: valid.filter(p => { const key = p.id || p.url; if (seen.has(key)) return false; seen.add(key); return true; }), rejected: rows.length - valid.length };
}
export function normalizeTimeline(payload) {
  const rows = itemsOf(payload);
  const valid = rows.filter(m => m && typeof m.title === 'string' && m.title.trim() && typeof m.summary === 'string' && m.summary.trim() && validTimelineDate(m) && safeURL(m.source_url));
  return { items: valid.sort((a,b) => time(a.date) - time(b.date)), rejected: rows.length - valid.length };
}
function validTimelineDate(item) {
  const precision = item.date_precision || 'date';
  if (precision === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(item.date);
  if (precision === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(time(item.date)) && new Date(item.date).toISOString().slice(0,10) === item.date;
  if (precision === 'timestamp') return /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(item.date) && Number.isFinite(time(item.date));
  return false;
}
export function filterTimeline(items, {now=Date.now()}={}) {
  return items.filter(item => time(item.date) >= time(TIMELINE_START) && time(item.date) <= now).sort((a,b) => time(a.date) - time(b.date));
}
export function timelineDateLabel(item) {
  if (item.date_precision === 'month') return `${String(item.date).slice(0,4)}년 ${Number(String(item.date).slice(5,7))}월`;
  return String(item.date).slice(0,10).replaceAll('-','.');
}
export function timelineDateTypeLabel(item) {
  const labels={product_release:'제품 출시',product_announcement:'공식 발표',public_beta_release:'공개 베타',public_preview_release:'공개 프리뷰',research_preview:'리서치 프리뷰',protocol_release:'프로토콜 공개',official_announcement:'공식 발표',official_research_post:'공식 연구 발표',official_engineering_post:'공식 기술 발표',arxiv_first_submission:'논문 최초 제출',repository_creation:'저장소 생성',repository_first_commit:'최초 공개 코드',project_origin:'프로젝트 시작',project_launch:'프로젝트 공개',project_announcement:'프로젝트 발표',project_rename:'이름 변경 발표',open_source_release:'오픈소스 공개',foundation_announcement:'재단 출범',private_preview_release:'제한 프리뷰',platform_announcement:'플랫폼 발표'};
  return labels[item.date_type] || '원문 기준';
}
export function matching(item, query) {
  const fields = [item.name, item.owner, item.title, item.description_ko, item.description, item.description_original, item.summary, item.category, item.language];
  const text = fields.filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
  return String(query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(term => text.includes(term));
}
export function filterRepos(items, { tab = 'main', query = '', minStars = 0, sort = 'stars-desc', now = Date.now(), asOf = now, legacy = false } = {}) {
  const upper = Math.min(Number(now), Number(asOf));
  const minimum = Math.max(0, Number(minStars) || 0);
  const result = uniqueRepos(items).filter(repo => {
    const created = time(repo.created_at);
    const inRange = tab === 'main' ? created >= now - 7 * DAY && created <= now : legacy ? created < HISTORY_START && created <= upper : created >= HISTORY_START && created <= upper;
    return inRange && Number(repo.stars || 0) >= minimum && matching(repo, query);
  });
  return sortItems(result, sort, 'created_at');
}
export function filterPapers(items, {query = '', sort = 'date-desc', now = Date.now()} = {}) {
  return sortItems(items.filter(item => time(item.date) <= now && matching(item, query)), sort, 'date');
}
export function sortItems(items, sort, dateKey) {
  return [...items].sort((a,b) => {
    const dateDiff = time(b[dateKey]) - time(a[dateKey]);
    let result = sort === 'stars-desc' ? Number(b.stars || 0) - Number(a.stars || 0) : sort === 'stars-asc' ? Number(a.stars || 0) - Number(b.stars || 0) : sort === 'date-asc' ? -dateDiff : dateDiff;
    return result || dateDiff || String(a.name || a.title).localeCompare(String(b.name || b.title));
  });
}
export function kstDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '날짜 미확인';
  return new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
export function kstStamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '수집 시각 미확인';
  return `${kstDate(value)} ${new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', hour12:false }).format(date)} KST`;
}
export function latestCollected(payloads, rows = []) {
  const candidates = [...payloads.map(p => p?.collected_at), ...rows.map(r => r.collected_at || r.observed_at)].filter(v => Number.isFinite(time(v)));
  return candidates.sort((a,b) => time(b)-time(a))[0] || null;
}
export function snapshotPath(value) {
  return typeof value === 'string' && /^data\/snapshots\/[\w.-]+\.json$/.test(value) ? value : '';
}
