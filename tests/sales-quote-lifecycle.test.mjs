import {openStorage} from '../src/server/sqlite.mjs';
import {installSales} from '../src/server/sales/storage.mjs';
import {createBillingProfiles} from '../src/server/sales/billing-profiles.mjs';
import {createSales} from '../src/server/sales/http.mjs';
import {migrate} from '../src/server/platform/sqlite.mjs';
import {quoteSchema} from '../src/server/sales/quote-schema.mjs';
import {quoteTemplateSchema} from '../src/server/sales/quote-template-schema.mjs';
import {quoteReviewSchema} from '../src/server/sales/quote-review-schema.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,member,owner,other,viewer} from './helpers/sales-quote-fixture.mjs';
const fail=status=>error=>error.status===status;
function setup(t){
 let instant=new Date('2026-11-15T16:00:00Z');
 const f=fixture(t,{clock:()=>new Date(instant)}),api=f.quotes.lifecycle;
 const issuerCommand=()=>({requestKey:randomUUID(),expectedVersion:0,config:{schemaVersion:1,legalName:'Fixture Mechanical <test>',address:'123 Fixture Way',email:'office@example.test',phone:'555-0100',terms:'Fixture-only scope and terms, not an actual business offer.',reviewNote:'Reviewed issuer details for disposable tests only.'}});
 const policy=f.quotes.review.savePolicy(owner,{requestKey:randomUUID(),expectedVersion:0,config:{schemaVersion:1,minimumMarginBasisPoints:0,maximumDiscountBasisPoints:10000,requireApprovalForAll:false,reviewNote:'Disposable within-limit policy for lifecycle tests.'}});
 const quote=f.quotes.save(member,f.command()).quote;
 function action(kind,patch={}){
  const current=api.summary(member,quote.id),base={id:randomUUID(),requestKey:randomUUID(),expectedQuoteVersion:current.headVersion,expectedEventSequence:current.eventSequence,action:kind,note:'Reviewed disposable quote lifecycle evidence.'};
  return {...base,...(kind==='offer'?{expectedOpportunityVersion:current.readiness.opportunityVersion,expectedIssuerVersion:current.readiness.issuer?.version??1,expectedPolicyVersion:policy.policy.version,expectedReviewSequence:current.readiness.reviewSequence,recipient:{name:'Fixture recipient',email:'customer@example.test'}}:{offerId:current.offer?.id}),...patch};
 }
 function issue(){api.issuer.save(owner,issuerCommand());return api.record(member,quote.id,action('offer'));}
 function delivered(){instant=new Date(instant.getTime()+60000);return api.record(member,quote.id,action('delivered',{occurredAt:instant.toISOString(),evidenceReference:'Private fixture delivery archive message 123',attested:true,method:'email'}));}
 return {...f,api,quote,issuerCommand,action,issue,delivered,setTime:value=>{instant=new Date(value);},now:()=>instant.toISOString()};
}

test('quote issuer is unconfigured until explicitly reviewed; admin-only immutable versions and replay survive changes',t=>{
 const f=setup(t);assert.equal(f.api.issuer.detail(owner).issuer,null);
 assert.equal(f.api.summary(member,f.quote.id).readiness.canOffer,false);
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('offer')),fail(409));
 const cmd=f.issuerCommand(),first=f.api.issuer.save(owner,cmd);
 assert.deepEqual(f.api.issuer.save(owner,cmd),first);
 for(const user of [member,viewer,{...owner,active:false},{...owner,mustChangePassword:true}])assert.throws(()=>f.api.issuer.save(user,f.issuerCommand()),fail(403));
 assert.throws(()=>f.api.issuer.detail(member),fail(403));
 assert.throws(()=>f.api.issuer.save(owner,{...cmd,config:{...cmd.config,phone:'changed'}}),fail(409));
 assert.throws(()=>f.api.issuer.save({...owner,id:'another-admin'},cmd),fail(403));
 assert.throws(()=>f.api.issuer.save(owner,f.issuerCommand()),fail(409));
 const second=f.api.issuer.save(owner,{...f.issuerCommand(),expectedVersion:1});assert.equal(second.issuer.version,2);
 assert.equal(f.api.issuer.detail(owner).history.length,2);
 assert.throws(()=>f.storage.database.prepare('DELETE FROM _sales_quote_issuer_revisions').run());
});

