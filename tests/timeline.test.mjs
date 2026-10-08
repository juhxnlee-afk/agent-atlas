import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HISTORY_START,TIMELINE_START,normalizeTimeline,filterTimeline,timelineDateLabel,timelineDateTypeLabel} from '../assets/logic.mjs';
const milestone={title:'주요 이정표',summary:'에이전트 AI의 주요 변화',source_url:'https://example.com/official',date_type:'product_release'};
const row=(date,extra={})=>({...milestone,date,...extra});

test('Timeline has a 2025 lower bound and current-time upper bound independent of History',()=>{
 const rows=[row('2024-12-31'),row('2025-01-01'),row('2025-11',{date_precision:'month'}),row('2026-10-03'),row('2026-10-04')];
 assert.equal(TIMELINE_START,'2025-01-01');
 assert.equal(HISTORY_START,Date.parse('2026-01-01T00:00:00+09:00'));
 assert.deepEqual(filterTimeline(rows,{now:Date.parse('2026-10-03T12:00:00Z')}).map(item=>item.date),['2025-01-01','2025-11','2026-10-03']);
 assert.equal(rows[0].date,'2024-12-31');
});

test('Timeline preserves real date precision and rejects invalid or fabricated date shapes',()=>{
 const rows=[row('2025-01-23'),row('2025-11',{date_precision:'month'}),row('2026-01-01T23:30:00-08:00',{date_precision:'timestamp'}),row('2025-02-30'),row('2025-13',{date_precision:'month'}),row('2025-11-01',{date_precision:'month'}),row('2025-11'),row('2026-01-01T23:30:00',{date_precision:'timestamp'}),row('2026-01-01',{date_precision:'unknown'})];
 const normalized=normalizeTimeline(rows);
 assert.equal(normalized.items.length,3);assert.equal(normalized.rejected,6);
 assert.equal(timelineDateLabel(normalized.items[1]),'2025년 11월');
 assert.equal(timelineDateLabel(normalized.items[2]),'2026.01.01'); // Preserve the source date, do not silently shift to KST.
});

test('Timeline requires a usable title, summary and primary source; distinct event types stay visible',()=>{
 assert.equal(normalizeTimeline([row('2025-01-23'),row('2025-01-23',{summary:''}),row('2025-01-23',{title:' '}),row('2025-01-23',{source_url:'javascript:alert(1)'})]).rejected,3);
 assert.equal(timelineDateTypeLabel(row('2025-01-23')),'제품 출시');
 assert.equal(timelineDateTypeLabel(row('2026-09-29',{date_type:'public_preview_release'})),'공개 프리뷰');
 assert.equal(timelineDateTypeLabel(row('2026-06-02',{date_type:'private_preview_release'})),'제한 프리뷰');
 assert.equal(timelineDateTypeLabel(row('2026-09-29',{date_type:'platform_announcement'})),'플랫폼 발표');
 assert.equal(timelineDateTypeLabel(row('2025-01-23',{date_type:'repository_creation'})),'저장소 생성');
 assert.equal(timelineDateTypeLabel(row('2025-01-23',{date_type:'project_rename'})),'이름 변경 발표');
});

test('Timeline cards use theme tokens, chronological year markers and responsive single-column layout',()=>{
 const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.milestone-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:900px\)\{\.milestone-grid\{grid-template-columns:1fr\}/);
 assert.match(css,/\.timeline-year::before\{[^}]*background:var\(--line-strong\)/);
 assert.match(css,/\.milestone\{[^}]*background:var\(--surface\)/);
 assert.match(css,/\.milestone h4\{[^}]*font-size:23px/);
 assert.doesNotMatch(css,/\.rail\{/);
});
