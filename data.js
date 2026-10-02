export const TYPES = { b1: 'Batch Brew +', b2: 'Batch Brew', cold: 'Cold Brew', decaf: 'Decaf' };
export const PREFIXES = Object.keys(TYPES);
const LEGACY_FIELDS = ['barista','origin','roastDate','notes','ek','coffee','dose','water','waterTemp','tool','active','taste','ekAdjust','grindAdjust','adjustmentReason','steep','start','finish','serve','yield','image'];
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const dayOffset = (date, offset) => { const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10); };
export const rowKey = (date,prefix) => ['cold','decaf'].includes(prefix) ? `cold-decaf:${date}` : date;
export function history(payload, prefix) {
  const stored=payload?.[`${prefix}History`];
  // An explicit empty history represents a deletion in the legacy app.
  if (Array.isArray(stored)) return stored;
  const legacy={savedAt:payload?.updatedAt || ''};
  for (const field of LEGACY_FIELDS) {
    const suffix=field[0].toUpperCase()+field.slice(1);
    if (payload?.[`${prefix}${suffix}`] !== undefined) legacy[field]=payload[`${prefix}${suffix}`];
  }
  if (!legacy.barista && payload?.barista) legacy.barista=payload.barista;
  return ['origin','ek','coffee','dose','roastDate','yield'].some(k=>legacy[k]) ? [legacy] : [];
}
export function normalized(snapshot={}, prefix, payload={}) {
  const val = key => snapshot[key] ?? '';
  return {...snapshot, recipeType:prefix, origin:val('origin'),roastDate:val('roastDate'),notes:val('notes'),
    ek:String(snapshot.ekAdjust || val('ek')),dose:String(snapshot.grindAdjust || (prefix==='decaf' ? val('dose') : val('coffee'))),
    water:String(snapshot.water ?? (['b1','b2'].includes(prefix) ? payload.waterMl ?? 1000 : '')),
    waterTemp:String(val('waterTemp')),tool:val('tool'),active:snapshot.active!==false,barista:val('barista'),
    prepTime:snapshot.prepTime ?? payload.prepTime ?? payload.brewTime ?? '',taste:val('taste'),adjustmentReason:val('adjustmentReason'),image:val('image'),steep:String(val('steep')),
    start:val('start'),finish:val('finish'),serve:val('serve'),yield:String(val('yield'))};
}
export function entries(rows,prefix) {
  return rows.flatMap(row=>history(row.payload,prefix).map((snapshot,index)=>({row,date:row.payload.date || row.record_date.replace('cold-decaf:',''),prefix,index,snapshot,value:normalized(snapshot,prefix,row.payload)})))
    .sort((a,b)=>a.date.localeCompare(b.date) || String(a.snapshot.savedAt||'').localeCompare(String(b.snapshot.savedAt||'')) || a.index-b.index);
}
export function currentEntry(rows,prefix) { return entries(rows,prefix).filter(e=>e.date<=today()).at(-1); }
export function latestForRow(row,prefix) { return normalized(history(row?.payload,prefix).at(-1),prefix,row?.payload); }
export function appendOperation(row,op) {
  const payload=structuredClone(row?.payload || {date:op.date});
  const revisions=history(payload,op.prefix);
  if (revisions.some(s=>s.mutationId===op.id)) return row;
  const previous=revisions.at(-1) || {};
  const value={...normalized(previous,op.prefix,payload),...op.patch};
  const snapshot={...previous,...value,ekAdjust:'',grindAdjust:'',adjustmentApplied:false,savedAt:op.createdAt,mutationId:op.id,updatedBy:op.staff,barista:op.staff};
  if(op.prefix!=='decaf') {snapshot.coffee=value.dose;delete snapshot.dose;}
  // Preserve all unknown QC fields and all previous snapshots byte-for-byte.
  payload[`${op.prefix}History`]=[...revisions,snapshot];
  for(const [key,val] of Object.entries(snapshot)) {
    if(['savedAt','mutationId','recipeType'].includes(key))continue;
    payload[`${op.prefix}${key[0].toUpperCase()}${key.slice(1)}`]=val;
  }
  payload.date=op.date;payload.updatedAt=op.createdAt;
  if(['cold','decaf'].includes(op.prefix)){payload.logType='cold-brew-decaf';payload.prepTime=op.prepTime;}
  else {payload.brewTime=op.prepTime;payload.waterMl=Number(value.water)||payload.waterMl||1000;}
  return {record_date:rowKey(op.date,op.prefix),payload,updated_at:op.createdAt};
}
export function changedFields(before,after) {
  const keys=['origin','roastDate','notes','tool','ek','dose','water','waterTemp','steep','start','finish','serve','yield','taste','adjustmentReason','active','image','prepTime'];
  return Object.fromEntries(keys.filter(k=>(before[k]??'')!==(after[k]??'')).map(k=>[k,after[k]??'']));
}
export function safeImage(value) { return typeof value==='string' && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) ? value : ''; }