test('offer atomically freezes exact document/issuer/recipient/pricing control; downloaded HTML is immutable and escaped',t=>{
 const f=setup(t),result=f.issue();assert.equal(result.communicationSent,false);
 assert.equal(result.lifecycle.state,'offered');assert.equal(f.quotes.detail(member,f.quote.id).quote.status,'offered');
 const frozen=f.api.frozenDocument(member,f.quote.id),json=JSON.stringify(frozen.document);
 assert.equal(frozen.document.kind,'offered');assert.equal(frozen.document.identityBasis,'frozen_offer');
 assert.equal(frozen.document.issuer.legalName,'Fixture Mechanical <test>');assert.equal(frozen.document.recipient.email,'customer@example.test');
 assert.equal(frozen.documentHash,createHash('sha256').update(json).digest('hex'));
 assert.equal(frozen.htmlHash,createHash('sha256').update(frozen.html).digest('hex'));
 assert.match(frozen.html,/Fixture Mechanical &lt;test&gt;/);assert.match(frozen.html,/OFFERED QUOTE/);
 assert.doesNotMatch(json,/unitCostCents|reviewNote|costOverrideReason|materialSnapshots|profitCents/);
 f.api.issuer.save(owner,{...f.issuerCommand(),expectedVersion:1,config:{...f.issuerCommand().config,legalName:'New company issuer'}});
 f.storage.database.prepare('UPDATE _sales_opportunities SET prospect_name=?,contact_email=?,version=version+1 WHERE id=?').run('Changed prospect','changed@example.test',f.opportunity.id);
 assert.deepEqual(f.api.frozenDocument(member,f.quote.id),frozen);
 assert.throws(()=>f.quotes.save(member,{...f.command(),id:f.quote.id,expectedVersion:1}),fail(409));
 for(const table of ['_sales_quote_offers','_sales_quote_lifecycle_events','_sales_quote_lifecycle_requests'])assert.throws(()=>f.storage.database.prepare('DELETE FROM '+table).run());
 assert.equal(f.storage.database.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('offering rechecks pricing/policy/issuer/opportunity versions and never permits pending material pricing',t=>{
 const f=setup(t);f.api.issuer.save(owner,f.issuerCommand());
 const command=f.action('offer');
 for(const key of ['expectedQuoteVersion','expectedEventSequence','expectedOpportunityVersion','expectedIssuerVersion','expectedPolicyVersion','expectedReviewSequence'])assert.throws(()=>f.api.record(member,f.quote.id,{...command,[key]:99}),fail(409));
 const pending=f.command();pending.id=f.quote.id;pending.expectedVersion=1;pending.estimate.lines[0]={...pending.estimate.lines[0],unitCostCents:null,pricingPending:true,pendingPricingNote:'Waiting for fixture supplier cost.'};
 f.quotes.save(member,pending);
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('offer')),fail(409));
 assert.equal(f.storage.database.prepare('SELECT COUNT(*) AS n FROM _sales_quote_offers').get().n,0);
});

test('current-owner/admin access gates every offer/history/export read and exact replay; response actions require admin',t=>{
 const f=setup(t);f.api.issuer.save(owner,f.issuerCommand());const cmd=f.action('offer'),first=f.api.record(member,f.quote.id,cmd);
 assert.deepEqual(f.api.record(member,f.quote.id,cmd),first);
 assert.throws(()=>f.api.record(member,f.quote.id,{...cmd,note:'A different request with the same request key.'}),fail(409));
 for(const user of [other,viewer,{...member,active:false},{...member,mustChangePassword:true}]){
  assert.throws(()=>f.api.summary(user,f.quote.id),fail(403));
  assert.throws(()=>f.api.frozenDocument(user,f.quote.id),fail(403));
  assert.throws(()=>f.api.record(user,f.quote.id,cmd),fail(403));
 }
 assert.throws(()=>f.api.record(owner,f.quote.id,cmd),fail(403));
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('withdraw')),fail(403));
});

