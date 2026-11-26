import { commandFailureIsDefinite } from "../src/client/command-recovery.mjs";
import { templateInput } from "../src/client/quote-input.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, owner, member, other, viewer } from "./helpers/sales-quote-fixture.mjs";
import { createSales } from "../src/server/sales/http.mjs";
import { openStorage } from "../src/server/sqlite.mjs";
import { installSales } from "../src/server/sales/storage.mjs";
import { createBillingProfiles } from "../src/server/sales/billing-profiles.mjs";
import { quoteSchema } from "../src/server/sales/quote-schema.mjs";
import { migrate } from "../src/server/platform/sqlite.mjs";

function templateFixture(t){
  const f=fixture(t),quoteCommand=f.command();
  quoteCommand.estimate.lines[0].costOverrideReason="PRIVATE_OLD_COST_OVERRIDE";
  const source=f.quotes.save(member,quoteCommand).quote;
  const command=()=>({id:randomUUID(),requestKey:randomUUID(),expectedVersion:0,
    name:"Reviewed controls template",title:"Controls replacement estimate",active:true,
    reviewNote:"Reviewed reusable wording and rates; no customer identity.",source:{quoteId:source.id,revision:source.revision}});
  return {...f,source,quoteCommand,templateCommand:command};
}
const fail=status=>error=>error.status===status;

test("templates retain native source references and immutable versions, with actor-bound retry and archive history",t=>{
  const f=templateFixture(t),api=f.quotes.templates,cmd=f.templateCommand(),db=f.storage.database;
  const first=api.save(owner,cmd).template;
  assert.equal(first.version,1);
  assert.equal(first.config.lines[0].materialId,f.materialId);
  assert.equal(first.config.lines[0].unitCostCents,null);
  assert.doesNotMatch(JSON.stringify(first.config),/PRIVATE_OLD_COST_OVERRIDE|materialSnapshots|customerId|profileId/);
  assert.deepEqual(api.save(owner,cmd),{template:first});
  assert.throws(()=>api.save({...owner,id:"another-admin"},cmd),fail(403));
  assert.throws(()=>api.save(owner,{...cmd,name:"Different content"}),fail(409));
  const archived=api.save(owner,{...cmd,requestKey:randomUUID(),expectedVersion:1,active:false,reviewNote:"Archived deliberately pending a scope review"}).template;
  assert.equal(archived.version,2);assert.equal(archived.config.active,false);
  assert.equal(api.list(member).total,0);assert.equal(api.list(member,{state:"archived"}).total,1);
  assert.equal(api.detail(member,cmd.id,{revision:"1"}).template.config.active,true);
  assert.equal(api.detail(member,cmd.id).history.length,2);
  assert.deepEqual(api.save(owner,cmd),{template:first});
  assert.throws(()=>api.save(owner,{...cmd,requestKey:randomUUID(),expectedVersion:1}),fail(409));
  const restored=api.save(owner,{...cmd,requestKey:randomUUID(),expectedVersion:2,reviewNote:"Restored after the reusable scope review"}).template;
  assert.equal(restored.version,3);
  const restart=createSales(f.options);assert.equal(restart.quotes.templates.detail(member,cmd.id).template.version,3);
  for(const table of ["_sales_quote_template_revisions","_sales_quote_template_lines","_sales_quote_template_requests"]){
    assert.throws(()=>db.prepare(`UPDATE ${table} SET ${table.endsWith("lines")?"position=position":""+ (table.endsWith("requests")?"request_hash=request_hash":"config_json=config_json")}`).run(),/QUOTE_TEMPLATE_IMMUTABLE/);
    assert.throws(()=>db.prepare(`DELETE FROM ${table}`).run(),/QUOTE_TEMPLATE_IMMUTABLE/);
  }
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  assert.throws(()=>db.prepare("DELETE FROM materials WHERE id=?").run(f.materialId),/FOREIGN KEY/);
});

