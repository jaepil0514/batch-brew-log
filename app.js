import {TYPES,PREFIXES,today,dayOffset,entries,currentEntry,history,normalized,latestForRow,rowKey,changedFields,safeImage} from './data.js';
import {BrewStore} from './sync.js';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config=window.BATCH_BREW_CLOUD||{};
const isPreview=config.readOnly!==false;
const form=$('#recipeForm');let editor=null;let syncTimer;let logLimit=7;let installEvent;
const dateLabel=date=>new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'Australia/Melbourne'});
const timeLabel=value=>value?new Date(value).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Australia/Melbourne'}):'Legacy record';
const display=value=>value===''||value==null?'—':escape(value);
function getStaff(){return $('#staff').value==='Other'?$('#otherStaff').value.trim():$('#staff').value;}
try{const staff=JSON.parse(localStorage.getItem('cru-staff')||'null');if(staff){$('#staff').value=staff.choice;$('#otherStaff').value=staff.name||'';}}catch{}
$('#otherStaff').hidden=$('#staff').value!=='Other';
function updateStaff(){
  $('#otherStaff').hidden=$('#staff').value!=='Other';
  try{localStorage.setItem('cru-staff',JSON.stringify({choice:$('#staff').value,name:$('#otherStaff').value}));}catch{}
  if(editor){form.elements.barista.value=getStaff();captureEdit();}
}
$('#staff').addEventListener('change',updateStaff);$('#otherStaff').addEventListener('input',updateStaff);
$('#previewBanner').hidden=!isPreview;
$('#serviceDate').textContent=`Service · ${dateLabel(today())}`;
if(config.brandLogo){const img=document.createElement('img');img.src=config.brandLogo;img.alt='CRU+ clover logo';img.className='brand-logo';img.addEventListener('error',()=>img.replaceWith(Object.assign(document.createElement('span'),{className:'wordmark',textContent:'CRU+'})));$('#brandLogo').replaceWith(img);}
const store=new BrewStore(config,{onChange:()=>{render();}});
function state(){
  $('#saveState').textContent=store.message;$('#saveState').dataset.state=store.status;
  $('#drawerState').textContent=store.message;$('#retry').hidden=!['error','conflict','pending'].includes(store.status)||isPreview;
  $('#conflictActions').hidden=!store.conflict;
  $('#footerState').textContent=isPreview?'Preview · cloud reads only · drafts on this device':`Cloud records · ${store.queue.length} pending updates`;
}
function render(){
  state();if(store.status==='saved'&&!store.queue.length){for(const prefix of PREFIXES){const row=store.rows.find(r=>r.record_date===rowKey(today(),prefix));if(!row)continue;try{const key=`${store.key}:editor:${prefix}:${today()}`,cached=JSON.parse(localStorage.getItem(key)||'null');if(cached&&!Object.keys(changedFields(latestForRow(row,prefix),cached)).length)localStorage.removeItem(key);}catch{}}}
  if(!store.loaded){$('#currentCards').innerHTML=PREFIXES.map(p=>`<button class="recipe-card" disabled><span class="coffee-art placeholder">＋</span><span><span class="recipe-label">${TYPES[p]}</span><p class="recipe-origin">Waiting for cloud</p></span></button>`).join('');$('#logs').innerHTML='<div class="empty">Cloud records have not loaded. Check your connection and refresh.</div>';return;}
  const rows=store.optimisticRows();renderCards(rows);renderLogs(rows);renderTrends(rows);
}
function renderCards(rows){
  $('#currentCards').innerHTML=PREFIXES.map(prefix=>{
    const entry=currentEntry(rows,prefix);const value=entry?.value;
    const pending=store.queue.some(o=>o.prefix===prefix);const image=safeImage(value?.image);
    return `<button class="recipe-card ${value?.active===false?'inactive':''}" data-open="${prefix}" aria-label="Edit ${TYPES[prefix]} recipe"><span>${image?`<img class="coffee-art" src="${image}" alt="${escape(value.origin||TYPES[prefix])} coffee">`:'<span class="coffee-art placeholder" aria-hidden="true">＋</span>'}</span><span class="recipe-info"><p class="recipe-label">${TYPES[prefix]}</p><p class="recipe-origin">${escape(value?.origin || (entry?'Coffee details not set':'No saved recipe'))}</p><span class="recipe-values"><span>EK <strong>${display(value?.ek)}</strong></span><span>Dose <strong>${display(value?.dose)}</strong>${value?.dose?'g':''}</span></span></span><span class="recipe-updated"><span>${entry?`${timeLabel(entry.snapshot.savedAt)} · ${escape(value.barista||'Unknown staff')}`:'Set up recipe'}${value?.active===false?' · Inactive':''}</span><span class="${pending?'draft-tag':''}">${pending?(isPreview?'Draft':'Pending'):'↗'}</span></span></button>`;
  }).join('');
}
function filteredEntries(rows){
  const search=$('#search').value.trim().toLowerCase(),prefix=$('#typeFilter').value,date=$('#dateFilter').value;
  return PREFIXES.filter(p=>!prefix||p===prefix).flatMap(p=>entries(rows,p)).filter(e=>(!date||e.date===date)&&(!search||[TYPES[e.prefix],...Object.values(e.snapshot).filter(v=>typeof v!=='object')].join(' ').toLowerCase().includes(search)));
}
function renderLogs(rows){
  const all=filteredEntries(rows);const days=[...new Set(all.map(e=>e.date))].sort().reverse();
  $('#logCount').textContent=`${days.length} service days · ${all.length} revisions`;
  $('#moreLogs').hidden=days.length<=logLimit;
  if(!days.length){$('#logs').innerHTML='<div class="empty">No saved logs match this view.<br>Choose a recipe to record today’s service.</div>';return;}
  $('#logs').innerHTML=days.slice(0,logLimit).map(date=>{
    const daily=all.filter(e=>e.date===date);
    return `<article class="log-day"><div class="day-heading"><strong>${dateLabel(date)}${date===today()?' · Today':''}</strong><span class="muted">${daily.length} revisions</span></div><div class="log-rows">${PREFIXES.map(prefix=>{
      const revisions=daily.filter(e=>e.prefix===prefix);if(!revisions.length)return '';const entry=revisions.at(-1),v=entry.value;
      return `<div class="log-row"><div class="log-row-content"><strong>${TYPES[prefix]}</strong><p>${escape(v.origin||'Coffee details not set')}</p><p>EK ${display(v.ek)} · Dose ${display(v.dose)}${v.dose?'g':''}</p><small>${escape(v.barista||'Unknown staff')} · ${revisions.length} revision${revisions.length===1?'':'s'}${v.adjustmentReason?' · '+escape(v.adjustmentReason):''}</small></div><button class="quiet" data-history="${prefix}" data-date="${escape(date)}">History</button></div>`;
    }).join('')}</div></article>`;
  }).join('');
}
function trendData(rows,prefix){
  const all=entries(rows,prefix),days=Array.from({length:7},(_,i)=>dayOffset(today(),i-6));
  const points=days.map(date=>{const last=all.filter(e=>e.date<=date).at(-1);return {date,value:last?.value,carried:last&&last.date!==date};});
  const changes=all.map((e,i)=>({entry:e,before:all[i-1]?.value,after:e.value})).filter(c=>days.includes(c.entry.date)&&c.before&&Object.keys(changedFields(c.before,c.after)).length);
  return {points,changes,days};
}
function renderTrends(rows){
  const prefix=$('#trendType').value,{points,changes,days}=trendData(rows,prefix);
  $('#trendRange').textContent=`${dateLabel(days[0])} – ${dateLabel(days[6])} · Last recipe each day; held values carry forward. Gold dots mark changes.`;
  $('#charts').innerHTML=['ek','dose'].map(key=>chart(points,changes,key)).join('');
  $('#changes').innerHTML=changes.length?changes.slice().reverse().map(c=>{
    const parts=['ek','dose'].filter(k=>c.before[k]!==c.after[k]).map(k=>`${k==='ek'?'EK':'Dose'} ${display(c.before[k])} → ${display(c.after[k])}${k==='dose'?'g':''}`);
    return `<div class="change"><div><strong>${parts.join(' · ')||'Recipe details updated'}</strong><small>${dateLabel(c.entry.date)} · ${timeLabel(c.entry.snapshot.savedAt)} · ${escape(c.after.barista||'Unknown staff')}</small><p class="muted">${escape(c.after.adjustmentReason||'No adjustment reason recorded')}</p></div><button class="quiet" data-history="${prefix}" data-date="${c.entry.date}">View change</button></div>`;
  }).join(''):'<div class="empty">No recipe changes recorded in these 7 days.</div>';
}
function chart(points,changes,key){
  const numeric=points.map(p=>p.value?.[key]!==''&&p.value?.[key]!=null&&Number.isFinite(Number(p.value[key]))?Number(p.value[key]):null);
  const values=numeric.filter(v=>v!==null),label=key==='ek'?'EK / grind':'Dose (g)';
  if(!values.length)return `<article class="chart"><h3>${label}</h3><p class="muted">No saved measurements in this period.</p></article>`;
  const min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.2,key==='ek'?.25:1),low=min-pad,high=max+pad;
  const x=i=>44+i*62,y=v=>130-(v-low)/(high-low)*95;
  let paths=[],segment=[];numeric.forEach((v,i)=>{if(v===null){if(segment.length)paths.push(segment.join(' '));segment=[];}else segment.push(`${segment.length?'L':'M'}${x(i)},${y(v)}`);});if(segment.length)paths.push(segment.join(' '));
  return `<article class="chart"><div class="chart-head"><h3>${label}</h3><span>Current ${display(values.at(-1))}${key==='dose'?'g':''}</span></div><svg viewBox="0 0 445 182" role="img" aria-label="${label} daily trend"><title>${points.map((p,i)=>`${p.date}: ${numeric[i]??'no data'}${p.carried?' carried forward':''}`).join('; ')}</title>${[low,(low+high)/2,high].map(v=>`<line class="grid" x1="42" x2="421" y1="${y(v)}" y2="${y(v)}"/><text x="3" y="${y(v)+3}">${v.toFixed(key==='ek'?2:1)}</text>`).join('')}${paths.map(d=>`<path class="trend-line" d="${d}"/>`).join('')}${points.map((p,i)=>{const v=numeric[i],marked=changes.some(c=>c.entry.date===p.date);return `<text x="${x(i)}" y="167" text-anchor="middle">${new Date(`${p.date}T12:00Z`).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})}</text>${v!==null?`<circle cx="${x(i)}" cy="${y(v)}" r="4"><title>${v}${p.carried?' · held from previous service':''}</title></circle>${marked?`<g data-marker="${p.date}" role="button" tabindex="0" aria-label="View recipe changes on ${p.date}"><circle class="marker" cx="${x(i)}" cy="145" r="5"/><circle class="hit" cx="${x(i)}" cy="145" r="18"/></g>`:''}`:''}`;}).join('')}</svg></article>`;
}
function fillForm(prefix,date,source){
  editor={prefix,date,image:source.image||'',lastValue:null};
  const value={...normalized(source,prefix),date,recipeType:prefix,barista:getStaff(),prepTime:source.prepTime||'',adjustmentReason:''};
  for(const input of form.elements){if(!input.name)continue;if(input.type==='checkbox')input.checked=value[input.name]!==false;else input.value=value[input.name]??'';}
  form.elements.recipeType.value=prefix;form.elements.recipeType.disabled=true;$('#drawerType').textContent=TYPES[prefix];
  $('#drawerHint').textContent=isPreview?'Preview edits save on this device. Cloud writes are disabled.':'Changes save about one second after you stop typing. Earlier revisions are kept.';
  $('#formError').textContent='';$('#coffeeImage').value='';form.querySelectorAll('[data-cold]').forEach(el=>el.hidden=prefix!=='cold');form.querySelectorAll('[data-decaf]').forEach(el=>el.hidden=prefix!=='decaf');
  updateImagePreview();updateRatio();
}
function openEditor(prefix,date=today(),source){
  if(!store.loaded){$('#saveState').textContent='Load cloud records before editing.';return;}
  const rows=store.optimisticRows(),row=rows.find(r=>r.record_date===rowKey(date,prefix));
  source=source|| (history(row?.payload,prefix).length?latestForRow(row,prefix):currentEntry(rows,prefix)?.value)||normalized({},prefix);
  let cached;try{cached=JSON.parse(localStorage.getItem(`${store.key}:editor:${prefix}:${date}`)||'null');}catch{}
  fillForm(prefix,date,cached||source);if(cached){for(const input of form.elements){if(!input.name||['barista','recipeType'].includes(input.name))continue;if(input.type==='checkbox')input.checked=cached.active!==false;else input.value=cached[input.name]??'';}editor.image=cached.image||'';updateImagePreview();updateRatio();}
  $('#settings').showModal();
  if(!getStaff())$('#formError').textContent='Choose your staff name at the top of the dashboard before editing.';
}
function formValue(){
  const value=Object.fromEntries(new FormData(form));value.active=form.elements.active.checked;value.image=editor.image;value.barista=getStaff();value.recipeType=editor.prefix;return value;
}
function validate(){
  if(!getStaff())return 'Choose your staff name before editing. Close settings to select it.';
  if(!form.checkValidity())return 'Check the highlighted fields and enter valid numbers and dates.';
  const v=formValue();if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||v.date>today())return 'Use today or a previous service date.';
  if(!v.origin&&!v.ek&&!v.dose)return 'Enter a coffee, grind setting or dose to create a recipe.';
  if(v.start&&v.finish&&v.finish<v.start)return 'Cold brew finish must be after its start.';
  return '';
}
function captureEdit(){
  if(!editor)return;updateRatio();
  try{localStorage.setItem(`${store.key}:editor:${editor.prefix}:${form.elements.date.value}`,JSON.stringify(formValue()));}catch{ $('#formError').textContent='Device storage unavailable. Keep this page open; draft is not protected.';return;}
  const error=validate();$('#formError').textContent=error;
  if(error){$('#drawerState').textContent='Not saved · check the fields above';return;}
  const value=formValue();const rows=store.optimisticRows(),row=rows.find(r=>r.record_date===rowKey(value.date,editor.prefix)),base=latestForRow(row,editor.prefix);
  const patch=changedFields(base,value);if(!Object.keys(patch).length)return;
  try{
    store.enqueue({prefix:editor.prefix,date:value.date,patch,base,staff:getStaff(),prepTime:value.prepTime});editor.date=value.date;
    clearTimeout(syncTimer);syncTimer=setTimeout(()=>store.sync(),1000);
  }catch(e){$('#formError').textContent=e.message;}
}
function updateRatio(){if(!editor)return;const dose=Number(form.elements.dose.value),water=Number(form.elements.water.value);$('#ratio').textContent=dose>0&&water>0?`Ratio 1 : ${(water/dose).toFixed(1)}`:'Ratio —';}
function updateImagePreview(){const image=safeImage(editor?.image);$('#imagePreview').innerHTML=image?`<img src="${image}" alt="Selected coffee image">`:'';$('#removeImage').hidden=!image;}
function closeEditor(){
  clearTimeout(syncTimer);store.sync();$('#settings').close();editor=null;
}
form.addEventListener('input',e=>{if(e.target.type!=='file')captureEdit();});form.addEventListener('change',e=>{if(e.target.type!=='file')captureEdit();});
form.addEventListener('submit',e=>e.preventDefault());
form.addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;const [field,delta]=step.dataset.step.split(':');const input=form.elements[field];const next=Math.max(Number(input.min)||0,(Number(input.value)||0)+Number(delta));input.value=Number(next.toFixed(2));captureEdit();});
$('#closeDrawer').addEventListener('click',closeEditor);$('#done').addEventListener('click',closeEditor);
$('#settings').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('#coffeeImage').addEventListener('change',async()=>{
  const file=$('#coffeeImage').files[0];if(!file||!editor)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){$('#formError').textContent='Choose a JPG, PNG or WebP image up to 10 MB.';return;}
  const activeEditor=editor;
  try{
    const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fffefa';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=canvas.toDataURL('image/jpeg',.72);
    if(image.length>220000)throw new Error('Image is too detailed. Choose a smaller image.');
    if(editor!==activeEditor)return;editor.image=image;updateImagePreview();captureEdit();
  }catch(e){$('#formError').textContent=e.message||'Could not read that image.';}
});
$('#removeImage').addEventListener('click',()=>{editor.image='';$('#coffeeImage').value='';updateImagePreview();captureEdit();});
function showHistory(prefix,date){
  const all=entries(store.optimisticRows(),prefix);const selected=all.filter(e=>e.date===date);
  $('#historyTitle').textContent=`${TYPES[prefix]} · ${dateLabel(date)}`;
  $('#historyContent').innerHTML=selected.slice().reverse().map(e=>{
    const previous=all[all.indexOf(e)-1]?.value,changes=previous?changedFields(previous,e.value):{};
    const fields=Object.entries(e.snapshot).filter(([key])=>!['image','mutationId'].includes(key));
    const metrics=['ek','dose'].filter(k=>k in changes).map(k=>`${k==='ek'?'EK':'Dose'}: ${display(previous[k])} → ${display(e.value[k])}`).join(' · ');
    return `<article class="history-revision"><h3>Revision ${e.index+1}${e.snapshot.mutationId&&store.queue.some(o=>o.id===e.snapshot.mutationId)?' · Device draft':''}</h3><p class="muted">${timeLabel(e.snapshot.savedAt)} · ${escape(e.value.barista||'Unknown staff')}</p><p>${metrics||'Recipe details'}</p><p class="muted">${escape(e.value.adjustmentReason||'No adjustment reason recorded')}</p><details><summary>All saved fields</summary><dl>${fields.map(([k,v])=>`<dt>${escape(k)}</dt><dd>${display(typeof v==='object'?JSON.stringify(v):v)}</dd>`).join('')}</dl></details><button class="quiet" data-copy="${prefix}" data-date="${e.date}" data-index="${e.index}">Use for today’s draft</button></article>`;
  }).join('')||'<div class="empty">No revisions on this date.</div>';
  $('#historyDialog').showModal();
}
$('#closeHistory').addEventListener('click',()=>$('#historyDialog').close());
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open]');if(open)openEditor(open.dataset.open);
  const historyButton=e.target.closest('[data-history]');if(historyButton)showHistory(historyButton.dataset.history,historyButton.dataset.date);
  const marker=e.target.closest('[data-marker]');if(marker)showHistory($('#trendType').value,marker.dataset.marker);
  const copy=e.target.closest('[data-copy]');if(copy){const row=store.optimisticRows().find(r=>r.record_date===rowKey(copy.dataset.date,copy.dataset.copy));const snapshot=history(row?.payload,copy.dataset.copy)[Number(copy.dataset.index)];$('#historyDialog').close();openEditor(copy.dataset.copy,today(),normalized(snapshot,copy.dataset.copy,row?.payload));$('#formError').textContent='Review this historical recipe, then edit a field to create a new revision. No history is overwritten.';}
});
$('#charts').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-marker]')){e.preventDefault();showHistory($('#trendType').value,e.target.dataset.marker);}});
for(const id of ['search','typeFilter','dateFilter'])$('#'+id).addEventListener('input',()=>{logLimit=7;renderLogs(store.optimisticRows());});
$('#clearFilters').addEventListener('click',()=>{for(const id of ['search','typeFilter','dateFilter'])$('#'+id).value='';logLimit=7;renderLogs(store.optimisticRows());});
$('#moreLogs').addEventListener('click',()=>{logLimit+=14;renderLogs(store.optimisticRows());});
$('#trendType').addEventListener('change',()=>renderTrends(store.optimisticRows()));
$('#newLog').addEventListener('click',()=>openEditor($('#typeFilter').value||$('#trendType').value));
$('#refresh').addEventListener('click',()=>store.refresh().then(()=>store.sync()).catch(()=>{}));
$('#retry').addEventListener('click',()=>store.sync());
$('#useRemote').addEventListener('click',()=>store.resolveConflict(false).then(()=>{if(editor)openConflictResult();}).catch(e=>$('#formError').textContent=e.message));
$('#keepDraft').addEventListener('click',()=>store.resolveConflict(true).catch(e=>$('#formError').textContent=e.message));
function openConflictResult(){const p=editor.prefix,d=editor.date,row=store.optimisticRows().find(r=>r.record_date===rowKey(d,p));fillForm(p,d,latestForRow(row,p));}
$('#export').addEventListener('click',()=>{
  const data=PREFIXES.flatMap(p=>entries(store.optimisticRows(),p).map(e=>({date:e.date,type:TYPES[p],revision:e.index+1,...e.snapshot})));
  const fields=[...new Set(data.flatMap(Object.keys))].filter(k=>k!=='image');const csv=[fields,...data.map(r=>fields.map(k=>r[k]??''))].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`cru-history-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('online',()=>store.refresh().then(()=>store.sync()).catch(()=>{}));window.addEventListener('offline',()=>store.idleStatus());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')store.refresh().then(()=>store.sync()).catch(()=>{});});
// Queue is written synchronously on every valid edit; no network request is needed on close.
setInterval(()=>{if(navigator.onLine&&!store.busy&&!editor)store.refresh().then(()=>store.sync()).catch(()=>{});else if(navigator.onLine&&!editor)store.sync();},15000);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('#install').hidden=false;});
$('#install').addEventListener('click',async()=>{if(installEvent){await installEvent.prompt();installEvent=null;$('#install').hidden=true;}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
const initialRecipe=new URLSearchParams(location.search).get('recipe');if(PREFIXES.includes(initialRecipe)){$('#trendType').value=initialRecipe;$('#typeFilter').value=initialRecipe;}
render();store.refresh().then(()=>store.sync()).catch(()=>{});
