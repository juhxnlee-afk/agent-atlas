import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { calendarDate, normalizeNews, filterNews, mergeNews } from '../assets/news.mjs';
const stamp='2026-10-03T07:00:00Z';
const story={id:'one',title:'Agent 도구 발표',summary:'브라우저 권한 검증 기능',significance:'명확한 사용자 동의',source:'Official Lab',url:'https://example.com/story',published_at:'2026-10-02T20:00:00Z',published_date:'2026-10-02',published_precision:'timestamp',published_timezone:'UTC',published_date_kst:'2026-10-03',date_basis:'원문 UTC 시각 확인',topics:['안전']};
const issue={date:'2026-10-03',status:'partial',collected_at:stamp,headline:'에이전트 안전성의 변화',summary:'도구와 접근 제어의 핵심 흐름',items:[story]};
const envelope=items=>({schema_version:1,timezone:'Asia/Seoul',collected_at:stamp,started_on:'2026-10-03',items});
const now=Date.parse('2026-10-05T07:00:00Z');
test('Optional editorial cutoffs reject later stories and malformed windows without changing legacy issues',()=>{
 const current={...issue,window_start:'2026-10-02T15:00:00Z',window_end:'2026-10-03T00:00:00Z'};
 assert.equal(normalizeNews(envelope([current])).rejected,0);
 assert.equal(normalizeNews(envelope([issue])).rejected,0);
 const later={...story,published_at:'2026-10-03T01:00:00Z',published_date:'2026-10-03'};
 assert.equal(normalizeNews(envelope([{...current,items:[later]}])).rejected,1);
 for(const window_end of ['unknown','2026-10-03','2026-10-03T08:00:00Z'])assert.equal(normalizeNews(envelope([{...current,window_end}])).rejected,1);
 assert.equal(normalizeNews(envelope([{...current,window_start:'2026-10-03T00:01:00Z'}])).rejected,1);
});
test('News calendar dates reject rollover dates and before-start archives',()=>{
 assert.equal(calendarDate('2026-02-30'),false);assert.equal(calendarDate('2026-10-03'),true);
 assert.equal(normalizeNews(envelope([{...issue,date:'2026-10-02'}])).rejected,1);
 assert.equal(normalizeNews(envelope([{...issue,date:'2026-13-01'}])).rejected,1);
});
test('Publication and collection timestamps are distinct and source timezone rollover is preserved',()=>{
 const normalized=normalizeNews(envelope([issue]));assert.equal(normalized.rejected,0);
 assert.equal(normalized.items[0].items[0].published_date,'2026-10-02');
 assert.equal(normalized.items[0].items[0].published_date_kst,'2026-10-03');
 assert.equal(normalized.items[0].collected_at,stamp);
 assert.equal(normalizeNews(envelope([{...issue,items:[{...story,published_date_kst:'2026-10-02'}]}])).rejected,1);
});
test('Date-only sources retain date precision with no invented midnight timestamp',()=>{
 const dateStory={...story,published_at:null,published_precision:'date',published_date_kst:null,published_timezone:'unknown'};
 assert.equal(normalizeNews(envelope([{...issue,items:[dateStory]}])).rejected,0);
 assert.equal(normalizeNews(envelope([{...issue,items:[{...dateStory,published_at:'2026-10-02T00:00:00Z'}]}])).rejected,1);
 assert.equal(normalizeNews(envelope([{...issue,items:[{...dateStory,published_date_kst:'2026-10-02'}]}])).rejected,1);
});
test('News rejects unsafe URLs, missing evidence fields, future publication, and duplicate stories',()=>{
 for(const item of [{...story,url:'javascript:alert(1)'},{...story,source:''},{...story,date_basis:''},{...story,published_at:'2026-10-04T20:00:00Z'},{...story,supporting_sources:[{source:'bad',url:'data:text/html,bad'}]}]) assert.equal(normalizeNews(envelope([{...issue,items:[item]}])).rejected,1);
 assert.equal(normalizeNews(envelope([{...issue,items:[story,story]}])).rejected,1);
 assert.equal(normalizeNews(envelope([issue,issue])).duplicates,1);
});
test('An open KST day cannot be marked final until its day has ended',()=>{
 assert.equal(normalizeNews(envelope([{...issue,status:'final'}])).rejected,1);
 assert.equal(normalizeNews(envelope([{...issue,status:'final',collected_at:'2026-10-03T15:00:00Z'}])).rejected,0);
 assert.equal(normalizeNews(envelope([{...issue,date:'2026-10-04'}])).rejected,1);
});
test('News search spans summaries, titles, topics and source with AND matching and Unicode normalization',()=>{
 assert.equal(filterNews([issue],{query:'ＯＦＦＩＣＩＡＬ 안전',now}).length,1);
 assert.equal(filterNews([issue],{query:'도구 접근',now}).length,1);
 assert.equal(filterNews([issue],{query:'missing',now}).length,0);
 assert.equal(filterNews([issue],{now:Date.parse('2026-10-02T23:00:00Z')}).length,0);
});
test('News history is newest first by default and optionally oldest first without mutating records',()=>{
 const next={...issue,date:'2026-10-04',collected_at:'2026-10-04T07:00:00Z'};
 const rows=[issue,next];assert.deepEqual(filterNews(rows,{now}).map(x=>x.date),['2026-10-04','2026-10-03']);
 assert.deepEqual(filterNews(rows,{now,sort:'date-asc'}).map(x=>x.date),['2026-10-03','2026-10-04']);
 assert.equal(rows[0].date,'2026-10-03');
});
test('Daily merge retains old dates and stories while finalizing yesterday and adding today partial',()=>{
 const final={...issue,status:'final',collected_at:'2026-10-03T21:00:00Z',headline:'마감된 요약',items:[{...story,id:'two',url:'https://example.com/two'}]};
 const today={...issue,date:'2026-10-04',collected_at:'2026-10-03T21:00:00Z',items:[]};
 const merged=mergeNews(envelope([issue]),envelope([today,final]));
 assert.equal(merged.items.length,2);assert.equal(merged.items[1].items.length,2);assert.equal(merged.items[1].status,'final');
 assert.equal(merged.items[0].date,'2026-10-04');assert.equal(issue.status,'partial');
 assert.deepEqual(mergeNews(merged,envelope([today,final])),merged);
});
test('Daily merge refuses collection rollback, final-to-partial changes, and source ID reuse',()=>{
 assert.throws(()=>mergeNews(envelope([issue]),envelope([{...issue,collected_at:'2026-10-03T06:00:00Z'}])),/Older/);
 assert.throws(()=>mergeNews(envelope([{...issue,status:'final',collected_at:'2026-10-03T21:00:00Z'}]),envelope([{...issue,collected_at:'2026-10-03T22:00:00Z'}])),/cannot become partial/);
 assert.throws(()=>mergeNews(envelope([issue]),envelope([{...issue,items:[{...story,url:'https://example.com/changed'}]}])),/changed its source/);
});
test('News CLI writes atomically and schema-v2 snapshots retain data timestamps and immutable news',async()=>{
 const root=await mkdtemp(join(tmpdir(),'atlas-news-'));
 try {
  await mkdir(join(root,'data'));
  const write=async(name,value)=>writeFile(join(root,'data',name+'.json'),JSON.stringify(value));
  await write('repos',{collected_at:'2026-10-03T06:00:00Z',items:[]});await write('papers',[]);await write('timeline',[]);await write('meta',{collected_at:'2026-10-03T06:00:00Z'});
  const input=join(root,'incoming.json');await writeFile(input,JSON.stringify(envelope([issue])));
  const update=resolve('scripts/update-news.mjs'),snapshotScript=resolve('scripts/create-snapshot.mjs');
  execFileSync(process.execPath,[update,`--root=${root}`,`--input=${input}`],{stdio:'pipe'});
  execFileSync(process.execPath,[snapshotScript,`--root=${root}`],{stdio:'pipe'});
  const target=join(root,'data/snapshots/2026-10-03.json'),before=await readFile(target,'utf8'),snapshot=JSON.parse(before);
  assert.equal(snapshot.schema_version,2);assert.equal(snapshot.news.items[0].items[0].id,'one');
  assert.equal(snapshot.dataset_collected_at.repos,'2026-10-03T06:00:00Z');assert.equal(snapshot.dataset_collected_at.news,stamp);
  assert.equal(snapshot.brief.counts.news_stories,1);
  await writeFile(input,JSON.stringify(envelope([{...issue,items:[{...story,url:'javascript:bad'}]}])));
  const newsBefore=await readFile(join(root,'data/news.json'),'utf8');
  assert.throws(()=>execFileSync(process.execPath,[update,`--root=${root}`,`--input=${input}`],{stdio:'pipe'}));
  assert.equal(await readFile(join(root,'data/news.json'),'utf8'),newsBefore);
  assert.throws(()=>execFileSync(process.execPath,[snapshotScript,`--root=${root}`],{stdio:'pipe'}));assert.equal(await readFile(target,'utf8'),before);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('Source regions filter stories while preserving the complete daily summary and counts',()=>{
 const domestic={...story,region:'domestic'}, international={...story,id:'two',url:'https://example.com/two',region:'international',source:'Abroad',title:'Overseas workflow'};
 const mixed={...issue,items:[domestic,international]};
 const selected=filterNews([mixed],{region:'domestic',now})[0];
 assert.equal(selected.items.length,1);assert.equal(selected.items[0].region,'domestic');assert.equal(selected.summary,issue.summary);assert.equal(selected.total_items,2);
 assert.equal(filterNews([mixed],{region:'international',query:'workflow',now})[0].items.length,1);
 assert.equal(filterNews([mixed],{region:'domestic',query:'workflow',now}).length,0);
 assert.equal(filterNews([issue],{region:'domestic',now}).length,0);
 assert.equal(filterNews([issue],{now}).length,1);
 assert.equal(normalizeNews(envelope([{...issue,items:[{...story,region:'unknown'}]}])).rejected,1);
 assert.equal(mixed.items.length,2);
});