test("template instantiation uses current native material cost and fresh IDs without creating jobs, stock, customers or quotes",t=>{
  const f=templateFixture(t),api=f.quotes.templates,template=api.save(owner,f.templateCommand()).template,db=f.storage.database;
  const input={expectedTemplateVersion:1,opportunityId:f.opportunity.id,expectedOpportunityVersion:f.opportunity.version};
  const counts=()=>Object.fromEntries(["customers","sites","assets","materials","jobs","_sales_quotes","_sales_quote_revisions","_sales_quote_requests"].map(name=>[name,db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));
  const before=counts();f.setCost(1999);
  const instantiated=api.instantiate(member,template.id,input);
  assert.equal(instantiated.lines[0].unitCostCents,1999);
  assert.equal(instantiated.lines[0].unitSellCents,2000);
  assert.equal(instantiated.lines[0].costOverrideReason,"");
  assert.equal(instantiated.lines[0].materialId,f.materialId);
  assert.notEqual(instantiated.lines[0].id,f.source.estimate.lines[0].id);
  assert.notEqual(api.instantiate(member,template.id,input).lines[0].id,instantiated.lines[0].id);
  assert.deepEqual(instantiated.template,{id:template.id,version:1,name:template.config.name});
  assert.ok(instantiated.warnings.length);assert.equal(instantiated.materialSnapshots[0].unitCostCents,1999);
  assert.deepEqual(counts(),before);
  f.setCost(null);
  const unknown=api.instantiate(member,template.id,input);
  assert.equal(unknown.lines[0].unitCostCents,null);
  assert.equal(unknown.warnings.length,2);
  assert.throws(()=>f.quotes.save(member,{...f.command(),estimate:{...f.command().estimate,lines:unknown.lines}}),fail(400));
});

test("saved quote provenance freezes the selected template version, can detach and cannot be mutated or forged",t=>{
  const f=templateFixture(t),api=f.quotes.templates,templateCommand=f.templateCommand();
  const template=api.save(owner,templateCommand).template;
  const applied=api.instantiate(member,template.id,{expectedTemplateVersion:1,opportunityId:f.opportunity.id,expectedOpportunityVersion:0});
  const cmd={...f.command(),template:templateInput(applied.template),estimate:{...f.command().estimate,lines:applied.lines}};
  assert.deepEqual(cmd.template,{id:template.id,version:1});
  const quote=f.quotes.save(member,cmd).quote;
  assert.deepEqual(quote.template,{id:template.id,version:1,name:template.config.name});
  api.save(owner,{...templateCommand,requestKey:randomUUID(),expectedVersion:1,name:"Later renamed template",active:false});
  assert.equal(f.quotes.detail(member,cmd.id).quote.template.name,"Reviewed controls template");
  assert.deepEqual(f.quotes.save(member,cmd).quote.template,quote.template);
  const next=f.quotes.save(member,{...cmd,requestKey:randomUUID(),expectedVersion:1,template:null}).quote;
  assert.equal(next.template,null);
  assert.equal(f.quotes.detail(member,cmd.id,{revision:"1"}).quote.template.version,1);
  const db=f.storage.database;
  assert.throws(()=>db.prepare("DELETE FROM _sales_quote_revision_templates WHERE quote_id=?").run(cmd.id),/QUOTE_TEMPLATE_IMMUTABLE/);
  assert.throws(()=>db.prepare("UPDATE _sales_quote_revision_templates SET template_version=2 WHERE quote_id=?").run(cmd.id),/QUOTE_TEMPLATE_IMMUTABLE/);
  assert.throws(()=>f.quotes.save(member,{...f.command(),template:{id:randomUUID(),version:1}}),fail(404));
  assert.throws(()=>f.quotes.save(member,{...f.command(),template:{id:template.id,version:999}}),fail(404));
  const doc=f.quotes.document(member,cmd.id,{revision:"1"}).document;
  assert.ok(!("template" in doc));assert.doesNotMatch(JSON.stringify(doc),/reviewNote|Later renamed template/);
});

test("template boundaries reject stale versions, foreign owners, closed work and segment mismatches",t=>{
  const f=templateFixture(t),api=f.quotes.templates,template=api.save(owner,f.templateCommand()).template;
  const input={expectedTemplateVersion:1,opportunityId:f.opportunity.id,expectedOpportunityVersion:0};
  for(const actor of [member,other,viewer,{...owner,active:false},{...owner,mustChangePassword:true}])assert.throws(()=>api.save(actor,f.templateCommand()),fail(403));
  assert.throws(()=>api.list(viewer),fail(403));
  assert.throws(()=>api.instantiate(other,template.id,input),fail(403));
  assert.throws(()=>api.instantiate(member,template.id,{...input,expectedTemplateVersion:2}),fail(409));
  assert.throws(()=>api.instantiate(member,template.id,{...input,expectedOpportunityVersion:1}),fail(409));
  const db=f.storage.database;
  db.prepare("UPDATE _sales_opportunities SET segment='residential' WHERE id=?").run(f.opportunity.id);
  assert.throws(()=>api.instantiate(member,template.id,input),fail(409));
  db.prepare("UPDATE _sales_opportunities SET segment='commercial',stage_id=? WHERE id=?").run(f.service.pipelines()[0].stages.find(row=>row.kind==='won').id,f.opportunity.id);
  assert.throws(()=>api.instantiate(member,template.id,input),fail(409));
  for(const query of [{page:0},{state:"bad"},{segment:"bad"}])assert.throws(()=>api.list(member,query),fail(400));
  assert.throws(()=>api.detail(member,template.id,{revision:999}),fail(404));
});

test("failed template acknowledgment and quote provenance writes roll back the entire command",t=>{
  const f=templateFixture(t),db=f.storage.database,cmd=f.templateCommand();
  db.exec("CREATE TRIGGER fixture_template_failure BEFORE INSERT ON _sales_quote_template_requests BEGIN SELECT RAISE(ABORT,'ACK_FAILURE'); END");
  assert.throws(()=>f.quotes.templates.save(owner,cmd),/ACK_FAILURE/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_templates").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_template_revisions").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_template_lines").get().n,0);
  db.exec("DROP TRIGGER fixture_template_failure");
  f.quotes.templates.save(owner,cmd);
  const quote=f.command();
  db.exec("CREATE TRIGGER fixture_provenance_failure BEFORE INSERT ON _sales_quote_revision_templates BEGIN SELECT RAISE(ABORT,'PROVENANCE_FAILURE'); END");
  assert.throws(()=>f.quotes.save(member,{...quote,template:{id:cmd.id,version:1}}),/PROVENANCE_FAILURE/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quotes WHERE id=?").get(quote.id).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_revisions WHERE quote_id=?").get(quote.id).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_requests WHERE request_key=?").get(quote.requestKey).n,0);
});

test("template catalog and history pagination are bounded, searchable and segment-aware",t=>{
  const f=templateFixture(t),api=f.quotes.templates,cmd=f.templateCommand();
  for(let i=0;i<27;i++)api.save(owner,{...cmd,id:randomUUID(),requestKey:randomUUID(),name:`Fixture ${String(i).padStart(2,"0")}`});
  assert.equal(api.list(member).rows.length,25);assert.equal(api.list(member,{page:2}).rows.length,2);
  assert.equal(api.list(member,{search:"Fixture 26"}).total,1);
  assert.equal(api.list(member,{segment:"residential"}).total,0);
  const first=api.list(member).rows[0];
  for(let expectedVersion=1;expectedVersion<28;expectedVersion++)api.save(owner,{...cmd,id:first.id,requestKey:randomUUID(),expectedVersion});
  const recent=api.detail(member,first.id);assert.equal(recent.history.length,25);assert.equal(recent.hasMoreHistory,true);
  assert.equal(api.detail(member,first.id,{historyPage:2}).history.length,3);
});

test("template HTTP writes recheck the active actor after awaited bodies and keep standard CSRF/body boundaries",async t=>{
  const f=templateFixture(t),cmd=f.templateCommand(),headers={"Content-Type":"application/json","X-Requested-With":"OpenFieldService"};
  f.setActor(owner);
  const request=(path,body,extra={})=>f.app.request(path,{method:"POST",headers,body:JSON.stringify(body),...extra});
  assert.equal((await request("/quote-templates",cmd,{headers:{"Content-Type":"application/json"}})).status,403);
  const revoked=new ReadableStream({pull(controller){f.setActor(member);controller.enqueue(new TextEncoder().encode(JSON.stringify(cmd)));controller.close();}});
  assert.equal((await request("/quote-templates",cmd,{body:revoked,duplex:"half"})).status,403);
  f.setActor(owner);assert.equal((await request("/quote-templates",cmd)).status,200);
  f.setActor(member);assert.equal((await f.app.request('/quote-templates')).status,200);
  const input={expectedTemplateVersion:1,opportunityId:f.opportunity.id,expectedOpportunityVersion:0};
  const foreign=new ReadableStream({pull(controller){f.setActor(other);controller.enqueue(new TextEncoder().encode(JSON.stringify(input)));controller.close();}});
  assert.equal((await request(`/quote-templates/${cmd.id}/instantiate`,input,{body:foreign,duplex:"half"})).status,403);
  f.setActor(member);assert.equal((await request(`/quote-templates/${cmd.id}/instantiate`,input)).status,200);
  f.setActor(viewer);assert.equal((await f.app.request('/quote-templates')).status,403);
  f.setActor(owner);assert.equal((await request('/quote-templates',cmd,{body:' '.repeat(60000)})).status,413);
});

test("quote v1 upgrade adds template storage without changing native records or invalidating legacy request replay",t=>{
  const f=templateFixture(t),legacy=openStorage(":memory:");t.after(()=>legacy.close());
  installSales(legacy.database);createBillingProfiles({storage:legacy,sales:{}});
  migrate(legacy.database,"_sales_quote_migrations",[{version:1,sql:quoteSchema}]);
  const tables=["materials","_sales_pipelines","_sales_stages","_sales_opportunities","_sales_billing_profiles","_sales_billing_profile_revisions","_sales_billing_profile_requests","_sales_quotes","_sales_quote_revisions","_sales_quote_revision_lines","_sales_quote_requests"];
  for(const table of tables){
    const rows=f.storage.database.prepare(`SELECT * FROM ${table}`).all();
    for(const row of rows){
      if(table==="_sales_quote_requests"){const result=JSON.parse(row.result_json);delete result.quote.template;row.result_json=JSON.stringify(result);}
      const columns=Object.keys(row);legacy.database.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(column=>row[column]));
    }
  }
  const before=Object.fromEntries(tables.map(table=>[table,legacy.database.prepare(`SELECT * FROM ${table}`).all()]));
  const upgraded=createSales({...f.options,storage:legacy});
  assert.deepEqual(Object.fromEntries(tables.map(table=>[table,legacy.database.prepare(`SELECT * FROM ${table}`).all()])),before);
  assert.equal(upgraded.quotes.detail(member,f.source.id).quote.template,null);
  const replay=upgraded.quotes.save(member,f.quoteCommand);
  assert.equal(replay.quote.id,f.source.id);assert.ok(!('template' in replay.quote));
  assert.deepEqual(legacy.database.prepare("SELECT version FROM _sales_quote_migrations ORDER BY version").all().map(row=>row.version),[1,2,3,4,5]);
  assert.equal(legacy.database.prepare("PRAGMA foreign_key_check").all().length,0);
});