test('recorded delivery and acceptance bind exact offer hashes, evidence and respondent; no job or Won transition is inferred',t=>{
 const f=setup(t);f.issue();const offer=f.api.summary(member,f.quote.id).offer;
 const response=()=>f.action('accepted',{occurredAt:f.now(),evidenceReference:'Fixture signed document archive reference 123',attested:true,respondent:{name:'Fixture signatory',email:'customer@example.test'},capacity:'Authorized fixture representative'});
 assert.throws(()=>f.api.record(owner,f.quote.id,response()),fail(409));
 f.delivered();f.setTime('2026-11-15T16:02:00Z');const cmd=response();
 const accepted=f.api.record(owner,f.quote.id,cmd);assert.equal(accepted.lifecycle.state,'accepted');assert.equal(accepted.lifecycle.quoteStatus,'accepted');
 const event=accepted.lifecycle.history[0];assert.equal(event.evidence.documentHash,offer.documentHash);assert.equal(event.evidence.htmlHash,offer.htmlHash);assert.equal(event.evidence.respondent.name,'Fixture signatory');
 assert.deepEqual(f.api.record(owner,f.quote.id,cmd),accepted);
 for(const action of ['withdraw','revise','expire'])assert.throws(()=>f.api.record(owner,f.quote.id,f.action(action)),fail(409));
 assert.equal(f.service.opportunity(f.opportunity.id).stage_kind,'open');
 assert.equal(f.storage.database.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
});

test('evidence must be explicit, after offering/delivery and not in the future; stale competing responses fail',t=>{
 const f=setup(t);f.issue();
 const cmd=f.action('delivered',{occurredAt:'2026-11-15T15:59:00Z',evidenceReference:'Fixture external delivery reference',attested:true,method:'email'});
 assert.throws(()=>f.api.record(member,f.quote.id,cmd),fail(409));
 assert.throws(()=>f.api.record(member,f.quote.id,{...cmd,occurredAt:'2026-11-15T16:01:00Z'}),fail(409));
 assert.throws(()=>f.api.record(member,f.quote.id,{...cmd,occurredAt:f.now(),attested:false}),fail(400));
 f.delivered();const decline=f.action('declined',{occurredAt:f.now(),evidenceReference:'Fixture written decline reference 123',attested:true,respondent:{name:'Fixture recipient',email:'customer@example.test'},capacity:'Customer representative'});
 const competing={...decline,id:randomUUID(),requestKey:randomUUID(),action:'accepted'};
 assert.equal(f.api.record(owner,f.quote.id,decline).lifecycle.state,'declined');
 assert.throws(()=>f.api.record(owner,f.quote.id,competing),fail(409));
});

test('revise appends copied draft/lines/template provenance and supersedes the prior offer without inheriting approval',t=>{
 const f=setup(t);f.issue();const frozen=f.api.frozenDocument(member,f.quote.id);
 const cmd=f.action('revise'),result=f.api.record(member,f.quote.id,cmd);
 assert.equal(result.lifecycle.headVersion,2);assert.equal(result.lifecycle.quoteStatus,'draft');assert.equal(result.lifecycle.offer,null);
 assert.equal(f.api.summary(member,f.quote.id,{revision:1}).state,'superseded');
 assert.deepEqual(f.api.frozenDocument(member,f.quote.id,{revision:1}),frozen);
 const draft=f.quotes.detail(member,f.quote.id).quote;assert.equal(draft.revision,2);assert.equal(draft.estimate.lines[0].materialId,f.materialId);
 assert.equal(f.quotes.review.summary(member,f.quote.id).latest,null);
 assert.deepEqual(f.api.record(member,f.quote.id,cmd),result);
 assert.throws(()=>f.api.frozenDocument(member,f.quote.id),fail(404));
});

test('expiry uses the company calendar, reads do not mutate status, and closed offers require new revisions',t=>{
 const f=setup(t);f.storage.companyTimeZone=()=> 'America/New_York';f.issue();
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('expire')),fail(409));
 f.setTime('2026-12-16T04:59:00Z');assert.equal(f.api.summary(member,f.quote.id).state,'offered');
 f.setTime('2026-12-16T05:00:00Z');assert.equal(f.api.summary(member,f.quote.id).state,'expired');
 assert.equal(f.quotes.detail(member,f.quote.id).quote.status,'offered');
 assert.throws(()=>f.delivered(),fail(409));
 const expired=f.api.record(member,f.quote.id,f.action('expire'));assert.equal(expired.lifecycle.quoteStatus,'expired');
 assert.equal(f.api.record(member,f.quote.id,f.action('revise')).lifecycle.quoteStatus,'draft');
});

