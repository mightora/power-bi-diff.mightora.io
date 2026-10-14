import { parseUpload, parseFiles, compare, releaseNotes, stableString, LABELS, TYPES } from './engine.js';
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const state = { before: null, after: null, result: null, selected: null, category: 'all', status: 'changed', search: '' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name,size=20) => {
 const paths = { compare:'<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3"/>',upload:'<path d="M12 21V9m-5 5 5-5 5 5M4 5v-2h16v2"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',check:'<path d="m5 12 5 5L20 7"/>',file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/>',code:'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-12-2 20"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v5m0-9v.1"/>',eye:'<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',chart:'<path d="M3 3v18h18M7 16v-5m5 5V6m5 10v-8"/>'};
 return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.file}</svg>`;
};
function status(message, kind='info') { const el = $('#toast'); el.className = `toast ${kind}`; el.textContent=message; el.hidden=false; clearTimeout(status.timer); status.timer=setTimeout(()=>el.hidden=true,5500); }
function setLoaded(which,snap) {
 state[which] = snap;
 const wrap = $(`#slot-${which}`); wrap.classList.add('ready'); wrap.classList.remove('upload-error');
 wrap.querySelector('.upload-title').textContent = snap.name;
 wrap.querySelector('.upload-meta').textContent = `${snap.source} · ${snap.inspectedFiles} readable file${snap.inspectedFiles === 1 ? '' : 's'}`;
 wrap.querySelector('.upload-icon').innerHTML = icon('check',22);
 $(`#reset-${which}`).hidden=false;
 $('#compare-btn').disabled = !(state.before && state.after);
 $('#compare-hint').textContent = (state.before && state.after) ? 'Ready to compare both versions.' : 'Add a baseline and an updated report to get started.';
 if (state.result) { state.result=null; $('#results').hidden=true; }
}
async function processFiles(which,files) {
 if (!files?.length) return;
 const slot = $(`#slot-${which}`); slot.setAttribute('aria-busy','true');
 try { const snap = await parseUpload(files.length === 1 ? files[0].name : `${which === 'before' ? 'Baseline' : 'Updated'} project folder`,files); setLoaded(which,snap); status(`${which === 'before'?'Baseline':'Updated'} version loaded.`, 'success'); }
 catch(err) { console.error(err); slot.classList.add('upload-error'); slot.querySelector('.upload-meta').textContent=err.message; status(err.message,'error'); }
 finally { slot.removeAttribute('aria-busy'); }
}
for (const which of ['before','after']) {
 const slot = $(`#slot-${which}`);
 $(`#file-${which}`).addEventListener('change', e => processFiles(which,[...e.target.files]));
 $(`#folder-${which}`).addEventListener('change', e => processFiles(which,[...e.target.files]));
 for (const eventName of ['dragenter','dragover']) slot.addEventListener(eventName,e=>{e.preventDefault();slot.classList.add('dragging')});
 for (const eventName of ['dragleave','drop']) slot.addEventListener(eventName,e=>{e.preventDefault();slot.classList.remove('dragging')});
 slot.addEventListener('drop', e=>processFiles(which,[...e.dataTransfer.files]));
 $(`#reset-${which}`).addEventListener('click', e=>{ e.preventDefault(); state[which]=null;state.result=null; slot.classList.remove('ready','upload-error');slot.querySelector('.upload-title').textContent=which==='before'?'Baseline version':'Updated version';slot.querySelector('.upload-meta').textContent='PBIP project ZIP / folder · PBIX / PBIT';slot.querySelector('.upload-icon').innerHTML=icon('upload',22);$(`#file-${which}`).value='';$(`#folder-${which}`).value='';e.currentTarget.hidden=true; $('#results').hidden=true;$('#compare-btn').disabled=true;$('#compare-hint').textContent='Add both versions to compare.';});
}
function badgeFor(kind,text) {return `<span class="tag tag-${kind}">${escapeHtml(text)}</span>`;}
function showResult(result) {
 state.result = result; state.selected = result.changed[0] || result.items[0] || null;
 $('#results').hidden=false;
 $('#result-subtitle').textContent = `${result.before} → ${result.after}`;
 for(const kind of ['added','modified','removed','unchanged']) $(`#stat-${kind}`).textContent=result.totals[kind];
 $('#stat-unverified').textContent=result.totals.unverified;
 const warnings = result.coverage.filter(c=>c.status === 'unavailable');
 $('#coverage-message').innerHTML = warnings.length ? `${icon('info',18)} <div><strong>${warnings.length} categories could not be fully verified.</strong> ${warnings.map(w=>escapeHtml(w.label)).join(', ')}. Missing metadata is never treated as unchanged. <a href="#limitations">Review format limitations</a>.</div>` : `${icon('check',18)} <div><strong>All eight categories compared.</strong> This is a structural metadata comparison, not a full functional test.</div>`;
 $('#coverage-message').className = 'coverage-banner ' + (warnings.length ? 'notice' : 'complete');
 const cats = [{type:'all',label:'All changes'},...TYPES.map(t=>({type:t,label:LABELS[t]}))];
 $('#category-tabs').innerHTML=cats.map(c=>{const ct=c.type==='all'?result.changed.length:result.changed.filter(x=>x.type===c.type).length; return `<button class="category-tab ${state.category===c.type?'active':''}" data-category="${c.type}" aria-pressed="${state.category===c.type}"><span>${escapeHtml(c.label)}</span><span class="tab-count">${ct}</span></button>`;}).join('');
 $$('#category-tabs [data-category]').forEach(el=>el.addEventListener('click',()=>{state.category=el.dataset.category;showResult(state.result)}));
 $('#coverage-table').innerHTML=result.coverage.map(c=>`<div class="coverage-row"><span>${escapeHtml(c.label)}</span>${badgeFor(c.status==='compared'?'compared':'unavailable',c.status==='compared'?'Compared':'Not verified')}</div>`).join('');
 $('#warnings-list').innerHTML=result.warnings.length ? result.warnings.map(x=>`<li>${escapeHtml(x)}</li>`).join('') : '<li>No additional parsing warnings.</li>';
 $('#release-preview').textContent=releaseNotes(result);
 renderChanges();
 $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderLineDiff(oldText,newText) {
  const a=oldText.split('\n'),b=newText.split('\n');
  // Bounded LCS to avoid blocking the UI on unexpectedly massive metadata values.
  if(a.length>300 || b.length>300) return [escapeHtml(oldText),escapeHtml(newText)];
  const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
    dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const left=[],right=[];let i=0,j=0;
  while(i<a.length || j<b.length){
    if(i<a.length && j<b.length && a[i]===b[j]){left.push(escapeHtml(a[i]));right.push(escapeHtml(b[j]));i++;j++;}
    else if(i<a.length && (j===b.length||dp[i+1][j]>=dp[i][j+1])){left.push(`<span class="line-removed">${escapeHtml(a[i])}</span>`);i++;}
    else if(j<b.length){right.push(`<span class="line-added">${escapeHtml(b[j])}</span>`);j++;}
  }
  return [left.join('\n'),right.join('\n')];
}
function renderChanges() {
 const r=state.result;if (!r)return;
 const query=state.search.trim().toLowerCase();
 const shown=r.items.filter(i=>(state.status==='all'||i.status!=='unchanged') && (state.category==='all'||i.type===state.category) && (!query || [i.label,i.id,i.category,i.status].join(' ').toLowerCase().includes(query)));
 $('#visible-count').textContent=`${shown.length} item${shown.length===1?'':'s'}`;
 $('#change-list').innerHTML=shown.length?shown.map(i=>`<button class="change-item ${state.selected?.type===i.type && state.selected?.id===i.id?'selected':''}" data-key="${escapeHtml(i.type+':'+i.id)}" aria-pressed="${state.selected?.type===i.type && state.selected?.id===i.id}"><span class="change-type">${escapeHtml(i.category)}</span><strong>${escapeHtml(i.label)}</strong>${badgeFor(i.status,i.status)}</button>`).join(''):'<p class="no-results">No changes match these filters.</p>';
 $$('#change-list [data-key]').forEach(el=>el.addEventListener('click',()=>{state.selected=r.items.find(i=>i.type+':'+i.id===el.dataset.key); renderChanges();}));
 if (!shown.includes(state.selected)) state.selected=shown[0]||null;
 $$('#change-list [data-key]').forEach(el=>el.classList.toggle('selected',el.dataset.key===state.selected?.type+':'+state.selected?.id));
 const item=state.selected;
 $('#diff-title').textContent=item?.label||'Select a change';
 $('#diff-category').innerHTML=item?badgeFor(item.status,item.status)+' '+escapeHtml(item.category):'';
 $('#diff-before').textContent=item ? (item.before === undefined ? '— Not present in baseline —' : stableString(item.before)) : 'Select an item in the change list.';
 $('#diff-after').textContent=item ? (item.after === undefined ? '— Not present in updated version —' : stableString(item.after)) : 'Select an item in the change list.';
 $('#diff-before').classList.toggle('dim',item?.before===undefined);
 $('#diff-after').classList.toggle('dim',item?.after===undefined);
}
$('#compare-btn').addEventListener('click',()=>{try {state.category='all';state.status='changed';state.search='';$('#change-search').value='';$('#show-unchanged').checked=false;showResult(compare(state.before,state.after));status('Comparison complete. Your files stayed in this browser.','success');}catch(e){status(e.message,'error')}});
$('#change-search').addEventListener('input',e=>{state.search=e.target.value;renderChanges();});
$('#show-unchanged').addEventListener('change',e=>{state.status=e.target.checked?'all':'changed';renderChanges();});
function download(content,name,type) {const a=document.createElement('a');const uri=URL.createObjectURL(new Blob([content],{type}));a.href=uri;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(uri),2000);}
function checkDiff(){if(!state.result){status('Compare two versions first.','error');return false;}return true;}
$('#download-markdown').addEventListener('click',()=>{if(checkDiff())download(releaseNotes(state.result),'power-bi-release-notes.md','text/markdown;charset=utf-8');});
$('#download-json').addEventListener('click',()=>{if(checkDiff())download(JSON.stringify(state.result,null,2),'power-bi-change-report.json','application/json');});
$('#download-html').addEventListener('click',()=>{if(!checkDiff())return;const r=state.result;const content=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Power BI Change Report</title><style>body{font:16px system-ui;max-width:920px;margin:40px auto;padding:0 24px;color:#17243a}h1,h2{color:#14366c}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #cdd9e6;text-align:left}tr:nth-child(even){background:#f5f8fc}small{color:#536479}</style><h1>Power BI Change Report</h1><p><strong>Baseline:</strong> ${escapeHtml(r.before)} → <strong>Updated:</strong> ${escapeHtml(r.after)}</p><p>Added ${r.totals.added} · Modified ${r.totals.modified} · Removed ${r.totals.removed} · Unverified categories ${r.totals.unverified}</p><h2>Changes</h2><table><thead><tr><th>Area</th><th>Item</th><th>Status</th></tr></thead><tbody>${r.changed.map(i=>`<tr><td>${escapeHtml(i.category)}</td><td>${escapeHtml(i.label)}</td><td>${escapeHtml(i.status)}</td></tr>`).join('')}</tbody></table><h2>Coverage</h2>${r.coverage.map(c=>`<p>${escapeHtml(c.label)}: ${escapeHtml(c.status)}</p>`).join('')}<h2>Release notes</h2><pre style="white-space:pre-wrap">${escapeHtml(releaseNotes(r))}</pre><small>Generated locally by Mightora · Structural metadata only</small></html>`;download(content,'power-bi-change-report.html','text/html;charset=utf-8');});
$('#copy-markdown').addEventListener('click',async()=>{if(!checkDiff())return;try{await navigator.clipboard.writeText(releaseNotes(state.result));status('Markdown copied to clipboard.','success');}catch{status('Clipboard unavailable here. Use Download Markdown.','error');}});
function example(name,modified) {
 const entities=Object.fromEntries(TYPES.map(t=>[t,{}]));
 const add=(t,k,label,value)=>entities[t][k]={id:k,label,value};
 add('pages','overview','Executive overview',{name:'Executive overview',width:1280,height:720,order:1});
 add('pages','regional','Regional performance',{name:'Regional performance',width:1280,height:720,order:2});
 if(modified)add('pages','forecast','Revenue forecast',{name:'Revenue forecast',width:1280,height:720,order:3});
 add('visuals','overview/revenue','Executive overview · Revenue by month',{type:'lineChart',position:{x:40,y:120,width:modified?670:600,height:330},query:{measure:'Sales.[Revenue]',axis:'Date.[Month]'}});
 add('visuals','regional/map','Regional performance · Regional map',{type:'map',position:{x:30,y:90,width:700,height:450}});
 if(modified)add('visuals','forecast/card','Revenue forecast · Projected revenue',{type:'cardVisual',position:{x:25,y:90,width:350,height:210}});
 add('measures','Sales.[Revenue]','Sales · Revenue',{dax:modified?'SUM(Sales[Amount]) - SUM(Sales[Returns])':'SUM(Sales[Amount])',properties:['formatString: £#,0']});
 add('measures','Sales.[Revenue Growth]','Sales · Revenue Growth',{dax:'DIVIDE([Revenue]-[Last Year Revenue],[Last Year Revenue])'});
 if(modified)add('measures','Sales.[Forecast]','Sales · Forecast',{dax:'[Revenue] * 1.08'});
 add('relationships','sales-date','Sales.DateKey → Date.DateKey',{fromColumn:'Sales.DateKey',toColumn:'Date.DateKey',isActive:true,crossFilteringBehavior:modified?'bothDirections':'oneDirection'});
 add('filters','report','Report filters',{year:modified?2026:2025});
 add('bookmarks','executive','Executive summary',{name:'executive',displayName:'Executive summary',targetPage:'overview'});
 if(!modified)add('bookmarks','old','Previous quarter',{name:'old',displayName:'Previous quarter'});
 add('formatting','visual:overview/revenue','Revenue chart formatting',{color:modified?'#1d63dc':'#29679f',showLabels:modified});
 add('settings','report','Report settings',{defaultPage:'overview',crossHighlighting:modified});
 return {format:'mightora-report-snapshot-v1',name,source:'Demo snapshot',supported:Object.fromEntries(TYPES.map(t=>[t,true])),entities,warnings:[],inspectedFiles:1};
}
$('#explore-sample').addEventListener('click',()=>$('#load-demo').click());
$('#load-demo').addEventListener('click',()=>{setLoaded('before',parseFiles('Quarterly Sales — v1',{'before.json':JSON.stringify(example('v1',false))}));setLoaded('after',parseFiles('Quarterly Sales — v2',{'after.json':JSON.stringify(example('v2',true))}));$('#compare-btn').click();});
$('#mobile-menu').addEventListener('click',()=>{const n=$('#fallback-nav');const show=n.classList.toggle('open');$('#mobile-menu').setAttribute('aria-expanded',String(show));});
$$('#fallback-nav a').forEach(a=>a.addEventListener('click',()=>$('#fallback-nav').classList.remove('open')));
function updateRequests() {
 const entries=performance.getEntriesByType?.('resource')||[];
 const byOrigin=new Map();for(const e of entries){try{const url=new URL(e.name);const key=url.origin;if(!byOrigin.has(key))byOrigin.set(key,0);byOrigin.set(key,byOrigin.get(key)+1);}catch{}}
 const el=$('#network-summary');
 if(!el)return;
 const offline=document.documentElement.dataset.edition==='offline';
 el.innerHTML=`<strong>${entries.length}</strong> browser-observed resource request${entries.length===1?'':'s'} · <strong>${byOrigin.size}</strong> origin${byOrigin.size===1?'':'s'}<div class="network-list">${[...byOrigin.entries()].map(([origin,count])=>`<span>${escapeHtml(origin)} (${count})</span>`).join('') || (offline?'No application resource requests detected.':'No resource requests recorded yet.')}</div>`;
}
$('#check-network').addEventListener('click',updateRequests);window.addEventListener('load',()=>setTimeout(updateRequests,100));
const isOffline = document.documentElement.dataset.edition === 'offline';
if(isOffline){$('#offline-banner').hidden=false;$$('[data-online-only]').forEach(el=>el.hidden=true);$('#network-note').textContent='Offline mode performs no application network requests. Inspect the browser Network tab to verify; extensions and browser services are outside the application’s control.';}
else {$('#online-banner').hidden=false;}
window.addEventListener('error', e=>console.error('Application error',e.error));
