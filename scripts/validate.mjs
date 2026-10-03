#!/usr/bin/env node
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { itemsOf, normalizeRepos, normalizePapers, normalizeTimeline, snapshotPath, time } from '../assets/logic.mjs';
const root=resolve(import.meta.dirname,'..');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
let failed=false;
const check=(condition,message)=>{if(!condition){console.error('FAIL',message);failed=true;}};
for(const [name,normalize] of [['repos',normalizeRepos],['papers',normalizePapers],['timeline',normalizeTimeline]]) {
 const raw=await read(`data/${name}.json`),result=normalize(raw);
 check(result.rejected===0,`${name}: ${result.rejected} invalid rows`);
 check(result.items.length===itemsOf(raw).length,`${name}: duplicate records`);
 console.log(`${name}: ${result.items.length} valid records`);
}
const briefs=itemsOf(await read('data/briefs.json')); const ids=new Set();
for(const brief of briefs){
 check(!ids.has(brief.id),`Duplicate brief ${brief.id}`);ids.add(brief.id);
 check(Boolean(snapshotPath(brief.snapshot_url)),`Invalid snapshot path ${brief.id}`);
 check(time(brief.window_end)-time(brief.window_start)===7*86400000,`Brief ${brief.id} is not a7day window`);
 const bytes=await readFile(resolve(root,brief.snapshot_url));const snap=JSON.parse(bytes);
 check(snap.id===brief.id,`Snapshot ID ${brief.id}`);
 check(snap.collected_at===brief.collected_at,`Snapshot collection time ${brief.id}`);
 check(createHash('sha256').update(bytes).digest('hex')===brief.sha256,`Immutable snapshot checksum ${brief.id}`);
 check(Array.isArray(snap.repos)&&Array.isArray(snap.papers)&&Array.isArray(snap.timeline),`Incomplete snapshot ${brief.id}`);
}
const html=await readFile(resolve(root,'index.html'),'utf8');
check(/<html lang="ko">/.test(html),'Korean document language missing');
check(!/https?:\/\//.test(html),'HTML contains a third-party dependency');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))await access(resolve(root,match[1]));
for(const name of await readdir(resolve(root,'assets')))check(!/\.(?:map|log)$/.test(name),'Unexpected build artifact');
console.log(`${briefs.length} immutable snapshot(s) checked`);
if(failed)process.exitCode=1;else console.log('Validation passed: data, source paths, local assets, snapshot checksums.');
