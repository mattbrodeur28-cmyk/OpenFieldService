import {z} from 'zod';
import {transaction} from '../platform/sqlite.mjs';
import {SalesError,parse,version,requireWriter,isSalesAdmin} from './domain.mjs';
import {hasPendingPricing} from './estimating-domain.mjs';
import {createQuoteIssuer,contentHash} from './quote-issuer.mjs';
import {renderCustomerQuoteHtml} from './quote-document.mjs';
const uuid=z.string().uuid(),positive=z.coerce.number().int().min(1).max(1000000);
const revision=z.number().int().min(1).max(1000000);
const note=z.string().trim().min(10).max(2000);
const recipient=z.object({name:z.string().trim().min(1).max(200),email:z.string().email().max(254)}).strict();
const evidence={occurredAt:z.string().datetime(),evidenceReference:z.string().trim().min(10).max(2000),attested:z.literal(true)};
const base={id:uuid,requestKey:uuid,expectedQuoteVersion:revision,expectedEventSequence:version,note};
const command=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('offer'),expectedOpportunityVersion:version,expectedIssuerVersion:revision,expectedPolicyVersion:revision,expectedReviewSequence:version,recipient}).strict(),
 z.object({...base,action:z.literal('delivered'),offerId:uuid,...evidence,method:z.enum(['email','hand_delivery','portal','other'])}).strict(),
 ...['accepted','declined'].map(action=>z.object({...base,action:z.literal(action),offerId:uuid,...evidence,respondent:recipient,capacity:z.string().trim().min(3).max(200)}).strict()),
 ...['expire','withdraw','revise'].map(action=>z.object({...base,action:z.literal(action),offerId:uuid}).strict()),
]);
function businessDay(instant,timeZone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
/** Synchronous service-DB lifecycle. Provider communication/signature verification is separate. */
export function createQuoteLifecycle({storage,review,pricing,source,documentInTransaction,clock=()=>new Date()}){
 const db=storage.database,issuer=createQuoteIssuer(db);
 const latestSequence=id=>db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM _sales_quote_lifecycle_events WHERE quote_id=?').get(id).n;
 const offer=(id,revision)=>db.prepare('SELECT * FROM _sales_quote_offers WHERE quote_id=? AND quote_version=?').get(id,revision);
 const event=row=>({id:row.id,sequence:row.sequence,revision:row.quote_version,offerId:row.offer_id,actorId:row.actor_id,action:row.action,evidence:JSON.parse(row.evidence_json),note:row.note,recordedAt:row.recorded_at});
 const time=()=>{const now=clock(),timeZone=storage.companyTimeZone?.()||'UTC';return {now,timeZone,today:businessDay(now,timeZone)};};
 function context(user,id){
   const {head,quote,opportunity}=source(user,id),currentIssuer=issuer.publicFields(),bid=review.summaryInTransaction(user,id),{today,timeZone}=time(),blockers=[];
   if(head.status!=='draft')blockers.push('Only the current internal draft can be offered.');
   if(!currentIssuer)blockers.push('Configure a reviewed quote issuer in Settings.');
   if(!bid.qualified)blockers.push('Current pricing approval is required; incomplete pricing cannot be overridden.');
   if(hasPendingPricing(quote.estimate))blockers.push('Complete all pending supplier prices and native material links.');
   if(opportunity.stage_kind!=='open')blockers.push('Reopen the Sales opportunity first.');
   if(opportunity.customer_id&&!db.prepare('SELECT 1 FROM customers WHERE id=?').get(opportunity.customer_id))blockers.push('The linked native customer is unavailable.');
   if(opportunity.site_id&&(!opportunity.customer_id||!db.prepare('SELECT 1 FROM sites WHERE id=? AND customer_id=?').get(opportunity.site_id,opportunity.customer_id)))blockers.push('The selected location no longer belongs to this customer.');
   if(opportunity.asset_id&&(!opportunity.site_id||!db.prepare('SELECT 1 FROM assets WHERE id=? AND customer_id=? AND site_id=?').get(opportunity.asset_id,opportunity.customer_id,opportunity.site_id)))blockers.push('Select equipment at the linked customer location before offering.');
   if(opportunity.version!==quote.estimate.opportunityVersion)blockers.push('Opportunity changed since pricing. Recalculate and save a draft.');
   if(quote.document.validUntil<today||quote.estimate.pricingDate>today)blockers.push('Review quote validity and pricing dates.');
   const profile=pricing.get(user,quote.estimate.profileId).profile;
   if(profile.requiresReview||profile.version!==quote.estimate.profileVersion||!profile.config.active||profile.config.segment!==opportunity.segment||today<profile.config.effectiveFrom||(profile.config.effectiveTo&&today>profile.config.effectiveTo))blockers.push('Review current effective billing rules, recalculate and save the draft.');
   return {head,quote,opportunity,currentIssuer,bid,today,timeZone,blockers};
 }
 function summaryInTransaction(user,id,query={}){
   const selected=query.revision===undefined?undefined:parse(positive,query.revision),page=parse(positive,query.page??1);
   const {head,quote}=source(user,id,selected),saved=offer(id,quote.revision),ctx=context(user,id);
   const latest=saved?db.prepare('SELECT action FROM _sales_quote_lifecycle_events WHERE offer_id=? ORDER BY sequence DESC LIMIT 1').get(saved.id):null;
   const state=!saved?'not_offered':latest?.action==='revise'?'superseded':latest?.action==='withdraw'?'withdrawn':latest?.action==='expire'||(['offer','delivered'].includes(latest?.action)&&quote.document.validUntil<ctx.today)?'expired':['offer','delivered'].includes(latest?.action)?'offered':latest.action;
   const rows=db.prepare('SELECT * FROM _sales_quote_lifecycle_events WHERE quote_id=? AND quote_version=? ORDER BY sequence DESC LIMIT 26 OFFSET ?').all(id,quote.revision,(page-1)*25);
   return {quoteId:id,headVersion:head.version,quoteStatus:head.status,revision:quote.revision,eventSequence:latestSequence(id),state,companyDate:ctx.today,totalCents:quote.estimate.totalCents,validUntil:quote.document.validUntil,
     offer:saved?{id:saved.id,revision:saved.quote_version,issuerVersion:saved.issuer_version,offeredAt:saved.offered_at,documentHash:saved.document_hash,htmlHash:saved.html_hash,document:JSON.parse(saved.document_json)}:null,
     readiness:{canOffer:!ctx.blockers.length,blockers:ctx.blockers,opportunityVersion:ctx.opportunity.version,issuer:ctx.currentIssuer,policyVersion:ctx.bid.policy?.version??null,reviewSequence:ctx.bid.eventSequence,suggestedRecipient:{name:ctx.opportunity.contact_name||'',email:ctx.opportunity.contact_email||''}},
     history:rows.slice(0,25).map(event),page,hasMore:rows.length>25};
 }
 function summary(user,id,query={}){return transaction(db,()=>summaryInTransaction(user,id,query));}
 function frozenDocument(user,id,query={}){
   const selected=query.revision===undefined?undefined:parse(positive,query.revision);
   return transaction(db,()=>{
     const {quote}=source(user,id,selected),saved=offer(id,quote.revision);
     if(!saved)throw new SalesError('This saved revision has not been offered.',404);
     return {offerId:saved.id,documentHash:saved.document_hash,htmlHash:saved.html_hash,document:JSON.parse(saved.document_json),html:saved.html};
   });
 }
 function record(user,id,input){
   requireWriter(user);parse(uuid,id);const data=parse(command,input),digest=contentHash({quoteId:id,...data});
   if(['accepted','declined','withdraw'].includes(data.action)&&!isSalesAdmin(user))throw new SalesError('An owner or administrator must record customer responses or withdraw an offer.',403);
   return transaction(db,()=>{
     const {head,quote,opportunity}=source(user,id);
     const prior=db.prepare('SELECT * FROM _sales_quote_lifecycle_requests WHERE request_key=?').get(data.requestKey);
     if(prior){
       if(prior.actor_id!==user.id)throw new SalesError('This request belongs to another user.',403);
       if(prior.request_hash!==digest)throw new SalesError('This request key has different content.',409);
       return JSON.parse(prior.result_json);
     }
     const sequence=latestSequence(id);
     if(head.version!==data.expectedQuoteVersion||sequence!==data.expectedEventSequence)throw new SalesError('Quote lifecycle changed. Reload before continuing.',409);
     if(db.prepare('SELECT 1 FROM _sales_quote_lifecycle_events WHERE id=?').get(data.id))throw new SalesError('Lifecycle event ID already exists.',409);
     const {now,today,timeZone}=time(),stamp=now.toISOString();
     let saved=offer(id,head.version),details={},status=head.status;
     if(data.action==='offer'){
       const ctx=context(user,id);
       if(ctx.blockers.length)throw new SalesError(ctx.blockers.join(' '),409);
       if(data.expectedOpportunityVersion!==opportunity.version||data.expectedIssuerVersion!==ctx.currentIssuer.version||data.expectedPolicyVersion!==ctx.bid.policy?.version||data.expectedReviewSequence!==ctx.bid.eventSequence)throw new SalesError('Issuer, opportunity or pricing approval changed. Review current offer details.',409);
       if(saved)throw new SalesError('This revision already has an offer. Create a new draft revision.',409);
       const draft=documentInTransaction(user,id,head.version);
       const document={...draft,kind:'offered',identityBasis:'frozen_offer',issuer:ctx.currentIssuer,recipient:data.recipient,offeredAt:stamp};
       const json=JSON.stringify(document),html=renderCustomerQuoteHtml(document),documentHash=contentHash(json),htmlHash=contentHash(html);
       db.prepare('INSERT INTO _sales_quote_offers(id,quote_id,quote_version,opportunity_version,issuer_version,customer_id,site_id,asset_id,document_json,document_hash,html,html_hash,review_json,actor_id,offered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
         .run(data.id,id,head.version,opportunity.version,ctx.currentIssuer.version,opportunity.customer_id,opportunity.site_id,opportunity.asset_id,json,documentHash,html,htmlHash,JSON.stringify({policy:ctx.bid.policy,evaluationVersion:ctx.bid.evaluationVersion,eventSequence:ctx.bid.eventSequence,latest:ctx.bid.latest,state:ctx.bid.state}),user.id,stamp);
       saved=offer(id,head.version);status='offered';details={recipient:data.recipient,documentHash,htmlHash};
     }else{
       if(!saved||saved.id!==data.offerId)throw new SalesError('Select the offer for the current quote revision.',409);
       if(data.action==='revise'){
         if(!['offered','declined','expired','void'].includes(head.status))throw new SalesError('Only an unaccepted offer can become a new draft revision.',409);
         const next=head.version+1;
         db.prepare('INSERT INTO _sales_quote_revisions(quote_id,version,actor_id,document_json,pricing_json) SELECT quote_id,?, ?,document_json,pricing_json FROM _sales_quote_revisions WHERE quote_id=? AND version=?').run(next,user.id,id,head.version);
         db.prepare('INSERT INTO _sales_quote_revision_lines(quote_id,version,line_id,position,material_id,line_json) SELECT quote_id,?,line_id,position,material_id,line_json FROM _sales_quote_revision_lines WHERE quote_id=? AND version=?').run(next,id,head.version);
         db.prepare('INSERT INTO _sales_quote_revision_templates(quote_id,quote_version,template_id,template_version) SELECT quote_id,?,template_id,template_version FROM _sales_quote_revision_templates WHERE quote_id=? AND quote_version=?').run(next,id,head.version);
         db.prepare("UPDATE _sales_quotes SET version=?,status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(next,id);
         details={nextRevision:next};status='draft';
       }else{
         if(head.status!=='offered')throw new SalesError('This offer is closed. Its evidence cannot be overwritten.',409);
         if(data.action==='expire'){
           if(today<=quote.document.validUntil)throw new SalesError('The quote has not expired in the company calendar.',409);
           status='expired';details={companyDate:today,timeZone};
         }else if(data.action==='withdraw'){status='void';}
         else{
           if(today>quote.document.validUntil)throw new SalesError('This offer has expired. Create and review a new revision.',409);
           if(Date.parse(data.occurredAt)<Date.parse(saved.offered_at)||Date.parse(data.occurredAt)>now.getTime())throw new SalesError('Evidence time must be between offering and the current server time.',409);
           if(businessDay(new Date(data.occurredAt),timeZone)>quote.document.validUntil)throw new SalesError('Evidence time falls after quote validity.',409);
           details={occurredAt:data.occurredAt,evidenceReference:data.evidenceReference,attested:true,documentHash:saved.document_hash,htmlHash:saved.html_hash};
           if(data.action==='delivered')details.method=data.method;
           else{
             const delivered=db.prepare("SELECT evidence_json FROM _sales_quote_lifecycle_events WHERE offer_id=? AND action='delivered' ORDER BY sequence DESC LIMIT 1").get(saved.id);
             if(!delivered||Date.parse(data.occurredAt)<Date.parse(JSON.parse(delivered.evidence_json).occurredAt))throw new SalesError('Record delivery of this exact offer before a customer response.',409);
             details.respondent=data.respondent;details.capacity=data.capacity;status=data.action;
           }
         }
       }
       details={...details,documentHash:saved.document_hash,htmlHash:saved.html_hash};
     }
     if(data.action!=='revise')db.prepare('UPDATE _sales_quotes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,id);
     db.prepare('INSERT INTO _sales_quote_lifecycle_events(id,quote_id,quote_version,sequence,offer_id,actor_id,action,evidence_json,note,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
       .run(data.id,id,head.version,sequence+1,saved.id,user.id,data.action,JSON.stringify(details),data.note,stamp);
     const result={lifecycle:summaryInTransaction(user,id),communicationSent:false};
     db.prepare('INSERT INTO _sales_quote_lifecycle_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(data.requestKey,user.id,digest,JSON.stringify(result));
     return result;
   });
 }
 return {issuer,summary,record,frozenDocument};
}
