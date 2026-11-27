import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fixture,owner,member,other,viewer} from "./helpers/sales-quote-fixture.mjs";
import {assessBid} from "../src/server/sales/quote-review.mjs";
import {createSales} from "../src/server/sales/http.mjs";
import {openStorage} from "../src/server/sqlite.mjs";
import {installSales} from "../src/server/sales/storage.mjs";
import {createBillingProfiles} from "../src/server/sales/billing-profiles.mjs";
import {quoteSchema} from "../src/server/sales/quote-schema.mjs";
import {quoteTemplateSchema} from "../src/server/sales/quote-template-schema.mjs";
import {migrate} from "../src/server/platform/sqlite.mjs";
const fail=status=>error=>error.status===status;
function setup(t){
  const f=fixture(t),command=f.command(),quote=f.quotes.save(member,command).quote;
  const policy=(patch={})=>({requestKey:randomUUID(),expectedVersion:0,config:{schemaVersion:1,minimumMarginBasisPoints:2000,maximumDiscountBasisPoints:1000,requireApprovalForAll:true,reviewNote:"Reviewed company policy for this disposable fixture",...patch}});
  const review=(summary,patch={})=>({id:randomUUID(),requestKey:randomUUID(),expectedQuoteVersion:summary.revision,expectedPolicyVersion:summary.policy.version,expectedEventSequence:summary.eventSequence,action:"approve",approvalId:null,acknowledgedFlags:summary.flags.map(flag=>flag.id),note:"Reviewed this saved bid and every pricing exception",...patch});
  return {...f,command,quote,policy,review,api:f.quotes.review};
}

test("bid qualification stays unconfigured until an admin explicitly saves a reviewed policy",t=>{
 const f=setup(t);assert.equal(f.api.policyDetail(owner).policy,null);
 const missing=f.api.summary(member,f.quote.id);assert.equal(missing.state,"unconfigured");assert.equal(missing.qualified,false);assert.equal(missing.flags[0].kind,"policy_missing");
 const cmd=f.policy({requireApprovalForAll:false}),first=f.api.savePolicy(owner,cmd);
 assert.equal(first.policy.version,1);assert.equal(f.api.summary(member,f.quote.id).state,"within_policy");assert.equal(f.api.summary(member,f.quote.id).qualified,true);
 assert.deepEqual(f.api.savePolicy(owner,cmd),first);
 assert.throws(()=>f.api.savePolicy({...owner,id:"other-owner"},cmd),fail(403));
 assert.throws(()=>f.api.savePolicy(owner,{...cmd,config:{...cmd.config,requireApprovalForAll:true}}),fail(409));
 assert.throws(()=>f.api.savePolicy(owner,{...f.policy(),expectedVersion:0}),fail(409));
 for(const user of [member,other,viewer,{...owner,active:false},{...owner,mustChangePassword:true}])assert.throws(()=>f.api.savePolicy(user,f.policy()),fail(403));
 assert.throws(()=>f.api.policyDetail(member),fail(403));
 const second=f.api.savePolicy(owner,{...f.policy(),expectedVersion:1}).policy;assert.equal(second.version,2);
 assert.equal(f.api.policyDetail(owner).history.length,2);
 assert.equal(f.api.summary(member,f.quote.id).state,"approval_required");
});

test("exact margin and per-line limits expose tiny losses, threshold boundaries, zero costs and no-charge lines",()=>{
 const policy={minimumMarginBasisPoints:0,maximumDiscountBasisPoints:1000,requireApprovalForAll:false};
 assert.equal(assessBid({netCents:5000000000,costCents:5000000001,marginBasisPoints:0,lines:[]},policy)[0].kind,"minimum_margin");
 assert.equal(assessBid({netCents:5000,costCents:4000,lines:[]},{...policy,minimumMarginBasisPoints:2000}).length,0);
 assert.equal(assessBid({netCents:4999,costCents:4000,lines:[]},{...policy,minimumMarginBasisPoints:2000})[0].kind,"minimum_margin");
 const line={id:randomUUID(),description:"Reviewed service",netCents:100,costCents:50,discountBasisPoints:1000};
 assert.equal(assessBid({netCents:100,costCents:50,lines:[line]},policy).length,0);
 assert.equal(assessBid({netCents:100,costCents:50,lines:[{...line,discountBasisPoints:1001}]},policy)[0].kind,"discount_limit");
 const flags=assessBid({netCents:0,costCents:0,lines:[{...line,netCents:0,costCents:0,discountBasisPoints:10000}]},{...policy,requireApprovalForAll:true});
 assert.deepEqual(new Set(flags.map(flag=>flag.kind)),new Set(["manual_review","margin_unavailable","zero_cost","no_charge","discount_limit"]));
});

