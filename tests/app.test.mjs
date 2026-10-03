/** DOM contract tests: lightweight in-memory nodes, not a substitute for visual browser QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
const nodes=new Map();
class Element {
 constructor(id=''){this.id=id;this.attrs={};this.listeners={};this._html='';this.textContent='';this.value='';this.dataset={};this.children=[];this.disabled=false;}
 set innerHTML(html){for(const id of this.children)nodes.delete(id);this.children=[];this._html=html;for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const id=match[1];const node=new Element(id);node.value=match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';nodes.set(id,node);this.children.push(id);}}
 get innerHTML(){return this._html;}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 async fire(name,value,extra={}){if(value!==undefined)this.value=value;return this.listeners[name]?.({target:this,preventDefault(){},...extra});}
 focus(){document.activeElement=this;}
}
for(const id of ['app','schedule'])nodes.set(id,new Element(id));
const tabs=['main','history','paper','news'].map(name=>{const el=new Element(`tab-${name}`);el.dataset.tab=name;nodes.set(el.id,el);return el;});
const navigation=new Element();
globalThis.document={baseURI:'http://example.test/project/',hidden:false,activeElement:null,querySelector:selector=>selector==='.tabs'?navigation:nodes.get(selector.slice(1))||null,querySelectorAll:selector=>selector==='[data-tab]'?tabs:[],addEventListener(){}};
const windowEvents={};globalThis.window={addEventListener(name,fn){windowEvents[name]=fn;}};globalThis.location={hash:''};globalThis.history={replaceState(_s,_t,url){location.hash=url;}};
const interval=globalThis.setInterval;globalThis.setInterval=()=>0;
Date.now=()=>Date.parse('2026-10-05T07:00:00Z');
const now=Date.now(),date=offset=>new Date(now-offset*86400000).toISOString();
const repos=[{id:'1',name:'acme/fresh-agent',url:'https://github.com/acme/fresh-agent',description_ko:'새 도구 에이전트',category:'도구',created_at:date(1),stars:37},{id:'2',name:'acme/history-agent',url:'https://github.com/acme/history-agent',created_at:'2026-02-21T23:37:33Z',stars:500},{id:'3',name:'acme/old-agent',url:'https://github.com/acme/old-agent',created_at:'2025-01-01T00:00:00Z',pushed_at:date(0),stars:99999}];
const brief={id:'fixture',collected_at:date(0),window_start:date(7),window_end:date(0),headline:'검증된 브리핑',summary:'최근 7일 현황',snapshot_url:'data/snapshots/fixture.json',themes:[],sources:[]};
const fixtures={'data/repos.json':{items:repos,collected_at:date(0)},'data/papers.json':[{id:'p',title:'Agent Memory Paper',description_ko:'장기 기억 연구',date:'2026-01-01',url:'https://arxiv.org/abs/2601.00001'}],'data/timeline.json':[],'data/briefs.json':[brief],'data/meta.json':{collected_at:date(0)},'data/snapshots/fixture.json':{id:'fixture',collected_at:date(0),repos:[{...repos[1],stars:12}]}};
const story={region:'international',id:'story-a',title:'권한 범위를 좁힌 Agent Tool',summary:'브라우저 에이전트 권한 검증',significance:'실행 범위를 명확히 합니다',url:'https://example.com/story-a',source:'공식 소식',published_at:'2026-10-04T03:00:00Z',published_date:'2026-10-04',published_precision:'timestamp',published_date_kst:'2026-10-04',date_basis:'원문 시각 확인',topics:['안전'],supporting_sources:[{source:'공식 프로젝트',url:'https://example.com/project'}]};
const newsIssue={date:'2026-10-04',status:'partial',collected_at:'2026-10-04T07:00:00Z',headline:'오늘의 에이전트 흐름',summary:'도구를 확장하고 안전한 접근을 확인합니다',items:[story]};
fixtures['data/news.json']={schema_version:1,timezone:'Asia/Seoul',started_on:'2026-10-03',collected_at:'2026-10-04T07:00:00Z',items:[{...newsIssue,date:'2026-10-03',status:'final',headline:'전날의 변화',items:[{...story,region:'domestic',id:'story-b',url:'https://example.com/story-b',title:'지난 날짜의 메모리 소식',published_at:'2026-10-03T03:00:00Z',published_date:'2026-10-03',published_date_kst:'2026-10-03'}]},newsIssue]};
let failing='';
globalThis.fetch=async url=>{const path=new URL(url).pathname.replace('/project/','');if(path===failing)return {ok:false,status:503};return {ok:true,json:async()=>structuredClone(fixtures[path])};};
await import('../assets/app.mjs');
async function flush(){for(let i=0;i<8;i++)await nextTurn();}
await flush();
const get=id=>nodes.get(id);
test('App loads with a project subpath, all assets relative and recent count correct',()=>{
 assert.match(get('results').innerHTML,/fresh-agent/);
 assert.doesNotMatch(get('results').innerHTML,/old-agent|history-agent/);
 assert.equal(get('count').textContent,1);
 assert.equal(get('app').attrs['aria-busy'],'false');
});
test('Search, empty filter, reset and per-tab preservation work',async()=>{
 await get('search').fire('input','acme');assert.equal(get('count').textContent,1);
 await get('min-stars').fire('input','38');assert.match(get('results').innerHTML,/검색·필터에 맞는 항목이 없습니다/);
 await get('clear').fire('click');assert.equal(get('count').textContent,1);assert.equal(get('search').value,'');
 await get('tab-history').fire('click');assert.equal(get('sort').value,''); // select uses child option, state checked in source rendering below
 assert.match(get('app').innerHTML,/<option value="date-desc" selected>/);
 assert.match(get('results').innerHTML,/history-agent/);assert.doesNotMatch(get('results').innerHTML,/old-agent/);
 assert.match(get('legacy').innerHTML,/old-agent/);
 await get('search').fire('input','history-agent');assert.equal(get('count').textContent,1);
 await get('tab-paper').fire('click');await get('search').fire('input','장기 기억');assert.equal(get('count').textContent,1);
 await get('tab-history').fire('click');assert.equal(get('search').value,'history-agent');
});
test('Snapshot values are isolated to History and never leak into Main',async()=>{
 await get('clear').fire('click');
 await get('snapshot-select').fire('change','fixture');await flush();
 assert.match(get('results').innerHTML,/☆ 12/);assert.doesNotMatch(get('results').innerHTML,/fresh-agent/);
 await get('tab-main').fire('click');assert.match(get('results').innerHTML,/fresh-agent/);assert.equal(get('count').textContent,1);
 await get('tab-history').fire('click');assert.match(get('results').innerHTML,/☆ 12/);
});
test('Snapshot failure shows explicit blocked state and recovers on retry',async()=>{
 failing='data/snapshots/fixture.json';await get('snapshot-select').fire('change','fixture');await flush();
 assert.match(get('archive-body').innerHTML,/HTTP 503/);assert.match(get('results').innerHTML,/선택한 기록을 확인할 수 없습니다/);
 failing='';await get('snapshot-retry').fire('click');await flush();assert.match(get('results').innerHTML,/☆ 12/);
});
test('Failed data fetch is surfaced without breaking other tabs; refresh recovers',async()=>{
 await get('snapshot-select').fire('change','');failing='data/repos.json';await get('refresh').fire('click');await flush();
 assert.match(get('app').innerHTML,/저장소: HTTP 503/);assert.match(get('results').innerHTML,/데이터를 불러오지 못했습니다/);
 await get('tab-paper').fire('click');assert.match(get('results').innerHTML,/Agent Memory Paper/);
 failing='';await get('refresh').fire('click');await flush();await get('tab-main').fire('click');assert.match(get('results').innerHTML,/fresh-agent/);
 globalThis.setInterval=interval;
});

test('News groups newest days first and shows Korean synthesis, source dates and primary links',async()=>{
 await get('tab-news').fire('click');
 assert.equal(get('tab-news').attrs['aria-selected'],'true');
 assert.equal(get('count').textContent,2);
 const html=get('results').innerHTML;
 assert.ok(html.indexOf('2026-10-04')<html.indexOf('2026-10-03'));
 assert.match(html,/하루 핵심 요약/);assert.match(html,/오늘의 에이전트 흐름/);
 assert.match(html,/부분 수집/);assert.match(html,/일일 수집 마감/);
 assert.match(html,/원문 게시/);assert.match(html,/수집 ·/);
 assert.match(html,/https:\/\/example.com\/project/);
 assert.equal(get('min-stars'),undefined);
 assert.match(get('app').innerHTML,/2026-10-04 16:00 KST/);
});
test('News supports search, empty results, reset, sorting, and independent tab state',async()=>{
 await get('search').fire('input','Agent 안전');assert.equal(get('count').textContent,1);
 await get('tab-main').fire('click');assert.equal(get('search').value,'');
 await get('tab-news').fire('click');assert.equal(get('search').value,'Agent 안전');
 await get('search').fire('input','아무결과없는단어');assert.match(get('results').innerHTML,/검색에 맞는 뉴스가 없습니다/);
 await get('clear').fire('click');assert.equal(get('count').textContent,2);
 await get('sort').fire('change','date-asc');
 assert.ok(get('results').innerHTML.indexOf('2026-10-03')<get('results').innerHTML.indexOf('2026-10-04'));
 await get('clear').fire('click');
});
test('News refresh failure is explicit while Main still works; retry restores all daily history',async()=>{
 failing='data/news.json';await get('refresh').fire('click');await flush();
 assert.match(get('app').innerHTML,/뉴스: HTTP 503/);assert.match(get('results').innerHTML,/뉴스 데이터를 불러오지 못했습니다/);
 await get('tab-main').fire('click');assert.match(get('results').innerHTML,/fresh-agent/);
 await get('tab-news').fire('click');failing='';await get('refresh').fire('click');await flush();
 assert.equal(get('count').textContent,2);
});
test('Keyboard navigation and direct hashes include News and preserve other tabs',async()=>{
 await navigation.fire('keydown',undefined,{key:'Home'});assert.equal(location.hash,'#main');
 await navigation.fire('keydown',undefined,{key:'End'});assert.equal(location.hash,'#news');assert.equal(document.activeElement.id,'tab-news');
 await navigation.fire('keydown',undefined,{key:'ArrowRight'});assert.equal(location.hash,'#main');
 await navigation.fire('keydown',undefined,{key:'ArrowLeft'});assert.equal(location.hash,'#news');
 location.hash='#paper';windowEvents.hashchange();assert.match(get('results').innerHTML,/Agent Memory Paper/);
 location.hash='#news';windowEvents.hashchange();assert.equal(get('count').textContent,2);
});

test('Domestic and international news filters compose with search, preserve daily synthesis and reset',async()=>{
 await get('tab-news').fire('click');await get('clear').fire('click');
 await get('news-region-domestic').fire('click');assert.equal(get('count').textContent,1);
 assert.equal(get('news-region-domestic').attrs['aria-pressed'],'true');
 assert.match(get('results').innerHTML,/지난 날짜의 메모리 소식/);assert.doesNotMatch(get('results').innerHTML,/권한 범위를 좁힌 Agent Tool/);
 assert.match(get('results').innerHTML,/전체 뉴스 종합/);
 await get('tab-main').fire('click');await get('tab-news').fire('click');assert.equal(get('count').textContent,1);
 await get('search').fire('input','없는 검색어');assert.equal(get('count').textContent,0);
 await get('clear').fire('click');assert.equal(get('count').textContent,2);assert.equal(get('news-region-all').attrs['aria-pressed'],'true');
 await get('news-region-international').fire('click');assert.equal(get('count').textContent,1);assert.match(get('results').innerHTML,/해외 매체/);
 await get('clear').fire('click');
});
test('Modified navigation keys retain browser shortcuts',async()=>{
 await get('tab-main').fire('click');await navigation.fire('keydown',undefined,{key:'End',ctrlKey:true});assert.equal(location.hash,'#main');
 await navigation.fire('keydown',undefined,{key:'ArrowRight',metaKey:true});assert.equal(location.hash,'#main');
});
