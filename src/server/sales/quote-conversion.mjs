import {z} from 'zod';
import {transaction} from '../platform/sqlite.mjs';
import {SalesError,parse,version,date,isSalesAdmin,requireWriter} from './domain.mjs';
import {contentHash} from './quote-issuer.mjs';
import {audit} from './storage.mjs';
import {ServiceIdentityError} from '../service/identity.mjs';
const uuid=z.string().uuid(),note=z.string().trim().min(10).max(2000);
const command=z.object({
 id:uuid,requestKey:uuid,jobId:uuid,offerId:uuid,acceptanceEventId:uuid,
 expectedQuoteVersion:version.refine(v=>v>0),expectedEventSequence:version,expectedOpportunityVersion:version,
 customerId:uuid,siteId:uuid,assetId:uuid.nullable(),serviceTypeId:uuid.nullable(),
 planningDate:date.refine(Boolean),durationMinutes:z.number().int().min(15).max(1440),
 priority:z.enum(['low','normal','high','urgent']),mappingAttested:z.literal(true),mappingNote:note,wonReason:note,
}).strict();
const cancelInput=z.object({id:uuid,requestKey:uuid,expectedScheduleVersion:version,note}).strict();
const administrator=user=>{if(!isSalesAdmin(user))throw new SalesError('An owner or administrator must convert or cancel accepted work.',403);};