test("approval requires explicit acknowledgment of every current flag and freezes versioned evidence",t=>{
 const f=setup(t),cmd={...f.command,requestKey:randomUUID(),expectedVersion:1,estimate:{...f.command.estimate,lines:[{...f.command.estimate.lines[0],unitCostCents:0,unitSellCents:0,costOverrideReason:"Reviewed no-cost allowance explicitly"}]}};
 f.quotes.save(member,cmd);f.api.savePolicy(owner,f.policy());
 const before=f.api.summary(member,f.quote.id),command=f.review(before);
 assert.ok(before.flags.some(flag=>flag.kind==='zero_cost'));assert.ok(before.flags.some(flag=>flag.kind==='no_charge'));
 assert.throws(()=>f.api.record(owner,f.quote.id,{...command,acknowledgedFlags:[]}),fail(409));
 assert.throws(()=>f.api.record(owner,f.quote.id,{...command,acknowledgedFlags:[...command.acknowledgedFlags,command.acknowledgedFlags[0]]}),fail(409));
 const approved=f.api.record(owner,f.quote.id,command);assert.equal(approved.review.state,"approved");assert.equal(approved.review.qualified,true);
 assert.deepEqual(approved.review.latest.flags,before.flags);assert.equal(approved.review.latest.policyVersion,1);assert.equal(approved.review.latest.quoteVersion,2);assert.equal(approved.review.latest.evaluationVersion,1);
 assert.deepEqual(f.api.record(owner,f.quote.id,command),approved);
 assert.throws(()=>f.api.record({...owner,id:"other-admin"},f.quote.id,command),fail(403));
 assert.throws(()=>f.api.record(owner,f.quote.id,{...command,note:"Changed review narrative deliberately"}),fail(409));
 assert.throws(()=>f.api.record(owner,f.quote.id,{...command,requestKey:randomUUID()}),fail(409));
 const publicDoc=f.quotes.document(member,f.quote.id).document;assert.ok(!('review' in publicDoc));assert.doesNotMatch(JSON.stringify(publicDoc),/pricing exception|policyVersion|actorId/);
 assert.equal(f.quotes.detail(member,f.quote.id).quote.status,"draft");
});

test("quote and policy changes cannot inherit old approvals and stale competing reviewers cannot overwrite events",t=>{
 const f=setup(t);f.api.savePolicy(owner,f.policy());const before=f.api.summary(member,f.quote.id),cmd=f.review(before);
 f.api.record(owner,f.quote.id,cmd);
 assert.throws(()=>f.api.record(owner,f.quote.id,{...cmd,id:randomUUID(),requestKey:randomUUID()}),fail(409));
 f.api.savePolicy(owner,{...f.policy(),expectedVersion:1});
 const stale=f.api.summary(member,f.quote.id);assert.equal(stale.state,"approval_stale");assert.equal(stale.qualified,false);
 assert.throws(()=>f.api.record(owner,f.quote.id,f.review(stale,{expectedPolicyVersion:1})),fail(409));
 f.api.record(owner,f.quote.id,f.review(stale));assert.equal(f.api.summary(member,f.quote.id).state,"approved");
 f.quotes.save(member,{...f.command,requestKey:randomUUID(),expectedVersion:1,document:{...f.command.document,scope:"A deliberately revised scope"}});
 const fresh=f.api.summary(member,f.quote.id);assert.equal(fresh.revision,2);assert.equal(fresh.latest,null);assert.equal(fresh.state,"approval_required");
 assert.equal(f.api.summary(member,f.quote.id,{revision:1}).state,"approved");
 assert.throws(()=>f.api.record(owner,f.quote.id,{...f.review(fresh),expectedQuoteVersion:1}),fail(409));
 assert.equal(f.api.record(owner,f.quote.id,cmd).review.revision,1);
});

