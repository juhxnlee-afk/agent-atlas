#!/usr/bin/env node
/** Local-only merge. Does not research, push, publish, or schedule. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeNews, NEWS_START } from '../assets/news.mjs';
import { time } from '../assets/logic.mjs';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i).replace(/^--/,''),arg.slice(i+1)];}));
async function main() {
  if (!options.input) throw new Error('Usage: node scripts/update-news.mjs --input=/absolute/path/verified-news.json');
  const root=resolve(options.root || dirname(fileURLToPath(import.meta.url))+'/..');
  const incoming=JSON.parse(await readFile(resolve(options.input),'utf8'));
  if (time(incoming.collected_at)>Date.now()+60_000) throw new Error('News collection is in the future.');
  let previous={schema_version:1,timezone:'Asia/Seoul',started_on:NEWS_START,items:[]};
  const target=resolve(root,'data/news.json');
  try { previous=JSON.parse(await readFile(target,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const merged=mergeNews(previous,incoming);
  if (merged.items.some(issue=>time(issue.collected_at)>Date.now()+60_000)) throw new Error('A news issue collection is in the future.');
  const temp=target+`.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify(merged,null,2)+'\n'); await rename(temp,target);
  console.log(JSON.stringify({file:'data/news.json',issues:merged.items.length,stories:merged.items.reduce((sum,issue)=>sum+issue.items.length,0),collected_at:merged.collected_at},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