test('a failed journal rolls back offer/status/event atomically; HTTP export is private and exact',async t=>{
 const f=setup(t);f.api.issuer.save(owner,f.issuerCommand());const db=f.storage.database;
 db.exec("CREATE TRIGGER test_fail_lifecycle BEFORE INSERT ON _sales_quote_lifecycle_requests BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('offer')));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM _sales_quote_offers').get().n,0);assert.equal(f.quotes.detail(member,f.quote.id).quote.status,'draft');
 db.exec('DROP TRIGGER test_fail_lifecycle');f.api.record(member,f.quote.id,f.action('offer'));
 f.setActor(member);
 const html=await f.app.request('http://local/quotes/'+f.quote.id+'/offer-document.html');
 assert.equal(html.status,200);assert.match(html.headers.get('Cache-Control'),/no-store/);assert.match(html.headers.get('Content-Security-Policy'),/sandbox/);
 assert.equal(await html.text(),f.api.frozenDocument(member,f.quote.id).html);
 const json=await f.app.request('http://local/quotes/'+f.quote.id+'/offer-document');assert.equal(json.status,200);assert.equal('html' in await json.json(),false);
 const forbidden=await f.app.request('http://local/quotes/'+f.quote.id+'/lifecycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f.action('revise'))});assert.equal(forbidden.status,403);
});


test('populated quote-v3 migration retains drafts, pending nulls, templates and approvals without inventing an issuer or offers',t=>{
 const f=setup(t),template=f.quotes.templates.save(owner,{id:randomUUID(),requestKey:randomUUID(),expectedVersion:0,name:'Retained template',title:'Reviewed template',active:true,reviewNote:'Fixture template before the offer migration.',source:{quoteId:f.quote.id,revision:1}}).template;
 const command=f.command();command.template={id:template.id,version:1};command.estimate.lines[0]={...command.estimate.lines[0],unitCostCents:null,pricingPending:true,pendingPricingNote:'Supplier price was still pending before migration.'};
 const pending=f.quotes.save(member,command).quote;
 const bid=f.quotes.review.summary(owner,f.quote.id);
 f.quotes.review.record(owner,f.quote.id,{id:randomUUID(),requestKey:randomUUID(),expectedQuoteVersion:1,expectedPolicyVersion:1,expectedEventSequence:0,action:'approve',approvalId:null,acknowledgedFlags:bid.flags.map(flag=>flag.id),note:'Retain this explicit prior approval through migration.'});
 const legacy=openStorage(':memory:');t.after(()=>legacy.close());installSales(legacy.database);createBillingProfiles({storage:legacy,sales:{}});
 migrate(legacy.database,'_sales_quote_migrations',[{version:1,sql:quoteSchema},{version:2,sql:quoteTemplateSchema},{version:3,sql:quoteReviewSchema}]);
 const tables=['materials','_sales_pipelines','_sales_stages','_sales_opportunities','_sales_billing_profiles','_sales_billing_profile_revisions','_sales_billing_profile_requests','_sales_quotes','_sales_quote_revisions','_sales_quote_revision_lines','_sales_quote_requests','_sales_quote_templates','_sales_quote_template_revisions','_sales_quote_template_lines','_sales_quote_template_requests','_sales_quote_revision_templates','_sales_quote_review_policy','_sales_quote_review_policy_revisions','_sales_quote_review_policy_requests','_sales_quote_review_events','_sales_quote_review_requests'];
 // Policy head has no FK; immutable event inserts follow the referenced policy revisions.
 for(const table of tables)for(const row of f.storage.database.prepare('SELECT * FROM '+table).all()){
  const keys=Object.keys(row);legacy.database.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));
 }
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,legacy.database.prepare('SELECT * FROM '+table).all()])),before=snapshot();
 const upgraded=createSales({...f.options,storage:legacy});assert.deepEqual(snapshot(),before);
 assert.equal(upgraded.quotes.lifecycle.issuer.detail(owner).issuer,null);
 assert.equal(upgraded.quotes.lifecycle.summary(member,pending.id).offer,null);
 assert.equal(upgraded.quotes.detail(member,pending.id).quote.estimate.costCents,null);
 assert.deepEqual(upgraded.quotes.save(member,command).quote,pending);
 assert.equal(upgraded.quotes.review.summary(member,f.quote.id).state,'approved');
 assert.deepEqual(legacy.database.prepare('SELECT version FROM _sales_quote_migrations ORDER BY version').all().map(row=>row.version),[1,2,3,4,5,6,7]);
 assert.equal(legacy.database.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('native customer/location/equipment snapshots remain immutable and foreign links cannot be offered',t=>{
 const f=setup(t),db=f.storage.database,customer=randomUUID(),foreign=randomUUID(),site=randomUUID(),asset=randomUUID();
 db.prepare('INSERT INTO customers(id,name,address) VALUES(?,?,?)').run(customer,'Native customer','Original address');
 db.prepare('INSERT INTO customers(id,name) VALUES(?,?)').run(foreign,'Another customer');
 db.prepare('INSERT INTO sites(id,customer_id,name,address) VALUES(?,?,?,?)').run(site,customer,'Native location','Original location');
 db.prepare('INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)').run(asset,customer,site,'Native equipment','QA-1');
 db.prepare('UPDATE _sales_opportunities SET customer_id=?,site_id=?,asset_id=? WHERE id=?').run(customer,site,asset,f.opportunity.id);
 f.issue();const frozen=f.api.frozenDocument(member,f.quote.id);
 assert.equal(frozen.document.customer.name,'Native customer');assert.equal(frozen.document.site.name,'Native location');assert.equal(frozen.document.equipment.name,'Native equipment');
 db.prepare('UPDATE customers SET name=? WHERE id=?').run('Renamed customer',customer);
 db.prepare('UPDATE sites SET name=? WHERE id=?').run('Renamed site',site);
 assert.deepEqual(f.api.frozenDocument(member,f.quote.id),frozen);
 assert.throws(()=>db.prepare('DELETE FROM assets WHERE id=?').run(asset));
 f.api.record(member,f.quote.id,f.action('revise'));
 assert.throws(()=>db.prepare('UPDATE sites SET customer_id=? WHERE id=?').run(foreign,site));
 const foreignSite=randomUUID();db.prepare('INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)').run(foreignSite,foreign,'Foreign location');
 db.prepare('UPDATE _sales_opportunities SET site_id=?,asset_id=NULL WHERE id=?').run(foreignSite,f.opportunity.id);
 assert.equal(f.api.summary(member,f.quote.id).readiness.canOffer,false);
 assert.throws(()=>f.api.record(member,f.quote.id,f.action('offer')),fail(409));
});

test('lifecycle HTTP commands recheck the actor after streamed bodies; reads/history are bounded and private',async t=>{
 const f=setup(t);f.api.issuer.save(owner,f.issuerCommand());const cmd=f.action('offer');
 const revoked=new ReadableStream({pull(controller){f.setActor(other);controller.enqueue(new TextEncoder().encode(JSON.stringify(cmd)));controller.close();}});
 const post=async(data,body=JSON.stringify(data))=>f.app.request('http://local/quotes/'+f.quote.id+'/lifecycle',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'OpenFieldService'},body,...(body instanceof ReadableStream?{duplex:'half'}:{})});
 assert.equal((await post(cmd,revoked)).status,403);
 f.setActor(member);assert.equal((await post(cmd)).status,200);
 for(let i=0;i<27;i++)f.delivered();
 const summary=f.api.summary(member,f.quote.id);assert.equal(summary.history.length,25);assert.equal(summary.hasMore,true);
 assert.equal(f.api.summary(member,f.quote.id,{page:2}).history.length,3);
 const get=await f.app.request('http://local/quotes/'+f.quote.id+'/lifecycle');assert.equal(get.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await post({...f.action('revise'),unexpected:true})).status,400);
 assert.equal((await post(cmd,' '.repeat(60000))).status,413);
});
