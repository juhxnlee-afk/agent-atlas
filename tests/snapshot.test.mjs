import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('Snapshots keep editorial cutoff separate from actual collection and preserve prior bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'atlas-cutoff-'));
 try {
  await mkdir(join(root,'data'));
  const collected=new Date(Date.now()-60_000).toISOString();
  const cutoff=new Date(Date.parse(collected)-3600_000).toISOString();
  const repo={id:1,name:'example/agent',url:'https://github.com/example/agent',created_at:new Date(Date.parse(cutoff)-86400_000).toISOString(),stars:0};
  for(const [name,value] of Object.entries({repos:{collected_at:collected,items:[repo]},papers:{collected_at:collected,items:[]},timeline:{collected_at:collected,items:[]},meta:{collected_at:collected}}))await writeFile(join(root,'data',name+'.json'),JSON.stringify(value));
  const script=resolve(import.meta.dirname,'../scripts/create-snapshot.mjs');
  const run=(id,extra=[])=>execFileSync(process.execPath,[script,`--root=${root}`,`--collected-at=${collected}`,`--id=${id}`,...extra],{stdio:'pipe'});
  run('old');const oldBytes=await readFile(join(root,'data/snapshots/old.json'));
  run('cutoff',[`--window-end=${cutoff}`]);
  const bytes=await readFile(join(root,'data/snapshots/cutoff.json'));
  const snapshot=JSON.parse(bytes),index=JSON.parse(await readFile(join(root,'data/briefs.json')));
  const brief=index.items.find(item=>item.id==='cutoff');
  assert.equal(snapshot.collected_at,collected);
  assert.equal(snapshot.window_end,cutoff);
  assert.equal(brief.window_end,cutoff);
  assert.equal(Date.parse(brief.window_end)-Date.parse(brief.window_start),7*86400_000);
  assert.equal(brief.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await readFile(join(root,'data/snapshots/old.json')),oldBytes);
  assert.throws(()=>run('future',[`--window-end=${new Date(Date.parse(collected)+1).toISOString()}`]),/Editorial window_end/);
  assert.throws(()=>run('invalid',['--window-end=unknown']),/Editorial window_end/);
  assert.throws(()=>run('date-only',['--window-end=2026-10-06']),/Editorial window_end/);
  assert.throws(()=>run('cutoff',[`--window-end=${cutoff}`]),/cannot be overwritten/);
 } finally { await rm(root,{recursive:true,force:true}); }
});
