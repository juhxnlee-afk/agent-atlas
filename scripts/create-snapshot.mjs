#!/usr/bin/env node
/** Local-only: creates immutable data and an index. Does not fetch, push, publish, or schedule. */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DAY, time, itemsOf, normalizeRepos, normalizePapers, normalizeTimeline, filterRepos, kstDate, latestCollected, safeURL } from '../assets/logic.mjs';
import { normalizeNews } from '../assets/news.mjs';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i).replace(/^--/,''),arg.slice(i+1)];}));
const root=resolve(options.root || dirname(fileURLToPath(import.meta.url))+'/..');
const read=async name=>JSON.parse(await readFile(resolve(root,'data',name+'.json'),'utf8'));
async function main() {
  const [repoPayload,paperPayload,timelinePayload,meta]=await Promise.all(['repos','papers','timeline','meta'].map(read));
  let newsPayload;
  try { newsPayload=await read('news'); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const news=newsPayload?normalizeNews(newsPayload):null;
  if(news && (news.rejected || news.duplicates))throw new Error('Invalid or duplicate news issues. Fix news before creating a snapshot.');
  const repos=normalizeRepos(repoPayload),papers=normalizePapers(paperPayload),timeline=normalizeTimeline(timelinePayload);
  if(repos.rejected || papers.rejected || timeline.rejected)throw new Error('Invalid dates, titles, names, or source URLs. Fix rejected records before creating a snapshot.');
  const collected=options['collected-at'] || latestCollected([repoPayload,paperPayload,timelinePayload,meta,newsPayload],repos.items);
  if(!Number.isFinite(time(collected)))throw new Error('A verified collected_at timestamp is required.');
  if(time(collected)>Date.now()+60_000)throw new Error('collected_at is in the future.');
  if(news?.items.some(issue=>time(issue.collected_at)>time(collected)))throw new Error('A news issue was collected after the requested snapshot time.');
  const id=options.id || kstDate(collected);
  if(!/^[\w.-]+$/.test(id))throw new Error('Snapshot ID must contain only letters, digits, dots, underscores, or hyphens.');
  const recent=filterRepos(repos.items,{now:time(collected),sort:'date-desc'});
  const archive=filterRepos(repos.items,{tab:'history',now:time(collected),sort:'date-desc'});
  const counts={};for(const repo of recent)counts[repo.category || 'Agent AI']=(counts[repo.category || 'Agent AI'] || 0)+1;
  const themes=Object.entries(counts).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).map(([name])=>name);
  const custom=options.brief?JSON.parse(await readFile(resolve(options.brief),'utf8')):{};
  if(custom.sources && !custom.sources.every(source=>safeURL(source.url)&&typeof source.label==='string'))throw new Error('Brief sources must have verified HTTP(S) URLs and labels.');
  const brief={
    id,collected_at:collected,window_start:new Date(time(collected)-7*DAY).toISOString(),window_end:collected,
    headline:custom.headline || `최근 7일, ${recent.length}개의 에이전트 저장소를 관측했습니다`,
    summary:custom.summary || `이번 수집에서 원본 생성일이 최근 7일에 해당하는 공개 저장소 ${recent.length}개를 확인했습니다.${themes.length?` 수집 표본에는 ${themes.slice(0,4).join(' · ')} 분야가 포함됩니다.`:''} 2026년 이후 생성된 저장소 아카이브는 ${archive.length}개, 논문 기록은 ${papers.items.length}개입니다. 이는 선별 검색 결과의 현황이며 전체 생태계의 성장이나 성능 향상을 뜻하지 않습니다.`,
    themes:custom.themes || themes.slice(0,5),sources:custom.sources || recent.slice(0,6).map(repo=>({label:repo.name,url:repo.url})),
    method:custom.summary?'source_grounded_editorial':'deterministic_inventory',snapshot_url:`data/snapshots/${id}.json`,
    counts:{recent_repositories:recent.length,archive_repositories:archive.length,all_repositories:repos.items.length,papers:papers.items.length,timeline:timeline.items.length,...(news?{news_days:news.items.length,news_stories:news.items.reduce((sum,issue)=>sum+issue.items.length,0)}:{})}
  };
  if(typeof brief.headline!=='string'||typeof brief.summary!=='string'||!Array.isArray(brief.themes))throw new Error('Brief headline, summary, or themes has an invalid type.');
  const snapshot={schema_version:news?2:1,id,collected_at:collected,timezone:'Asia/Seoul',window_start:brief.window_start,window_end:collected,brief,repos:repos.items,papers:papers.items,timeline:timeline.items,provenance:meta};
  if(news) {
    snapshot.news={...newsPayload,items:news.items};
    snapshot.dataset_collected_at={repos:latestCollected([repoPayload],repos.items),papers:latestCollected([paperPayload],papers.items),timeline:latestCollected([timelinePayload],timeline.items),news:latestCollected([newsPayload],news.items)};
  }
  let previous=[];try{previous=itemsOf(await read('briefs'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous.some(item=>item.id===id))throw new Error(`Snapshot ${id} already exists in the index. Historical snapshots cannot be overwritten; use a new collection ID.`);
  const bytes=JSON.stringify(snapshot,null,2)+'\n';
  brief.sha256=createHash('sha256').update(bytes).digest('hex');
  const directory=resolve(root,'data/snapshots');await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,id+'.json'),bytes,{flag:'wx'});
  const index={schema_version:1,collected_at:collected,timezone:'Asia/Seoul',items:[...previous,brief].sort((a,b)=>time(b.collected_at)-time(a.collected_at))};
  const target=resolve(root,'data/briefs.json'),temp=target+`.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify(index,null,2)+'\n');await rename(temp,target);
  console.log(JSON.stringify({snapshot:brief.snapshot_url,sha256:brief.sha256,counts:brief.counts},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