test("revocation is explicit, serial and immutable, and blocks an otherwise within-policy quote",t=>{
 const f=setup(t);f.api.savePolicy(owner,f.policy({requireApprovalForAll:false}));
 const approved=f.api.record(owner,f.quote.id,f.review(f.api.summary(member,f.quote.id))).review;
 const command=f.review(approved,{action:"revoke",approvalId:approved.latest.id,acknowledgedFlags:[],note:"Revoked pending a deliberate customer scope check"});
 assert.throws(()=>f.api.record(owner,f.quote.id,{...command,approvalId:randomUUID()}),fail(409));
 const revoked=f.api.record(owner,f.quote.id,command).review;assert.equal(revoked.state,"revoked");assert.equal(revoked.qualified,false);assert.equal(revoked.latest.approvalId,approved.latest.id);
 assert.equal(f.api.record(owner,f.quote.id,command).review.state,"revoked");
 assert.throws(()=>f.api.record(owner,f.quote.id,f.review(revoked,{action:"revoke",approvalId:approved.latest.id,acknowledgedFlags:[]})),fail(409));
 assert.equal(f.api.record(owner,f.quote.id,f.review(revoked)).review.state,"approved");
 const db=f.storage.database;
 for(const [table,column] of [["_sales_quote_review_events","note"],["_sales_quote_review_requests","result_json"],["_sales_quote_review_policy_revisions","config_json"],["_sales_quote_review_policy_requests","result_json"]]){
  assert.throws(()=>db.prepare(`UPDATE ${table} SET ${column}=${column}`).run(),/QUOTE_REVIEW_IMMUTABLE/);
  assert.throws(()=>db.prepare(`DELETE FROM ${table}`).run(),/QUOTE_REVIEW_IMMUTABLE/);
 }
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
});

test("review permissions, native ownership and malformed/stale inputs are enforced",t=>{
 const f=setup(t);f.api.savePolicy(owner,f.policy());const summary=f.api.summary(member,f.quote.id),cmd=f.review(summary);
 for(const user of [member,other,viewer,{...owner,active:false},{...owner,mustChangePassword:true}])assert.throws(()=>f.api.record(user,f.quote.id,cmd),fail(403));
 for(const user of [other,viewer])assert.throws(()=>f.api.summary(user,f.quote.id),fail(403));
 assert.throws(()=>f.api.summary(member,randomUUID()),fail(404));assert.throws(()=>f.api.summary(member,'bad'),fail(400));
 assert.throws(()=>f.api.summary(member,f.quote.id,{page:0}),fail(400));assert.throws(()=>f.api.summary(member,f.quote.id,{revision:999}),fail(404));
 assert.throws(()=>f.api.record(owner,f.quote.id,{...cmd,note:"short"}),fail(400));
 assert.throws(()=>f.api.savePolicy(owner,{...f.policy(),config:{...f.policy().config,minimumMarginBasisPoints:-1}}),fail(400));
 f.storage.database.prepare("UPDATE _sales_quotes SET status='offered' WHERE id=?").run(f.quote.id);
 assert.throws(()=>f.api.record(owner,f.quote.id,cmd),fail(409));
});

