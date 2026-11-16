import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,owner,other,viewer} from './helpers/sales-quote-fixture.mjs';
import {editLine,lineInput,quoteMoney} from '../src/client/quote-input.mjs';
const fails=status=>error=>error.status===status;
function pending(f,patch={}) {
 const cmd=f.command();
 cmd.estimate.lines[0]={...cmd.estimate.lines[0],materialId:null,unitCostCents:null,unitSellCents:null,pricingPending:true,pendingPricingNote:'Awaiting supplier part identification and pricing.',...patch};
 return cmd;
}
function configure(f){f.quotes.review.savePolicy(owner,{requestKey:randomUUID(),expectedVersion:0,config:{schemaVersion:1,minimumMarginBasisPoints:0,maximumDiscountBasisPoints:10000,requireApprovalForAll:false,reviewNote:'Disposable policy used to prove incomplete pricing is never approved.'}});}

test('unlisted material draft persists unknown amounts as null, exact known subtotals, native links and actor-bound replay',t=>{
 const f=fixture(t),cmd=pending(f);
 cmd.estimate.lines.push({...f.command().estimate.lines[0],id:randomUUID(),kind:'technician',materialId:null,unitCostCents:5000,unitSellCents:10000});
 const result=f.quotes.save(member,cmd),price=result.quote.estimate;
 assert.equal(price.pricingComplete,false);assert.equal(price.calculationVersion,2);
 for(const field of ['costCents','netCents','taxCents','totalCents','profitCents','marginBasisPoints','markupBasisPoints'])assert.equal(price[field],null);
 assert.equal(price.knownTotals.costCents,12500); // 2.5 hours × $50
 assert.equal(price.knownTotals.totalCents,26250); // exact exclusive 5% tax
 assert.deepEqual(price.pendingLineIds,[cmd.estimate.lines[0].id]);
 assert.equal(price.lines[0].materialId,null);assert.equal(price.lines[0].unitCostCents,null);
 assert.deepEqual(f.quotes.save(member,cmd),result);
 assert.throws(()=>f.quotes.save(other,cmd),fails(403));
 assert.throws(()=>f.quotes.save(viewer,cmd),fails(403));
 assert.equal(f.quotes.detail(member,result.quote.id).quote.estimate.lines[0].pendingPricingNote,cmd.estimate.lines[0].pendingPricingNote);
 const row=f.quotes.list(member).quotes[0];assert.equal(row.pricingComplete,false);assert.equal(row.totalCents,null);
 const db=f.storage.database;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM materials').get().n,1);
 assert.equal(db.prepare('SELECT material_id FROM _sales_quote_revision_lines WHERE quote_id=? AND position=0').get(result.quote.id).material_id,null);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('known selling rates do not invent a cost or a profit; exact selling and tax totals remain available',t=>{
 const f=fixture(t),cmd=pending(f,{materialId:f.materialId,unitSellCents:2000});
 const quote=f.quotes.save(member,cmd).quote;
 assert.equal(quote.estimate.totalCents,5250);assert.equal(quote.estimate.costCents,null);
 assert.equal(quote.estimate.profitCents,null);assert.equal(quote.estimate.marginBasisPoints,null);
 assert.equal(quote.estimate.lines[0].costCents,null);
 assert.equal(quote.estimate.materialSnapshots[0].id,f.materialId);
});

test('pending pricing cannot be approved, exported or templated, even with every flag acknowledged under permissive policy',async t=>{
 const f=fixture(t),quote=f.quotes.save(member,pending(f)).quote;
 configure(f);
 const review=f.quotes.review.summary(owner,quote.id);
 assert.equal(review.state,'pricing_incomplete');assert.equal(review.qualified,false);
 assert.equal(review.flags[0].kind,'pricing_incomplete');
 assert.throws(()=>f.quotes.review.record(owner,quote.id,{id:randomUUID(),requestKey:randomUUID(),expectedQuoteVersion:1,expectedPolicyVersion:1,expectedEventSequence:0,action:'approve',approvalId:null,acknowledgedFlags:review.flags.map(flag=>flag.id),note:'Even explicit admin approval must not approve unknown pricing.'}),fails(409));
 assert.throws(()=>f.quotes.document(member,quote.id),fails(409));
 assert.throws(()=>f.quotes.templates.save(owner,{id:randomUUID(),requestKey:randomUUID(),expectedVersion:0,name:'Unfinished template',title:'Unfinished work',active:true,reviewNote:'Should reject incomplete supplier cost.',source:{quoteId:quote.id,revision:1}}),fails(409));
 f.setActor(member);
 for(const path of [`/quotes/${quote.id}/document`,`/quotes/${quote.id}/document.html`]){
  const response=await f.app.request('http://local'+path);assert.equal(response.status,409);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
 }
 assert.equal(f.storage.database.prepare('SELECT COUNT(*) AS n FROM _sales_quote_review_events').get().n,0);
});

test('supplier resolution creates another immutable revision; pending historical revision stays blocked',t=>{
 const f=fixture(t),cmd=pending(f),first=f.quotes.save(member,cmd).quote;
 const complete=f.command();complete.id=first.id;complete.expectedVersion=1;
 // Real native material + reviewed rate; no unlisted duplicate is created.
 const second=f.quotes.save(member,complete).quote;
 assert.equal(second.revision,2);assert.equal(second.estimate.pricingComplete,undefined);
 configure(f);assert.equal(f.quotes.review.summary(member,first.id).qualified,true);
 assert.equal(f.quotes.review.summary(member,first.id,{revision:1}).qualified,false);
 assert.equal(f.quotes.document(member,first.id).document.totalCents,5250);
 assert.throws(()=>f.quotes.document(member,first.id,{revision:1}),fails(409));
 assert.deepEqual(f.quotes.save(member,cmd).quote,first);
 assert.equal(f.quotes.detail(member,first.id,{revision:1}).quote.estimate.costCents,null);
});

test('only explicit material draft mode permits nullable rates or an unlisted item; false completion and missing notes are rejected',t=>{
 const f=fixture(t);
 const variants=[
  {pricingPending:undefined}, {pendingPricingNote:'short'}, {kind:'technician'},
  {pricingPending:false}, {unitCostCents:-1}, {unitSellCents:1.2},
 ];
 for(const patch of variants)assert.throws(()=>f.quotes.save(member,pending(f,patch)),fails(400));
 const filled=pending(f,{materialId:f.materialId,unitCostCents:1200,unitSellCents:2000});
 const stillPending=f.quotes.save(member,filled).quote;
 configure(f);assert.equal(f.quotes.review.summary(member,stillPending.id).qualified,false);
 const resolved={...filled,id:stillPending.id,expectedVersion:1,requestKey:randomUUID()};
 delete resolved.estimate.lines[0].pricingPending;delete resolved.estimate.lines[0].pendingPricingNote;
 const done=f.quotes.save(member,resolved).quote;
 assert.equal(f.quotes.review.summary(member,done.id).qualified,true);
 assert.equal(done.estimate.costCents,3000);
});

test('client line conversion preserves pending nulls and metadata; zero remains an explicit numeric rate',()=>{
 const line={id:randomUUID(),kind:'material',description:'Unlisted relay',quantityMilli:1000,headcount:1,unitCostCents:null,unitSellCents:null,discountBasisPoints:0,materialId:null,costOverrideReason:'',travelGroup:'',includesFuel:false,pricingPending:true,pendingPricingNote:'Waiting for supplier pricing.'};
 assert.deepEqual(lineInput(editLine(line)),line);
 assert.equal(quoteMoney(null),'Pending');assert.equal(quoteMoney(0),'$0.00');
 const zero={...line,unitCostCents:0,unitSellCents:0};assert.equal(lineInput(editLine(zero)).unitCostCents,0);
 assert.throws(()=>lineInput({...editLine(line),pricingPending:undefined}));
});


test('HTTP saves and reloads pending drafts with current ownership and strict input validation',async t=>{
 const f=fixture(t),cmd=pending(f);
 const response=await f.app.request('http://local/quotes',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'OpenFieldService'},body:JSON.stringify(cmd)});
 assert.equal(response.status,200);
 const saved=await response.json();assert.equal(saved.quote.estimate.lines[0].unitCostCents,null);
 const loaded=await f.app.request('http://local/quotes/'+saved.quote.id);assert.equal(loaded.status,200);
 assert.equal((await loaded.json()).quote.estimate.totalCents,null);
 f.setActor(other);
 assert.equal((await f.app.request('http://local/quotes/'+saved.quote.id)).status,403);
 f.setActor(member);
 const bad={...cmd,id:randomUUID(),requestKey:randomUUID(),estimate:{...cmd.estimate,lines:cmd.estimate.lines.map(line=>({...line,materialId:randomUUID()}))}};
 const invalid=await f.app.request('http://local/quotes',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'OpenFieldService'},body:JSON.stringify(bad)});
 assert.equal(invalid.status,409);
 assert.equal(f.storage.database.prepare('SELECT COUNT(*) AS n FROM _sales_quotes').get().n,1);
});
