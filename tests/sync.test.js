import test from 'node:test';
import assert from 'node:assert/strict';
import {BrewStore} from '../sync.js';
import {history,normalized,appendOperation,latestForRow,rowKey} from '../data.js';
const config={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'public',table:'batch_brew_records',readOnly:false};
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const makeRow=()=>({record_date:'2026-10-02',updated_at:'2026-10-02T01:00:00Z',payload:{date:'2026-10-02',custom:{keep:true},b1History:[{origin:'Guji',ek:'6',coffee:'64',qcBody:'honey',savedAt:'2026-10-02T01:00:00Z'}],b2History:[{origin:'Kenya',ek:'5',coffee:'62'}]}});
function backend(initial=[],{race=false,lostAck=false}={}){
 const db=new Map(initial.map(r=>[r.record_date,structuredClone(r)]));let calls=[],raceDone=false,failedAck=false,tick=0;
 const fetcher=async(url,opts)=>{
  const u=new URL(url);calls.push({method:opts.method||'GET',url});let data;
  if(!opts.method){const filter=u.searchParams.get('record_date');const offset=Number(u.searchParams.get('offset')||0);data=[...db.values()].filter(r=>!filter||r.record_date===filter.slice(3)).slice(offset,offset+Number(u.searchParams.get('limit')||10000));}
  else if(opts.method==='PATCH'){
   const next=JSON.parse(opts.body),current=db.get(next.record_date);
   if(race&&!raceDone){raceDone=true;current.updated_at='other-version';current.payload.b2History.push({origin:'Kenya new',ek:'5.25',coffee:'63'});}
   if(!current||u.searchParams.get('updated_at')!=='eq.'+current.updated_at)data=[];
   else {next.updated_at=String(++tick);db.set(next.record_date,next);if(lostAck&&!failedAck){failedAck=true;throw new Error('Lost acknowledgement');}data=[next];}
  }else{const next=JSON.parse(opts.body);if(db.has(next.record_date))return new Response('{}',{status:409});db.set(next.record_date,next);data=[next];}
  return new Response(JSON.stringify(structuredClone(data)),{status:200});
 };return {db,fetcher,calls};
}
const enqueue=(store,patch={ek:'5.75'},prefix='b1',date='2026-10-02')=>store.enqueue({prefix,date,patch,base:latestForRow(store.optimisticRows().find(r=>r.record_date===rowKey(date,prefix)),prefix),staff:'JP',prepTime:'07:30'});
test('preserves every revision, unknown QC field and the other recipe',()=>{
 const row=makeRow(),copy=structuredClone(row);const op={id:'op1',prefix:'b1',date:row.record_date,patch:{ek:'5.75'},staff:'JP',createdAt:'2026-10-02T02:00:00Z'};
 const next=appendOperation(row,op);assert.deepEqual(row,copy);assert.deepEqual(next.payload.b1History[0],copy.payload.b1History[0]);assert.deepEqual(next.payload.b2History,copy.payload.b2History);assert.deepEqual(next.payload.custom,{keep:true});assert.equal(next.payload.b1History[1].qcBody,'honey');assert.equal(next.payload.b1Ek,'5.75');
});
test('legacy adjustment mapping and empty deleted histories',()=>{
 assert.equal(normalized({ek:'6',ekAdjust:'5.75',coffee:'64',grindAdjust:'63'},'b1').dose,'63');assert.equal(normalized({dose:'22'},'decaf').dose,'22');assert.deepEqual(history({b1History:[],b1Origin:'Deleted'},'b1'),[]);
});
test('preview performs cloud reads only and drafts survive refresh',async()=>{
 const b=backend([makeRow()]),storage=memory();const s=new BrewStore({...config,readOnly:true},{storage,fetcher:b.fetcher});await s.refresh();enqueue(s);await s.sync();assert.equal(b.calls.filter(c=>c.method!=='GET').length,0);const restored=new BrewStore({...config,readOnly:true},{storage,fetcher:b.fetcher});assert.equal(restored.queue.length,1);assert.equal(restored.optimisticRows()[0].payload.b1History.at(-1).ek,'5.75');assert.equal(b.db.get('2026-10-02').payload.b1History.length,1);
});
test('retries CAS races without losing a concurrent other-recipe revision',async()=>{
 const b=backend([makeRow()],{race:true}),s=new BrewStore(config,{storage:memory(),fetcher:b.fetcher});await s.refresh();enqueue(s);await s.sync();assert.equal(s.queue.length,0);assert.equal(b.db.get('2026-10-02').payload.b2History.length,2);assert.equal(b.db.get('2026-10-02').payload.b1History.length,2);
});
test('same-field changes stop sync and preserve draft until explicit resolution',async()=>{
 const b=backend([makeRow()]),s=new BrewStore(config,{storage:memory(),fetcher:b.fetcher});await s.refresh();enqueue(s);b.db.get('2026-10-02').payload.b1History.push({ek:'7',coffee:'64',origin:'Guji'});await s.sync();assert.equal(s.status,'conflict');assert.equal(s.queue.length,1);await s.resolveConflict(true);assert.equal(s.queue.length,0);assert.equal(b.db.get('2026-10-02').payload.b1History.at(-1).ek,'5.75');assert.equal(b.db.get('2026-10-02').payload.b1History.length,3);
});
test('retry after lost acknowledgement does not append a duplicate revision',async()=>{
 const b=backend([makeRow()],{lostAck:true}),s=new BrewStore(config,{storage:memory(),fetcher:b.fetcher});await s.refresh();enqueue(s);await s.sync();assert.equal(s.queue.length,1);await s.sync();assert.equal(s.queue.length,0);assert.equal(b.db.get('2026-10-02').payload.b1History.length,2);
});
test('coalesces pending keystrokes and persists cache immediately',async()=>{
 const b=backend([makeRow()]),storage=memory(),s=new BrewStore(config,{storage,fetcher:b.fetcher});await s.refresh();enqueue(s,{ek:'5.75'});enqueue(s,{ek:'5.5',dose:'65'});assert.equal(s.queue.length,1);assert.deepEqual(s.queue[0].patch,{ek:'5.5',dose:'65'});assert.deepEqual(s.queue[0].base,{ek:'6',dose:'64'});const restored=new BrewStore(config,{storage,fetcher:b.fetcher});await restored.sync();assert.equal(restored.queue.length,0);
});
test('storage failure does not claim that draft was saved',async()=>{
 const b=backend([makeRow()]),storage=memory(),s=new BrewStore(config,{storage,fetcher:b.fetcher});await s.refresh();storage.setItem=()=>{throw new Error('quota')};assert.throws(()=>enqueue(s),/storage/);assert.equal(s.queue.length,0);assert.equal(s.status,'error');
});
test('loads all pages beyond Supabase row limit',async()=>{
 const rows=Array.from({length:1101},(_,i)=>({record_date:String(i).padStart(4,'0'),payload:{date:String(i)},updated_at:'x'}));const b=backend(rows),s=new BrewStore(config,{storage:memory(),fetcher:b.fetcher});await s.refresh();assert.equal(s.rows.length,1101);assert.equal(b.calls.length,3);
});
test('cold/decaf keys retain legacy namespace and original fields',async()=>{
 const b=backend(),s=new BrewStore(config,{storage:memory(),fetcher:b.fetcher});await s.refresh();enqueue(s,{dose:'22',ek:'0.8'},'decaf');await s.sync();const row=b.db.get('cold-decaf:2026-10-02');assert.equal(row.payload.logType,'cold-brew-decaf');assert.equal(row.payload.decafDose,'22');assert.equal(row.payload.decafHistory.length,1);
});

test('another tab refresh cannot erase an offline queue or resurrect acknowledged work',async()=>{
 const b=backend([makeRow()]),storage=memory(),a=new BrewStore(config,{storage,fetcher:b.fetcher}),c=new BrewStore(config,{storage,fetcher:b.fetcher});await a.refresh();await c.refresh();enqueue(a);await c.refresh();assert.equal(c.queue.length,1);await c.sync();await a.refresh();assert.equal(a.queue.length,0);assert.equal(b.db.get('2026-10-02').payload.b1History.length,2);
});