test("review and policy journal failures roll back every mutation without changing business records",t=>{
 const f=setup(t),db=f.storage.database;
 db.exec("CREATE TRIGGER fixture_policy_failure BEFORE INSERT ON _sales_quote_review_policy_requests BEGIN SELECT RAISE(ABORT,'POLICY_ACK_FAILURE'); END");
 assert.throws(()=>f.api.savePolicy(owner,f.policy()),/POLICY_ACK_FAILURE/);
 assert.equal(f.api.policyDetail(owner).policy,null);assert.equal(f.api.policyDetail(owner).history.length,0);
 db.exec("DROP TRIGGER fixture_policy_failure");f.api.savePolicy(owner,f.policy());
 const counts=()=>Object.fromEntries(["customers","sites","assets","materials","jobs","_sales_quotes","_sales_quote_revisions","_sales_quote_requests"].map(name=>[name,db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));const before=counts();
 db.exec("CREATE TRIGGER fixture_review_failure BEFORE INSERT ON _sales_quote_review_requests BEGIN SELECT RAISE(ABORT,'REVIEW_ACK_FAILURE'); END");
 const cmd=f.review(f.api.summary(member,f.quote.id));assert.throws(()=>f.api.record(owner,f.quote.id,cmd),/REVIEW_ACK_FAILURE/);
 assert.equal(f.api.summary(member,f.quote.id).eventSequence,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_review_requests").get().n,0);
 db.exec("DROP TRIGGER fixture_review_failure");f.api.record(owner,f.quote.id,cmd);
 assert.deepEqual(counts(),before);
});

test("policy and review history pagination remain bounded and retained across restart",t=>{
 const f=setup(t);let summary;
 for(let version=0;version<27;version++)f.api.savePolicy(owner,{...f.policy(),expectedVersion:version});
 assert.equal(f.api.policyDetail(owner).history.length,25);assert.equal(f.api.policyDetail(owner,{page:2}).history.length,2);
 for(let i=0;i<27;i++){summary=f.api.summary(member,f.quote.id);f.api.record(owner,f.quote.id,f.review(summary));}
 assert.equal(f.api.summary(member,f.quote.id).history.length,25);assert.equal(f.api.summary(member,f.quote.id,{page:2}).history.length,2);
 assert.equal(createSales(f.options).quotes.review.summary(member,f.quote.id).state,"approved");
});

test("review HTTP boundaries recheck the actor after streamed bodies and keep private data no-store",async t=>{
 const f=setup(t),headers={"Content-Type":"application/json","X-Requested-With":"OpenFieldService"};f.setActor(owner);
 const post=(path,data,extra={})=>f.app.request(path,{method:"POST",headers,body:JSON.stringify(data),...extra});
 const cmd=f.policy();
 assert.equal((await post('/review-policy',cmd,{headers:{"Content-Type":"application/json"}})).status,403);
 const revoked=new ReadableStream({pull(controller){f.setActor(member);controller.enqueue(new TextEncoder().encode(JSON.stringify(cmd)));controller.close();}});
 assert.equal((await post('/review-policy',cmd,{body:revoked,duplex:"half"})).status,403);
 f.setActor(owner);assert.equal((await post('/review-policy',cmd)).status,200);
 const approval=f.review(f.api.summary(member,f.quote.id));
 const lost=new ReadableStream({pull(controller){f.setActor(member);controller.enqueue(new TextEncoder().encode(JSON.stringify(approval)));controller.close();}});
 assert.equal((await post(`/quotes/${f.quote.id}/review`,approval,{body:lost,duplex:"half"})).status,403);
 const read=await f.app.request(`/quotes/${f.quote.id}/review`);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');
 f.setActor(owner);assert.equal((await post(`/quotes/${f.quote.id}/review`,approval)).status,200);
 assert.equal((await post('/review-policy',cmd,{body:' '.repeat(60000)})).status,413);
 f.setActor(viewer);assert.equal((await f.app.request(`/quotes/${f.quote.id}/review`)).status,403);
});

test("populated quote-v2 upgrade retains native templates, quotes, provenance and replay with no default policy",t=>{
 const f=setup(t),template=f.quotes.templates.save(owner,{id:randomUUID(),requestKey:randomUUID(),expectedVersion:0,name:"Migration template",title:"Reusable estimate",active:true,reviewNote:"Reviewed native template for migration proof",source:{quoteId:f.quote.id,revision:1}}).template;
 const command={...f.command,id:randomUUID(),requestKey:randomUUID(),template:{id:template.id,version:1}};f.quotes.save(member,command);
 const old=openStorage(":memory:");t.after(()=>old.close());installSales(old.database);createBillingProfiles({storage:old,sales:{}});migrate(old.database,"_sales_quote_migrations",[{version:1,sql:quoteSchema},{version:2,sql:quoteTemplateSchema}]);
 const tables=["materials","_sales_pipelines","_sales_stages","_sales_opportunities","_sales_billing_profiles","_sales_billing_profile_revisions","_sales_billing_profile_requests","_sales_quotes","_sales_quote_revisions","_sales_quote_revision_lines","_sales_quote_requests","_sales_quote_templates","_sales_quote_template_revisions","_sales_quote_template_lines","_sales_quote_template_requests","_sales_quote_revision_templates"];
 for(const table of tables)for(const row of f.storage.database.prepare(`SELECT * FROM ${table}`).all()){const keys=Object.keys(row);old.database.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));}
 const before=Object.fromEntries(tables.map(table=>[table,old.database.prepare(`SELECT * FROM ${table}`).all()]));
 const upgraded=createSales({...f.options,storage:old});
 assert.deepEqual(Object.fromEntries(tables.map(table=>[table,old.database.prepare(`SELECT * FROM ${table}`).all()])),before);
 assert.equal(upgraded.quotes.review.policyDetail(owner).policy,null);assert.equal(upgraded.quotes.review.summary(member,command.id).state,"unconfigured");
 assert.equal(upgraded.quotes.save(member,command).quote.template.id,template.id);
 assert.deepEqual(old.database.prepare("SELECT version FROM _sales_quote_migrations ORDER BY version").all().map(row=>row.version),[1,2,3,4,5,6,7]);assert.equal(old.database.prepare("PRAGMA foreign_key_check").all().length,0);
});
