import { DAY, time, safeURL, itemsOf, normalizeRepos, normalizePapers, normalizeTimeline, filterRepos, filterPapers, kstDate, kstStamp, latestCollected, snapshotPath } from './logic.mjs';
const $ = (selector, root = document) => root.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const link = (url, label) => safeURL(url) ? `<a href="${escape(safeURL(url))}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);
const starNumber = value => new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 }).format(value || 0);
const state = {
  tab: ['main','history','paper'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'main',
  data: null, failures: [], loading: false, chosen: '', snapshot: null, snapshotError: '', snapshotLoading: false,
  filters: { main:{query:'',minStars:'',sort:'stars-desc'}, history:{query:'',minStars:'',sort:'date-desc'}, paper:{query:'',sort:'date-desc'} }
};
let loadGeneration = 0;
let snapshotGeneration = 0;
let activeController;
const files = { repos:'data/repos.json', papers:'data/papers.json', timeline:'data/timeline.json', briefs:'data/briefs.json', meta:'data/meta.json' };
const labels = { repos:'저장소', papers:'논문', timeline:'타임라인', briefs:'브리핑', meta:'수집 정보' };
async function fetchJSON(path, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
  const timeout = setTimeout(abort,20_000);
  try {
    const response = await fetch(new URL(path, document.baseURI), {cache:'no-cache',signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('요청 시간이 초과되었거나 취소되었습니다');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort',abort); }
}
async function load() {
  const generation = ++loadGeneration;
  snapshotGeneration++;
  activeController?.abort();
  activeController = new AbortController();
  state.loading = true;
  if (!state.data) $('#app').innerHTML = '<div class="empty loading" role="status">검증된 기록을 불러오는 중…</div>';
  else { const button = $('#refresh'); if (button) {button.disabled = true; button.textContent = '불러오는 중…';} }
  $('#app').setAttribute('aria-busy','true');
  const results = await Promise.allSettled(Object.entries(files).map(async ([key,path]) => [key,await fetchJSON(path, activeController.signal)]));
  if (generation !== loadGeneration) return;
  const raw = {}; const failures = [];
  results.forEach((result,index) => {
    if (result.status === 'fulfilled') raw[result.value[0]] = result.value[1];
    else failures.push(`${labels[Object.keys(files)[index]]}: ${result.reason?.message || '불러오기 실패'}`);
  });
  const data = {repos:[],papers:[],timeline:[],briefs:[],meta:raw.meta || {},available:{}};
  for (const [key,normalizer] of [['repos',normalizeRepos],['papers',normalizePapers],['timeline',normalizeTimeline]]) {
    try { if (!raw[key]) continue; const value=normalizer(raw[key]); data[key]=value.items; data.available[key]=true; if(value.rejected) failures.push(`${labels[key]}: 필수 날짜·출처가 잘못된 ${value.rejected}개 항목을 제외했습니다`); }
    catch(error) { failures.push(`${labels[key]}: ${error.message}`); }
  }
  try { if (raw.briefs) data.briefs=itemsOf(raw.briefs).filter(b => b?.id && Number.isFinite(time(b.collected_at)) && snapshotPath(b.snapshot_url)).sort((a,b)=>time(b.collected_at)-time(a.collected_at)); }
  catch(error) { failures.push(`브리핑: ${error.message}`); }
  data.collected_at = latestCollected(Object.values(raw), data.repos);
  state.data = data; state.failures = failures; state.loading = false;
  if (state.chosen && !data.briefs.some(b=>b.id===state.chosen)) state.chosen='';
  if (state.chosen) await chooseSnapshot(state.chosen,false);
  if (generation !== loadGeneration) return;
  render();
  $('#app').setAttribute('aria-busy','false');
}
function currentBrief() { return state.data?.briefs.find(b => b.id === state.chosen) || state.data?.briefs[0]; }
function currentRepos() { return state.chosen && state.snapshot ? state.snapshot.repos : state.data.repos; }
function currentAsOf() { return state.chosen && state.snapshot ? time(state.snapshot.collected_at) : Date.now(); }
function sourcesHTML(sources=[]) {return sources.filter(s=>safeURL(s.url)).map(s=>link(s.url,s.label || '출처 확인')).join('');}
function briefHTML(brief, archive=false) {
  if (!brief) return '<h2>아직 저장된 브리핑이 없습니다</h2><p>브리핑은 실제 수집이 끝난 시점부터 보관됩니다. 과거 날짜의 기록을 소급해 만들지 않습니다.</p>';
  const title = archive ? 'h3' : 'h2';
  return `<${title}>${escape(brief.headline)}</${title}><p>${escape(brief.summary)}</p><small>요약 범위 · ${escape(kstStamp(brief.window_start))} – ${escape(kstStamp(brief.window_end || brief.collected_at))}</small><small>브리핑 수집 · ${escape(kstStamp(brief.collected_at))}</small><div class="tags">${(brief.themes || []).map(theme=>`<span>${escape(theme)}</span>`).join('')}</div><div class="sources">${sourcesHTML(brief.sources)}</div>`;
}
function updateTabs() {
  document.querySelectorAll('[data-tab]').forEach(button => {
    const selected=button.dataset.tab===state.tab;
    button.setAttribute('aria-selected',String(selected)); button.tabIndex=selected ? 0 : -1;
  });
}
function render() {
  if (!state.data) return;
  updateTabs();
  const {tab,data}=state; const brief=currentBrief(); const weekly=filterRepos(data.repos,{now:Date.now()});
  const archives=filterRepos(data.repos,{tab:'history',sort:'date-desc'});
  const titles={main:'에이전트의 다음을<br><em>코드에서 읽다.</em>',history:'쌓이는 코드,<br><em>이어지는 변화.</em>',paper:'아이디어의<br><em>다음 페이지.</em>'};
  const subtitle={main:'원본 저장소 생성일 기준 최근 7일의 코드와 핵심 흐름',history:'2026.01.01 이후 생성된 저장소와 날짜별 수집 원본',paper:'에이전트 AI 논문 · arXiv 최초 제출일 기준'};
  let html=`<section id="panel-${tab}" role="tabpanel" aria-labelledby="tab-${tab}"><div class="pagehead"><div><h1>${titles[tab]}</h1><p>${subtitle[tab]}</p></div><div class="update"><span>LAST COLLECTED</span><strong>${escape(kstStamp(data.collected_at))}</strong><small>표시 시간대 · Asia/Seoul (KST)</small><button class="refresh" id="refresh" type="button">데이터 새로고침 ↻</button></div></div>`;
  if(state.failures.length) html+=`<div class="banner" role="alert"><p>일부 데이터를 표시할 수 없습니다. ${escape(state.failures.join(' · '))}</p><button type="button" id="retry">다시 불러오기</button></div>`;
  if(data.collected_at && Date.now()-time(data.collected_at)>36*DAY/24) html+='<div class="banner" role="status">최종 수집 후 36시간 이상 지났습니다. 최근 7일 범위는 현재 시각을 따르며, 새로운 저장소가 아직 반영되지 않았을 수 있습니다.</div>';
  if(tab==='main') html+=`<section class="overview" aria-labelledby="brief-title"><div class="brief"><div class="sectiontag" id="brief-title">01 / DAILY BRIEF · 7D WINDOW</div>${briefHTML(data.briefs[0])}</div><div class="numbers"><div><span>CREATED IN LAST 7 DAYS</span><strong id="weekly-count">${data.available.repos?String(weekly.length).padStart(2,'0'):'—'}</strong><small>원본 생성일 · 중복 제거</small></div><div><span>2026 REPOSITORY ARCHIVE</span><strong>${data.available.repos?String(archives.length).padStart(2,'0'):'—'}<i> repos</i></strong><small>2026.01.01 이후 생성된 저장소</small></div></div></section>`;
  html+=coverageHTML();
  if(tab==='history') html+=`<section class="archivebrief" aria-labelledby="archive-title"><div><div class="sectiontag">DAILY ARCHIVE / IMMUTABLE SNAPSHOTS</div><h2 id="archive-title">그날의 관측 기록</h2></div><label for="snapshot-select">조회할 수집 기록<select id="snapshot-select"><option value="">최신 데이터 · 전체 아카이브</option>${data.briefs.map(b=>`<option value="${escape(b.id)}" ${state.chosen===b.id?'selected':''}>${escape(kstStamp(b.collected_at))}</option>`).join('')}</select></label><div class="archivebody" id="archive-body">${archiveBodyHTML()}</div></section>`;
  html+=`<section class="feed" aria-labelledby="feed-title"><div class="sectionhead"><div><span class="sectiontag">${tab==='main'?'02 / CODE RADAR':tab==='history'?'ORIGINAL CREATION / CODE ARCHIVE':'FIRST SUBMISSION / PAPER RADAR'}</span><h2 id="feed-title">${tab==='main'?'최근 7일':tab==='history'?'코드 히스토리':'논문 히스토리'} <span class="count" id="count">0</span></h2></div><div class="window" id="window-label"></div></div>${controlsHTML()}<p class="results-note" id="results-note" aria-live="polite" aria-atomic="true"></p><div class="tablehead"><span>${tab==='paper'?'PAPER / CONTRIBUTION':'REPOSITORY / CONTRIBUTION'}</span><span>${tab==='paper'?'FIRST SUBMITTED / UTC':'STARS / CREATED · KST'}</span></div><div id="results"></div><div id="legacy"></div></section>`;
  if(tab==='main') html+=`<section class="timeline" aria-labelledby="timeline-title"><div class="sectionhead"><div><span class="sectiontag">03 / EVOLUTION MAP</span><h2 id="timeline-title">발전의 흐름</h2></div><span class="note">2026.01.01 — NOW</span></div><p class="note">공식 발표와 논문의 날짜를 구분한 선별 이정표 · 가로로 넘겨 전체 흐름을 확인하세요</p>${timelineHTML()}</section>`;
  html+='</section>'+['main','history','paper'].filter(item=>item!==tab).map(item=>`<section id="panel-${item}" role="tabpanel" aria-labelledby="tab-${item}" hidden></section>`).join('');
  $('#app').innerHTML=html;
  $('#app').setAttribute('aria-busy','false');
  $('#refresh').addEventListener('click',load);
  $('#retry')?.addEventListener('click',load);
  $('#search').addEventListener('input',event=>{state.filters[state.tab].query=event.target.value;renderFeed();});
  $('#min-stars')?.addEventListener('input',event=>{state.filters[state.tab].minStars=event.target.value;renderFeed();});
  $('#sort').addEventListener('change',event=>{state.filters[state.tab].sort=event.target.value;renderFeed();});
  $('#clear').addEventListener('click',()=>{state.filters[state.tab]={query:'',minStars:'',sort:state.tab==='main'?'stars-desc':'date-desc'};$('#search').value='';if($('#min-stars'))$('#min-stars').value='';$('#sort').value=state.filters[state.tab].sort;renderFeed();$('#search').focus();});
  $('#snapshot-select')?.addEventListener('change',event=>chooseSnapshot(event.target.value));
  renderFeed();
  const schedule=data.meta.schedule;
  $('#schedule').textContent=schedule?.enabled ? '매일 06:00 KST 수집 예약' : '업데이트 목표 · 매일 06:00 KST (예약 설정 대기)';
}
function coverageHTML() {
  const data=state.data; const coverage=data.meta.coverage_ko || '공개 저장소와 공식 논문 출처를 선별·검색한 자료이며 전수 목록이 아닙니다.';
  return `<div class="coverage">${escape(coverage)}<details><summary>수집 기준과 데이터의 한계</summary><p>Main은 현재 시각으로부터 정확히 7일 전까지의 GitHub 원본 created_at만 사용합니다. push·업데이트·릴리스 시각은 신규 저장소 판정에 사용하지 않습니다. History는 KST 2026.01.01 이후 생성된 저장소이며, 이전 저장소는 별도 참고 목록입니다.</p><p>논문 날짜는 arXiv 최초 제출일(UTC)입니다. 논문 요약과 타임라인은 선별 자료이며, arXiv 등록은 동료 심사를 의미하지 않습니다. Stars는 수집 시점의 누적값으로 성장량이 아닙니다. ${escape(data.meta.limitations_ko || '')}</p><p>${link(new URL('data/meta.json',document.baseURI).href,'수집 방법·검색 범위 JSON')} · ${link(new URL('data/repos.json',document.baseURI).href,'저장소 데이터 JSON')}</p></details></div>`;
}
function controlsHTML() {
  const {tab}=state, filter=state.filters[tab];
  const options=tab==='paper'?[['date-desc','최초 제출 최신순'],['date-asc','최초 제출 오래된순']]:[['stars-desc','★ Stars 높은순'],['stars-asc','☆ Stars 낮은순'],['date-desc','생성일 최신순'],['date-asc','생성일 오래된순']];
  return `<div class="controls ${tab==='paper'?'paper-controls':''}" role="search" aria-label="${tab==='paper'?'논문':'저장소'} 검색 및 필터"><label class="search-label" for="search">${tab==='paper'?'논문 검색':'저장소 검색'}<input type="search" id="search" value="${escape(filter.query)}" placeholder="${tab==='paper'?'제목, 요약, 연구 분야 검색':'이름, 소유자, 설명, 분야 검색'}" autocomplete="off"></label>${tab==='paper'?'':`<label for="min-stars">최소 Stars<input id="min-stars" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${escape(filter.minStars)}"></label>`}<label for="sort">정렬<select id="sort">${options.map(([value,label])=>`<option value="${value}" ${value===filter.sort?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" class="clear-button" id="clear">초기화</button></div>`;
}
function archiveBodyHTML() {
  if(state.snapshotLoading) return '<div class="loading" role="status">수집 원본을 불러오는 중…</div>';
  if(state.snapshotError) return `<div class="banner" role="alert">${escape(state.snapshotError)}<button type="button" id="snapshot-retry">이 기록 다시 불러오기</button></div>`;
  const brief=currentBrief();
  return `${briefHTML(brief,true)}<p><small>${state.chosen?'아래 목록과 Stars는 선택한 수집 원본의 값입니다.':'아래 목록은 가장 최근에 수집한 전체 데이터입니다.'} 브리핑은 해당 수집 시점의 최근 7일을 요약합니다.</small><small>저장된 스냅샷은 덮어쓰지 않습니다. 수집 이전 날짜의 브리핑은 소급 생성하지 않습니다.</small>${brief?snapshotPath(brief.snapshot_url)?`<a class="note" href="${escape(brief.snapshot_url)}" target="_blank" rel="noopener noreferrer">${escape(kstDate(brief.collected_at))} 전체 수집 원본 JSON ↗</a>`:'':''}</p>`;
}
async function chooseSnapshot(id, redraw=true) {
  const generation=++snapshotGeneration;
  state.chosen=id;state.snapshot=null;state.snapshotError='';state.snapshotLoading=Boolean(id);
  if(redraw && state.tab==='history'){ $('#archive-body').innerHTML=archiveBodyHTML();renderFeed(); }
  if(id) {
    try {
      const brief=state.data.briefs.find(b=>b.id===id);
      const path=snapshotPath(brief?.snapshot_url);
      if(!path) throw new Error('스냅샷 경로가 올바르지 않습니다');
      const raw=await fetchJSON(path);
      if(raw.id!==id || !Number.isFinite(time(raw.collected_at))) throw new Error('스냅샷 식별자 또는 수집 시각이 일치하지 않습니다');
      const repos=normalizeRepos(raw.repos);
      if(repos.rejected) throw new Error('스냅샷 저장소의 필수 데이터가 누락되었습니다');
      if(generation!==snapshotGeneration)return;
      state.snapshot={...raw,repos:repos.items};
    } catch(error) {if(generation!==snapshotGeneration)return;state.snapshotError=`선택한 수집 원본을 불러오지 못했습니다: ${error.message}`;}
  }
  if(generation!==snapshotGeneration)return;
  state.snapshotLoading=false;
  if(redraw && state.tab==='history'){ $('#archive-body').innerHTML=archiveBodyHTML();$('#snapshot-retry')?.addEventListener('click',()=>chooseSnapshot(state.chosen));renderFeed(); }
}
function renderFeed() {
  if(!state.data || !$('#results'))return;
  const {tab,data}=state, now=Date.now(), filter=state.filters[tab];
  const isPaper=tab==='paper', available=isPaper?data.available.papers:(tab==='history'&&state.snapshot?true:data.available.repos);
  const source=tab==='history'?currentRepos():data.repos;
  const shown=isPaper?filterPapers(data.papers,{...filter,now}):filterRepos(source,{...filter,tab,now,asOf:tab==='history'?currentAsOf():now});
  const total=isPaper?filterPapers(data.papers,{now}).length:filterRepos(source,{tab,now,asOf:tab==='history'?currentAsOf():now}).length;
  const blocked=tab==='history' && state.chosen && (state.snapshotLoading || state.snapshotError);
  $('#count').textContent=blocked||!available?'—':shown.length;
  $('#results-note').textContent=blocked?'선택한 수집 원본이 준비되면 목록을 표시합니다':!available?'이 목록의 데이터를 불러오지 못했습니다':`${shown.length} / ${total}개 표시${filter.query?` · 검색: ${filter.query}`:''}${!isPaper&&Number(filter.minStars)>0?` · ${Number(filter.minStars).toLocaleString('ko-KR')} Stars 이상`:''}${tab==='history'?' · 원본 저장소 생성일 기준':''}`;
  $('#window-label').textContent=tab==='main'?`${kstStamp(now-7*DAY)} — 현재` : tab==='history'?`2026-01-01 00:00 KST — ${state.chosen?kstStamp(currentAsOf()):'현재'}`:'arXiv 최초 제출일 · 날짜 원문 UTC 기준';
  if($('#weekly-count'))$('#weekly-count').textContent=data.available.repos?String(filterRepos(data.repos,{now}).length).padStart(2,'0'):'—';
  let html='';
  if(blocked) html=`<div class="empty" role="status">${state.snapshotLoading?'수집 원본을 불러오는 중…':'선택한 기록을 확인할 수 없습니다. 위에서 다시 불러오거나 최신 데이터를 선택해 주세요.'}</div>`;
  else if(!available) html='<div class="empty">이 목록의 데이터를 불러오지 못했습니다.<p>상단의 데이터 새로고침으로 다시 시도해 주세요.</p></div>';
  else if(!shown.length) html=`<div class="empty">${filter.query||Number(filter.minStars)>0?'검색·필터에 맞는 항목이 없습니다.':'이 범위에서 수집된 항목이 없습니다.'}<p>${tab==='main'?'오래된 저장소의 새 push는 최근 7일 목록에 포함하지 않습니다. History에서 이전 기록을 확인할 수 있습니다.':'검색어 또는 최소 Stars를 바꾸거나 다른 수집 기록을 확인해 보세요.'}</p></div>`;
  else html=shown.map((item,index)=>rowHTML(item,index,isPaper)).join('');
  $('#results').innerHTML=html;
  $('#legacy').innerHTML='';
  if(tab==='history'&&!blocked&&available) {
    const legacy=filterRepos(source,{...filter,tab,legacy:true,now,asOf:currentAsOf()});
    if(legacy.length) $('#legacy').innerHTML=`<details class="legacy"><summary>2026년 이전에 생성된 참고 프로젝트 · ${legacy.length}개 (위 아카이브 수에 포함하지 않음)</summary><p class="note">에이전트 생태계의 배경 자료입니다. 2026년 push·릴리스가 있더라도 신규 저장소로 표시하지 않습니다.</p>${legacy.map((repo,index)=>rowHTML(repo,index,false)).join('')}</details>`;
  }
}
function rowHTML(item,index,isPaper) {
  const date=isPaper?item.date:item.created_at;
  const dateLabel=isPaper?String(date).slice(0,10):kstDate(date);
  return `<article class="row"><span class="index" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div class="entry"><div class="entrytop">${link(item.url,isPaper?item.title:item.name)}${item.category?`<span class="category">${escape(item.category)}</span>`:''}</div><p>${escape(item.description_ko || item.summary || item.description || '검증된 한국어 요약이 아직 없습니다.')}</p>${item.lineage_note_ko?`<p class="lineage">${escape(item.lineage_note_ko)}</p>`:''}<div class="entrylinks">${item.source_url && item.source_url!==item.url?link(item.source_url,'원본 데이터 ↗'):''}${item.description_source_url?link(item.description_source_url,'설명 출처 ↗'):''}${!isPaper&&item.language?`<span>${escape(item.language)}</span>`:''}${item.observed_at||item.collected_at?`<span title="${escape(item.collected_at||item.observed_at)}">수집 ${escape(kstDate(item.collected_at||item.observed_at))}</span>`:''}</div></div><div class="meta">${isPaper?'':`<strong title="${Number(item.stars).toLocaleString('ko-KR')} Stars">☆ ${starNumber(item.stars)}</strong>`}<time datetime="${escape(date)}" title="원문 날짜: ${escape(date)}">${escape(dateLabel)}</time><small>${isPaper?'최초 제출 · UTC':'원본 생성 · KST'}</small></div></article>`;
}
function timelineHTML() {
  const milestones=state.data.timeline.filter(item=>time(item.date)<=Date.now());
  if(!milestones.length)return '<div class="empty">표시할 검증된 이정표가 없습니다.</div>';
  return `<div class="rail" tabindex="0" aria-label="발전 타임라인, 가로 스크롤">${milestones.map(item=>`<article class="milestone"><span class="node" aria-hidden="true"></span><time datetime="${escape(item.date)}">${escape(String(item.date).slice(0,10))}</time><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p>${link(item.source_url,'원문 확인 ↗')}</article>`).join('')}</div>`;
}
function selectTab(tab,focus=false) {
  if(!['main','history','paper'].includes(tab))return;
  state.tab=tab;
  if(location.hash!==`#${tab}`)history.replaceState(null,'',`#${tab}`);
  if(state.data)render(); else updateTabs();
  if(focus)$(`#tab-${tab}`).focus();
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
$('.tabs').addEventListener('keydown',event=>{
  const tabs=['main','history','paper'];let next=tabs.indexOf(state.tab);
  if(event.key==='ArrowRight')next=(next+1)%3;else if(event.key==='ArrowLeft')next=(next+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
  event.preventDefault();selectTab(tabs[next],true);
});
window.addEventListener('hashchange',()=>selectTab(location.hash.slice(1)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderFeed();});
setInterval(()=>{if(!document.hidden)renderFeed();},60_000);
updateTabs();
load();
