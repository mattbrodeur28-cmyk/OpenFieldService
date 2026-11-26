// Read projection over the owning Sales audit, never a second stage-history ledger.
export function createStageTiming({database:db,clock=()=>new Date()}) {
 const latest=db.prepare(`SELECT id,created_at,json_extract(after_json,'$.stage_id') AS stage_id
 FROM _sales_audit WHERE entity_type='opportunity' AND entity_id=?
 AND json_valid(before_json) AND json_valid(after_json)
 AND json_type(after_json,'$.stage_id')='text'
 AND json_extract(after_json,'$.stage_id') IS NOT json_extract(before_json,'$.stage_id')
 ORDER BY id DESC LIMIT 1`);
 return rows=>{
  const observed=clock(),now=observed.getTime();
  if(!Number.isFinite(now))throw new Error('Sales reporting clock is invalid.');
  const observedAt=observed.toISOString();
  return rows.map(row=>{
   const event=latest.get(row.id);
   let status='missing_history',enteredAt=null,elapsedMinutes=null;
   if(event){
    if(event.stage_id!==row.stage_id)status='history_mismatch';
    else {
     const raw=event.created_at;
     // SQLite CURRENT_TIMESTAMP is UTC; do not interpret it as the browser's zone.
     const timestamp=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?Date.parse(raw.replace(' ','T')+'Z'):NaN;
     if(!Number.isFinite(timestamp))status='invalid_timestamp';
     else if(timestamp>now)status='clock_review';
     else {status='known';enteredAt=new Date(timestamp).toISOString();elapsedMinutes=Math.floor((now-timestamp)/60000);}
    }
   }
   return {...row,stageTiming:{status,enteredAt,elapsedMinutes,observedAt,auditId:event?.id??null}};
  });
 };
}