test("template labor defaults stay explicit while missing, invalid and archived material sources fail honestly",t=>{
  const f=templateFixture(t),cmd=f.command();
  cmd.estimate.lines.push({...cmd.estimate.lines[0],id:randomUUID(),kind:"apprentice",description:"Apprentice support",materialId:null,quantityMilli:1500,headcount:2,unitCostCents:2500,unitSellCents:7000,costOverrideReason:""});
  const source=f.quotes.save(member,cmd).quote;
  const templateCommand={...f.templateCommand(),source:{quoteId:source.id,revision:1}};
  const api=f.quotes.templates,template=api.save(owner,templateCommand).template;
  const input={expectedTemplateVersion:1,opportunityId:f.opportunity.id,expectedOpportunityVersion:0};
  f.setCost(2500);const applied=api.instantiate(member,template.id,input);
  assert.equal(applied.lines[1].kind,"apprentice");assert.equal(applied.lines[1].quantityMilli,1500);assert.equal(applied.lines[1].headcount,2);
  assert.equal(applied.lines[1].unitCostCents,2500);assert.equal(applied.lines[1].unitSellCents,7000);
  assert.equal(applied.lines[0].unitCostCents,2500);
  f.setCost(-1);assert.throws(()=>api.instantiate(member,template.id,input),fail(422));
  const unavailable=createSales({...f.options,materialSnapshots:undefined});
  assert.throws(()=>unavailable.quotes.templates.instantiate(member,template.id,input),fail(503));
  const missing=createSales({...f.options,materialSnapshots:()=>[]});
  assert.throws(()=>missing.quotes.templates.instantiate(member,template.id,input),fail(409));
  api.save(owner,{...templateCommand,requestKey:randomUUID(),expectedVersion:1,active:false});
  assert.throws(()=>api.instantiate(member,template.id,{...input,expectedTemplateVersion:2}),fail(409));
});

test("failed recovery after permission revocation cannot classify a previously committed command as unwritten",t=>{
  const f=templateFixture(t),cmd=f.templateCommand();
  f.quotes.templates.save(owner,cmd); // Model a committed write whose response was lost.
  let status;
  try{f.quotes.templates.save({...owner,active:false},cmd);}catch(error){status=error.status;}
  assert.equal(status,403);
  assert.equal(commandFailureIsDefinite(status,true),false);
  assert.equal(f.storage.database.prepare("SELECT COUNT(*) AS n FROM _sales_quote_templates WHERE id=?").get(cmd.id).n,1);
  assert.equal(commandFailureIsDefinite(409,false),true);
  for(const response of [undefined,408,500,502])assert.equal(commandFailureIsDefinite(response,false),false);
  assert.deepEqual(f.quotes.templates.save(owner,cmd).template.id,cmd.id);
});
