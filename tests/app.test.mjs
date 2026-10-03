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
 async fire(name,value){if(value!==undefined)this.value=value;return this.listeners[name]?.({target:this,preventDefault(){}});}
 focus(){document.activeElement=this;}
}
for(const id of ['app','schedule'])nodes.set(id,new Element(id));
const tabs=['main','history','paper'].map(name=>{const el=new Element(`tab-${name}`);el.dataset.tab=name;nodes.set(el.id,el);return el;});
const navigation=new Element();
globalThis.document={baseURI:'http://example.test/project/',hidden:false,activeElement:null,querySelector:selector=>selector==='.tabs'?navigation:nodes.get(selector.slice(1))||null,querySelectorAll:selector=>selector==='[data-tab]'?tabs:[],addEventListener(){}};
globalThis.window={addEventListener(){}};globalThis.location={hash:''};globalThis.history={replaceState(_s,_t,url){location.hash=url;}};
const interval=globalThis.setInterval;globalThis.setInterval=()=>0;
const now=Date.now(),date=offset=>new Date(now-offset*86400000).toISOString();
const repos=[{id:'1',name:'acme/fresh-agent',url:'https://github.com/acme/fresh-agent',description_ko:'새 도구 에이전트',category:'도구',created_at:date(1),stars:37},{id:'2',name:'acme/history-agent',url:'https://github.com/acme/history-agent',created_at:'2026-02-21T23:37:33Z',stars:500},{id:'3',name:'acme/old-agent',url:'https://github.com/acme/old-agent',created_at:'2025-01-01T00:00:00Z',pushed_at:date(0),stars:99999}];
const brief={id:'fixture',collected_at:date(0),window_start:date(7),window_end:date(0),headline:'검증된 브리핑',summary:'최근 7일 현황',snapshot_url:'data/snapshots/fixture.json',themes:[],sources:[]};
const fixtures={'data/repos.json':{items:repos,collected_at:date(0)},'data/papers.json':[{id:'p',title:'Agent Memory Paper',description_ko:'장기 기억 연구',date:'2026-01-01',url:'https://arxiv.org/abs/2601.00001'}],'data/timeline.json':[],'data/briefs.json':[brief],'data/meta.json':{collected_at:date(0)},'data/snapshots/fixture.json':{id:'fixture',collected_at:date(0),repos:[{...repos[1],stars:12}]}};
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
