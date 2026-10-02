import {appendOperation,history,latestForRow,rowKey} from './data.js';
export class ConflictError extends Error { constructor(op){super('Cloud changes overlap your draft. Review before syncing.');this.op=op;} }
export class BrewStore {
  constructor(config,{storage=localStorage,fetcher=(...args)=>fetch(...args),onChange=()=>{}}={}) {
    this.config=config;this.storage=storage;this.fetcher=fetcher;this.onChange=onChange;this.rows=[];this.queue=[];this.settled=[];this.instanceId=crypto.randomUUID();this.busy=false;this.loaded=false;this.status='loading';this.message='Loading cloud…';this.conflict=null;
    this.key=`cru-v1:${config.supabaseUrl}:${config.table}:${config.readOnly!==false?'preview':'live'}`;
    this.restore();
  }
  restore(){
    try { const saved=JSON.parse(this.storage.getItem(this.key)||'null');if(saved){this.rows=saved.rows||[];this.queue=saved.queue||[];this.settled=saved.settled||[];this.loaded=saved.loaded===true;} }
    catch {this.status='error';this.message='Device cache unavailable. Keep this page open.';}
  }
  persist(){
    try {
      const disk=JSON.parse(this.storage.getItem(this.key)||'null');
      const settled=new Set([...this.settled,...(disk?.settled||[])]);
      const pending=new Map((disk?.queue||[]).map(op=>[op.id,op]));
      for(const op of this.queue){const previous=pending.get(op.id);if(!previous||op.createdAt>=previous.createdAt)pending.set(op.id,op);}
      this.queue=[...pending.values()].filter(op=>!settled.has(op.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      this.settled=[...settled];
      this.storage.setItem(this.key,JSON.stringify({rows:this.rows,queue:this.queue,settled:this.settled,loaded:this.loaded}));
    }
    catch {throw new Error('Device storage is full or unavailable. Changes are not protected; keep this page open and free storage.');}
  }
  setStatus(status,message){this.status=status;this.message=message;this.onChange();}
  headers(){return {apikey:this.config.supabaseAnonKey,Authorization:`Bearer ${this.config.accessToken?.() || this.config.supabaseAnonKey}`,'Content-Type':'application/json',Accept:'application/json'};}
  url(){return `${this.config.supabaseUrl.replace(/\/$/,'')}/rest/v1/${encodeURIComponent(this.config.table || 'batch_brew_records')}`;}
  async request(query,options={}) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await this.fetcher(`${this.url()}${query}`,{...options,headers:{...this.headers(),...options.headers},signal:controller.signal,cache:'no-store'});
      if(!response.ok){const err=new Error(`Cloud request failed (${response.status}). Your draft is kept on this device.`);err.code=response.status;throw err;}
      return response.status===204?[]:await response.json();
    } finally {clearTimeout(timeout);}
  }
  async refresh() {
    // Range pagination prevents silently dropping history after Supabase's row limit.
    try {
      const rows=[];let offset=0;
      while(true){const page=await this.request(`?select=record_date,payload,updated_at&order=record_date.asc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break;offset+=500;}
      this.rows=rows;this.loaded=true;this.persist();
      this.idleStatus();return rows;
    }catch(e){this.setStatus(typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'error',e.message);throw e;}
  }
  optimisticRows() {
    const rows=structuredClone(this.rows);
    for(const op of this.queue){const key=rowKey(op.date,op.prefix);const i=rows.findIndex(r=>r.record_date===key);const next=appendOperation(i<0?null:rows[i],op);if(i<0)rows.push(next);else rows[i]=next;}
    return rows;
  }
  idleStatus(){
    if(this.conflict){this.setStatus('conflict',this.conflict.message);return;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.setStatus('offline','Offline · drafts kept on this device');return;}
    if(this.config.readOnly!==false){this.setStatus('preview',this.queue.length?'Preview draft saved · device only':'Live data loaded · preview');return;}
    this.setStatus(this.queue.length?'pending':'saved',this.queue.length?'Draft saved · waiting to sync':'Saved ✓');
  }
  enqueue({prefix,date,patch,base,staff,prepTime}) {
    if(!this.loaded)throw new Error('Load cloud records before editing. No records have been replaced.');
    const backup=structuredClone(this.queue);const settledBackup=[...this.settled];
    const key=rowKey(date,prefix);
    let op=this.queue.findLast(o=>rowKey(o.date,o.prefix)===key&&o.prefix===prefix&&o.id!==this.sendingId&&o.owner===this.instanceId&&!o.conflicted);
    if(op){
      // Replace a coalesced operation's ID: another open tab may already be sending its older version.
      this.settled.push(op.id);op.id=crypto.randomUUID();
      for(const k of Object.keys(patch))if(!(k in op.base))op.base[k]=base[k]??'';
      op.patch={...op.patch,...patch};op.staff=staff;op.createdAt=new Date().toISOString();op.prepTime=prepTime;
      for(const k of Object.keys(op.patch))if(op.patch[k]===op.base[k]){delete op.patch[k];delete op.base[k];}
      if(!Object.keys(op.patch).length){this.settled.push(op.id);this.queue=this.queue.filter(o=>o.id!==op.id);}
    }else{
      op={id:crypto.randomUUID(),owner:this.instanceId,prefix,date,patch,base:Object.fromEntries(Object.keys(patch).map(k=>[k,base[k]??''])),staff,prepTime,createdAt:new Date().toISOString()};this.queue.push(op);
    }
    try{this.persist();}catch(e){this.queue=backup;this.settled=settledBackup;this.setStatus('error',e.message);throw e;}
    this.idleStatus();return op;
  }
  async saveOne(op) {
    const key=rowKey(op.date,op.prefix);
    for(let attempt=0;attempt<6;attempt++){
      const rows=await this.request(`?select=record_date,payload,updated_at&record_date=eq.${encodeURIComponent(key)}`);
      const row=rows[0];
      if(history(row?.payload,op.prefix).some(s=>s.mutationId===op.id))return row;
      const latest=latestForRow(row,op.prefix);
      if(Object.keys(op.base).some(k=>(latest[k]??'')!==op.base[k]&&(latest[k]??'')!==op.patch[k]))throw new ConflictError(op);
      const next=appendOperation(row,op);next.updated_at=new Date().toISOString();
      try{
        if(row){
          const saved=await this.request(`?record_date=eq.${encodeURIComponent(key)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(next)});
          if(!saved.length)continue;return saved[0];
        }
        const saved=await this.request('',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(next)});return saved[0];
      }catch(e){if(e.code===409)continue;throw e;}
    }
    throw new Error('This record is busy. Draft retained; retry in a moment.');
  }
  async sync() {
    if(this.busy)return;
    if(this.config.readOnly!==false){this.idleStatus();return;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.idleStatus();return;}
    if(this.conflict)return;
    this.busy=true;
    try{
      while(this.queue.length){
        const op=structuredClone(this.queue[0]);this.sendingId=op.id;this.setStatus('saving','Saving…');
        const row=await this.saveOne(op);
        const i=this.rows.findIndex(r=>r.record_date===row.record_date);if(i<0)this.rows.push(row);else this.rows[i]=row;
        this.settled.push(op.id);this.queue=this.queue.filter(o=>o.id!==op.id);this.persist();this.sendingId=null;
      }
      this.idleStatus();
    }catch(e){
      if(e instanceof ConflictError){this.conflict=e;const op=this.queue.find(o=>o.id===e.op.id);if(op)op.conflicted=true;this.persist();this.setStatus('conflict',e.message);}
      else this.setStatus(typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'error',e.message);
    }finally{this.busy=false;this.sendingId=null;}
  }
  async resolveConflict(keep) {
    const conflict=this.conflict;if(!conflict)return;
    const op=this.queue.find(o=>o.id===conflict.op.id);if(!op)return;
    await this.refresh();
    if(keep){const latest=latestForRow(this.rows.find(r=>r.record_date===rowKey(op.date,op.prefix)),op.prefix);op.base=Object.fromEntries(Object.keys(op.patch).map(k=>[k,latest[k]??'']));op.conflicted=false;}
    else{this.settled.push(op.id);this.queue=this.queue.filter(o=>o.id!==op.id);}
    this.conflict=null;this.persist();await this.sync();this.idleStatus();
  }
}