/** One service database transaction: accepted document -> native Job -> Won. */
export function createQuoteConversion({storage,sales,source,jobHandoff}) {
 const db=storage.database;
 function existing(id) {
  return db.prepare('SELECT c.*,j.identifier AS job_identifier,j.status AS job_status,j.technician_id,j.scheduled_date,j.scheduled_time,j.duration FROM _sales_quote_conversions c JOIN jobs j ON j.id=c.job_id WHERE c.quote_id=?').get(id);
 }
 function shape(row) {
  return row?{id:row.id,quoteId:row.quote_id,revision:row.quote_version,opportunityId:row.opportunity_id,offerId:row.offer_id,acceptanceEventId:row.acceptance_event_id,job:{id:row.job_id,identifier:row.job_identifier,status:row.job_status,technicianId:row.technician_id,planningDate:row.scheduled_date,scheduledTime:row.scheduled_time,durationMinutes:row.duration,scheduleVersion:db.prepare('SELECT version FROM _dispatch_job_state WHERE job_id=?').get(row.job_id)?.version??null},createdAt:row.created_at}:null;
 }
 function cancellationBlocker(row) {
  if(!['scheduled','confirmed'].includes(row.job_status))return 'Only unstarted scheduled or confirmed work can be cancelled here.';
  for(const table of ['_service_safety_submissions','_service_report_drafts','_service_reports','_service_time_entries']) {
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)&&db.prepare(`SELECT 1 FROM ${table} WHERE job_id=?`).get(row.job_id))return 'Execution evidence exists. Review actual work through the service workflow before cancelling.';
  }
  return null;
 }
 function summary(user,id) {
  return transaction(db,()=>{
   const {head,opportunity}=source(user,id),conversion=existing(id);
   const offer=db.prepare('SELECT * FROM _sales_quote_offers WHERE quote_id=? AND quote_version=?').get(id,head.version);
   const accepted=offer?db.prepare("SELECT id FROM _sales_quote_lifecycle_events WHERE offer_id=? AND action='accepted' ORDER BY sequence DESC LIMIT 1").get(offer.id):null;
   const sequence=db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM _sales_quote_lifecycle_events WHERE quote_id=?').get(id).n;
   const linked={customerId:offer?.customer_id??opportunity.customer_id,siteId:offer?.site_id??opportunity.site_id,assetId:offer?.asset_id??opportunity.asset_id};
   const choice=(table,key)=>linked[key]?db.prepare(`SELECT id,name FROM ${table} WHERE id=?`).get(linked[key])??null:null;
   const other=db.prepare('SELECT quote_id FROM _sales_quote_conversions WHERE opportunity_id=?').get(opportunity.id);
   const blockers=[];
   if(!isSalesAdmin(user))blockers.push('An owner or administrator must convert accepted work.');
   if(!jobHandoff)blockers.push('Native Job handoff is not configured.');
   if(head.status!=='accepted'||!accepted)blockers.push('Record acceptance of the current offered quote first.');
   if(opportunity.stage_kind!=='open'&&!conversion)blockers.push('The opportunity must be open before conversion.');
   if(other&&other.quote_id!==id)blockers.push('This opportunity already has a converted quote. Open its existing job.');
   const document=offer?JSON.parse(offer.document_json):null;
   return {quoteId:id,cancellationBlocker:conversion?cancellationBlocker(conversion):null,conversionHistory:conversion?db.prepare("SELECT id,action,note,actor_id AS actorId,created_at AS createdAt FROM _sales_quote_conversion_events WHERE conversion_id=? ORDER BY created_at DESC,id DESC LIMIT 25").all(conversion.id):[],conversion:shape(conversion),opportunityConversion:other&&other.quote_id!==id?shape(existing(other.quote_id)):null,canConvert:!blockers.length&&!conversion,blockers,expectedQuoteVersion:head.version,expectedEventSequence:sequence,expectedOpportunityVersion:opportunity.version,offerId:offer?.id??null,acceptanceEventId:accepted?.id??null,nativeLinks:linked,selected:{customer:choice('customers','customerId'),site:choice('sites','siteId'),asset:choice('assets','assetId')},acceptedDocument:document?{title:document.title,scope:document.scope,customerName:document.customer.name,siteName:document.site?.name??null,totalCents:document.totalCents}:null,jobHandoffAvailable:!!jobHandoff};
  });
 }
 function options(user,id,query={}) {
  administrator(user);const kind=parse(z.enum(['customers','sites','assets','serviceTypes']),query.kind);
  const page=parse(z.coerce.number().int().min(1).max(1000000),query.page??1),search=parse(z.string().max(200),query.search??'');
  const customerId=query.customerId===undefined?null:parse(uuid,query.customerId),siteId=query.siteId===undefined?null:parse(uuid,query.siteId);
  return transaction(db,()=>{
   source(user,id);
   let table,where,args;
   if(kind==='customers'){table='customers';where="instr(lower(name),lower(?))>0";args=[search];}
   else if(kind==='serviceTypes'){table='service_types';where="instr(lower(name),lower(?))>0";args=[search];}
   else {
    if(!customerId)throw new SalesError('Choose a customer first.');
    if(kind==='assets'&&!siteId)throw new SalesError('Choose a customer location first.');
    table=kind==='sites'?'sites':'assets';
    where="customer_id=? AND instr(lower(name"+(kind==='assets'?"||' '||serial_number||' '||model":"||' '||address")+"),lower(?))>0"+(kind==='assets'?' AND site_id=?':'');
    args=[customerId,search,...(kind==='assets'?[siteId]:[])];
   }
   const rows=db.prepare(`SELECT id,name FROM ${table} WHERE ${where} ORDER BY name,id LIMIT 26 OFFSET ?`).all(...args,(page-1)*25);
   return {rows:rows.slice(0,25),page,pageSize:25,hasMore:rows.length>25};
  });
 }
 function forJob(user,jobId) {
  requireWriter(user);parse(uuid,jobId);
  return transaction(db,()=>{
   // Match current Sales permissions; don't expose internal quote data through a
   // company-wide legacy Job endpoint or grant technicians pricing-review access.
   const row=db.prepare('SELECT quote_id FROM _sales_quote_conversions WHERE job_id=?').get(jobId);
   if(!row)return {conversion:null};
   source(user,row.quote_id);return {conversion:shape(existing(row.quote_id))};
  });
 }
 function replay(user,key,hash) {
  const prior=db.prepare('SELECT * FROM _sales_quote_conversion_requests WHERE request_key=?').get(key);
  if(!prior)return null;
  if(prior.actor_id!==user.id)throw new SalesError('This request belongs to another user.',403);
  if(prior.request_hash!==hash)throw new SalesError('This request key has different content.',409);
  return JSON.parse(prior.result_json);
 }
 function acknowledge(user,key,hash,result) {
  db.prepare('INSERT INTO _sales_quote_conversion_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(key,user.id,hash,JSON.stringify(result));
  return result;
 }
 function convert(user,id,raw) {
  administrator(user);parse(uuid,id);const d=parse(command,raw),hash=contentHash({action:'convert',quoteId:id,...d});
  return transaction(db,()=>{
   const {head,opportunity}=source(user,id);
   const prior=replay(user,d.requestKey,hash);if(prior)return prior;
   const linked=existing(id);
   if(linked)throw new SalesError(`Already converted to ${linked.job_identifier}; open the existing job.`,409);
   if(!jobHandoff)throw new SalesError('Native Job handoff is not configured.',503);
   const sequence=db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM _sales_quote_lifecycle_events WHERE quote_id=?').get(id).n;
   if(head.version!==d.expectedQuoteVersion||sequence!==d.expectedEventSequence||opportunity.version!==d.expectedOpportunityVersion)throw new SalesError('Quote or opportunity changed. Review the current conversion.',409);
   if(head.status!=='accepted'||opportunity.stage_kind!=='open')throw new SalesError('Convert an accepted current quote on an open opportunity.',409);
   if(db.prepare('SELECT 1 FROM _sales_quote_conversions WHERE opportunity_id=? OR id=?').get(opportunity.id,d.id))throw new SalesError('This opportunity or conversion identity already has a native job.',409);
   const offer=db.prepare('SELECT * FROM _sales_quote_offers WHERE id=? AND quote_id=? AND quote_version=?').get(d.offerId,id,head.version);
   const acceptance=db.prepare("SELECT * FROM _sales_quote_lifecycle_events WHERE id=? AND offer_id=? AND quote_id=? AND quote_version=? AND action='accepted'").get(d.acceptanceEventId,d.offerId,id,head.version);
   if(!offer||!acceptance)throw new SalesError('Choose the exact accepted offer and its recorded response.',409);
   const evidence=JSON.parse(acceptance.evidence_json),doc=JSON.parse(offer.document_json);
   if(contentHash(offer.document_json)!==offer.document_hash||contentHash(offer.html)!==offer.html_hash||evidence.documentHash!==offer.document_hash||evidence.htmlHash!==offer.html_hash||evidence.attested!==true)throw new SalesError('Accepted document evidence is inconsistent. Review the retained record.',409);
   for(const [column,key] of [['customer_id','customerId'],['site_id','siteId'],['asset_id','assetId']]) {
    if((offer[column]&&offer[column]!==d[key])||(opportunity[column]&&opportunity[column]!==d[key]))throw new SalesError('Preserve existing accepted and opportunity relationships; resolve changes explicitly before conversion.',409);
   }
   let job;
   try {
    job=jobHandoff.createInTransaction(user,{id:d.jobId,sourceId:offer.id,documentHash:offer.document_hash,htmlHash:offer.html_hash,customerId:d.customerId,siteId:d.siteId,assetId:d.assetId,serviceTypeId:d.serviceTypeId,planningDate:d.planningDate,durationMinutes:d.durationMinutes,priority:d.priority,totalCents:doc.totalCents,currency:doc.currency,title:doc.title,scope:doc.scope,exclusions:doc.exclusions});
   }catch(error){if(error instanceof ServiceIdentityError)throw new SalesError(error.message,error.status);throw error;}
   db.prepare('INSERT INTO _sales_quote_conversions(id,quote_id,quote_version,opportunity_id,offer_id,acceptance_event_id,job_id,actor_id,mapping_note,won_reason,document_hash,html_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(d.id,id,head.version,opportunity.id,offer.id,acceptance.id,job.id,user.id,d.mappingNote,d.wonReason,offer.document_hash,offer.html_hash);
   // This capability is intentionally distinct from generic Kanban stage moves.
   sales.winConvertedInTransaction(user,opportunity.id,{expectedVersion:d.expectedOpportunityVersion,conversionId:d.id,jobId:job.id,customerId:d.customerId,siteId:d.siteId,assetId:d.assetId,reason:d.wonReason});
   const result={conversion:shape(existing(id)),communicationSent:false};
   audit(db,user,'quote',id,'convert',null,{conversionId:d.id,jobId:job.id},d.wonReason);
   return acknowledge(user,d.requestKey,hash,result);
  });
 }
 function cancel(user,id,raw) {
  administrator(user);parse(uuid,id);const d=parse(cancelInput,raw),hash=contentHash({action:'cancel_job',quoteId:id,...d});
  return transaction(db,()=>{
   source(user,id);const prior=replay(user,d.requestKey,hash);if(prior)return prior;
   const row=existing(id);if(!row)throw new SalesError('No converted job exists.',404);
   const state=db.prepare('SELECT version FROM _dispatch_job_state WHERE job_id=?').get(row.job_id);
   if(state?.version!==d.expectedScheduleVersion)throw new SalesError('Job changed. Review its current schedule before cancellation.',409);
   const blocker=cancellationBlocker(row);if(blocker)throw new SalesError(blocker,409);
   db.prepare("UPDATE jobs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.job_id);
   const after=existing(id);
   db.prepare("INSERT INTO _sales_quote_conversion_events(id,conversion_id,actor_id,action,note,before_json,after_json) VALUES(?,?,?,'cancel_job',?,?,?)").run(d.id,row.id,user.id,d.note,JSON.stringify(shape(row)),JSON.stringify(shape(after)));
   audit(db,user,'quote',id,'cancel_converted_job',shape(row),shape(after),d.note);
   return acknowledge(user,d.requestKey,hash,{conversion:shape(after),communicationSent:false});
  });
 }
 return {summary,options,forJob,convert,cancel};
}
