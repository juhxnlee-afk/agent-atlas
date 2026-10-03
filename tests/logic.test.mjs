import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DAY, HISTORY_START, safeURL, normalizeRepos, filterRepos, filterPapers, matching, kstDate, kstStamp, snapshotPath } from '../assets/logic.mjs';
const now=Date.parse('2026-10-03T06:00:00Z');
const repo=(id,date,stars=0,extra={})=>({id,name:`owner/repo-${id}`,url:`https://github.com/owner/repo-${id}`,created_at:date,stars,description_ko:'도구 연결형 에이전트',category:'멀티에이전트',...extra});
const recent=repo('new','2026-10-02T02:00:00Z',50);
const old=repo('old','2025-01-01T00:00:00Z',1000,{pushed_at:'2026-10-03T05:59:59Z',updated_at:'2026-10-03T05:59:59Z'});
test('Main uses original created_at and exact rolling seven days, never push/update',()=>{
 const rows=[old,recent,repo('boundary',new Date(now-7*DAY).toISOString()),repo('outside',new Date(now-7*DAY-1).toISOString()),repo('future',new Date(now+1).toISOString())];
 assert.deepEqual(filterRepos(rows,{now}).map(r=>r.id),['new','boundary']);
});
test('Main expires records as actual time advances beyond last collection',()=>{
 assert.equal(filterRepos([recent],{now:now+10*DAY}).length,0);
});
test('History starts at KST January1, original creation only',()=>{
 const rows=[old,repo('year',new Date(HISTORY_START).toISOString()),repo('before',new Date(HISTORY_START-1).toISOString()),recent];
 assert.deepEqual(filterRepos(rows,{tab:'history',now,sort:'date-desc'}).map(r=>r.id),['new','year']);
 assert.deepEqual(filterRepos(rows,{tab:'history',now,legacy:true,sort:'date-desc'}).map(r=>r.id),['before','old']);
});
test('Snapshot History cannot leak records created after selected collection',()=>{
 assert.equal(filterRepos([recent],{tab:'history',now,asOf:Date.parse('2026-10-01T00:00:00Z')}).length,0);
});
test('Repo records deduplicate regardless of repeated activity',()=>{
 assert.equal(filterRepos([recent,{...recent,pushed_at:new Date(now).toISOString()}],{now}).length,1);
 assert.equal(normalizeRepos([recent,{...recent,id:undefined,name:recent.name.toUpperCase()}]).items.length,1);
});
test('Repository search covers owner, name, description, category and Unicode normalization',()=>{
 assert.equal(matching(recent,'OWNER repo-new'),true);
 assert.equal(matching(recent,'연결형 멀티에이전트'),true);
 assert.equal(matching(recent,'unrelated'),false);
 assert.equal(matching({...recent,name:'ＡＢＣ/repo'},'abc'),true);
});
test('Minimum Stars is inclusive and invalid or negative inputs do not remove everything',()=>{
 const rows=[recent,repo('other','2026-10-01T00:00:00Z',49)];
 assert.equal(filterRepos(rows,{now,minStars:50}).length,1);
 assert.equal(filterRepos(rows,{now,minStars:-1}).length,2);
 assert.equal(filterRepos(rows,{now,minStars:'not a number'}).length,2);
});
test('All four repository sort orders work and do not mutate source array',()=>{
 const rows=[recent,repo('popular','2026-09-28T00:00:00Z',500)];
 assert.equal(filterRepos(rows,{now,sort:'stars-desc'})[0].id,'popular');
 assert.equal(filterRepos(rows,{now,sort:'stars-asc'})[0].id,'new');
 assert.equal(filterRepos(rows,{now,sort:'date-desc'})[0].id,'new');
 assert.equal(filterRepos(rows,{now,sort:'date-asc'})[0].id,'popular');
 assert.equal(rows[0].id,'new');
});
test('Papers search title/summary and sort original submission dates',()=>{
 const papers=[{id:'a',title:'Agent memory',description_ko:'장기 기억',date:'2026-10-01'},{id:'b',title:'Agent tools',description_ko:'도구 호출',date:'2026-02-01'},{id:'future',title:'future',date:'2027-01-01'}];
 assert.deepEqual(filterPapers(papers,{now}).map(r=>r.id),['a','b']);
 assert.deepEqual(filterPapers(papers,{now,sort:'date-asc'}).map(r=>r.id),['b','a']);
 assert.deepEqual(filterPapers(papers,{now,query:'장기 기억'}).map(r=>r.id),['a']);
});
test('Invalid data is rejected, unsafe links are blocked, KST is explicit',()=>{
 assert.equal(normalizeRepos([recent,repo('bad','garbage'),repo('unsafe','2026-10-01',{},{url:'javascript:alert(1)'})]).rejected,2);
 assert.equal(safeURL('javascript:alert(1)'), '');
 assert.equal(snapshotPath('https://bad.example/a.json'),'');
 assert.equal(snapshotPath('data/snapshots/../../secret.json'),'');
 assert.equal(snapshotPath('data/snapshots/2026-10-03.json'),'data/snapshots/2026-10-03.json');
 assert.equal(kstDate('2026-01-01T16:00:00Z'),'2026-01-02');
 assert.match(kstStamp('2026-01-01T16:00:00Z'),/2026-01-02 01:00 KST/);
});
test('Snapshot includes full archive and refuses to overwrite immutable files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agent-atlas-test-'));
 try {
  await mkdir(join(root,'data'));
  const write=async(name,value)=>writeFile(join(root,'data',name+'.json'),JSON.stringify(value));
  await write('repos',{collected_at:new Date(now).toISOString(),items:[old,recent]});
  await write('papers',[]);await write('timeline',[]);await write('meta',{collected_at:new Date(now).toISOString()});
  const script=resolve('scripts/create-snapshot.mjs');
  execFileSync(process.execPath,[script,`--root=${root}`],{stdio:'pipe'});
  const target=join(root,'data/snapshots/2026-10-03.json'),before=await readFile(target,'utf8');
  const snapshot=JSON.parse(before);assert.equal(snapshot.repos.length,2);assert.equal(snapshot.brief.counts.recent_repositories,1);
  assert.throws(()=>execFileSync(process.execPath,[script,`--root=${root}`],{stdio:'pipe'}));
  assert.equal(await readFile(target,'utf8'),before);
 } finally {await rm(root,{recursive:true,force:true});}
});
