import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { SalesError, parse, version, requireWriter, requireOwner, isSalesAdmin } from "./domain.mjs";

export const reviewEvaluationVersion = 1; // Bump when approval-relevant flag semantics change.
const uuid = z.string().uuid();
const positive = z.coerce.number().int().min(1).max(1000000);
const policyInput = z.object({
  requestKey: uuid, expectedVersion: version,
  config: z.object({
    schemaVersion: z.literal(1),
    minimumMarginBasisPoints: z.number().int().min(0).max(10000),
    maximumDiscountBasisPoints: z.number().int().min(0).max(10000),
    requireApprovalForAll: z.boolean(),
    reviewNote: z.string().trim().min(10).max(2000),
  }).strict(),
}).strict();
const reviewInput = z.object({
  id: uuid, requestKey: uuid,
  expectedQuoteVersion: z.number().int().min(1).max(1000000),
  expectedPolicyVersion: z.number().int().min(1).max(1000000),
  expectedEventSequence: version,
  action: z.enum(["approve","revoke"]),
  approvalId: uuid.nullable(),
  acknowledgedFlags: z.array(z.string().min(1).max(120)).max(400),
  note: z.string().trim().min(10).max(2000),
}).strict().refine(data => data.action === "approve" ? data.approvalId === null : data.approvalId !== null && data.acknowledgedFlags.length === 0,
  "Approval must not target an old event; revocation requires an approval ID and no flag acknowledgments.");
const hash = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");
function admin(user) {
  if (!isSalesAdmin(user)) throw new SalesError("Owner or administrator pricing approval required.",403);
}

/** Compare exact saved cents. Display-rounded margin must never hide a small loss. */
export function assessBid(price, policy) {
  if (!policy) return [{id:"policy:missing",kind:"policy_missing",lineId:null,description:"Configure and review the company pricing policy first."}];
  const flags=[];
  const flag=(id,kind,lineId,description)=>flags.push({id,kind,lineId,description});
  if (policy.requireApprovalForAll) flag("quote:manual_review","manual_review",null,"Company policy requires manual approval of every saved quote.");
  if (price.netCents===0) flag("quote:margin_unavailable","margin_unavailable",null,"Net selling value is zero; margin cannot be established.");
  else if ((BigInt(price.netCents)-BigInt(price.costCents))*10000n < BigInt(price.netCents)*BigInt(policy.minimumMarginBasisPoints))
    flag("quote:minimum_margin","minimum_margin",null,"Saved gross margin is below the configured minimum.");
  for (const line of price.lines) {
    if (line.costCents===0) flag(`line:${line.id}:zero_cost`,"zero_cost",line.id,`${line.description}: estimated cost is zero.`);
    if (line.netCents===0) flag(`line:${line.id}:no_charge`,"no_charge",line.id,`${line.description}: net selling value is zero.`);
    if (line.discountBasisPoints>policy.maximumDiscountBasisPoints) flag(`line:${line.id}:discount_limit`,"discount_limit",line.id,`${line.description}: selling discount exceeds the configured maximum.`);
  }
  return flags;
}

export function createQuoteReview({ storage, sales }) {
  const db=storage.database;
  const policy=()=>{
    const row=db.prepare("SELECT * FROM _sales_quote_review_policy WHERE id=1").get();
    return row?{version:row.version,config:JSON.parse(row.config_json),updatedAt:row.updated_at}:null;
  };
  const event=row=>row?{
    id:row.id,sequence:row.sequence,quoteVersion:row.quote_version,policyVersion:row.policy_version,
    evaluationVersion:row.evaluation_version,actorId:row.actor_id,action:row.action,
    approvalId:row.previous_event_id,note:row.note,flags:JSON.parse(row.flags_json),createdAt:row.created_at,
  }:null;
  function source(user,id,selected) {
    requireWriter(user);parse(uuid,id);
    const head=db.prepare("SELECT * FROM _sales_quotes WHERE id=?").get(id);
    if (!head) throw new SalesError("Quote not found.",404);
    requireOwner(user,sales.opportunity(head.opportunity_id));
    const revision=db.prepare("SELECT * FROM _sales_quote_revisions WHERE quote_id=? AND version=?").get(id,selected??head.version);
    if (!revision) throw new SalesError("Quote revision not found.",404);
    return {head,revision,price:JSON.parse(revision.pricing_json)};
  }
  function policyDetail(user,query={}) {
    admin(user);
    const page=parse(positive,query.page??1);
    return transaction(db,()=>{
      const history=db.prepare("SELECT version,actor_id AS actorId,config_json,created_at AS createdAt FROM _sales_quote_review_policy_revisions ORDER BY version DESC LIMIT 26 OFFSET ?").all((page-1)*25);
      return {policy:policy(),history:history.slice(0,25).map(row=>({version:row.version,actorId:row.actorId,config:JSON.parse(row.config_json),createdAt:row.createdAt})),page,hasMore:history.length>25};
    });
  }
  function savePolicy(user,input) {
    admin(user);const data=parse(policyInput,input),digest=hash(data);
    return transaction(db,()=>{
      const prior=db.prepare("SELECT * FROM _sales_quote_review_policy_requests WHERE request_key=?").get(data.requestKey);
      if (prior) {
        if (prior.actor_id!==user.id) throw new SalesError("This request belongs to another user.",403);
        if (prior.request_hash!==digest) throw new SalesError("This request key has different content.",409);
        return JSON.parse(prior.result_json);
      }
      if ((policy()?.version??0)!==data.expectedVersion) throw new SalesError("Pricing policy changed. Reload before saving.",409);
      const next=data.expectedVersion+1,json=JSON.stringify(data.config);
      db.prepare("INSERT INTO _sales_quote_review_policy_revisions(version,actor_id,config_json) VALUES(?,?,?)").run(next,user.id,json);
      db.prepare("INSERT INTO _sales_quote_review_policy(id,version,config_json) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,config_json=excluded.config_json,updated_at=CURRENT_TIMESTAMP").run(next,json);
      const result={policy:policy()};
      db.prepare("INSERT INTO _sales_quote_review_policy_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)").run(data.requestKey,user.id,digest,JSON.stringify(result));
      return result;
    });
  }
  // Caller owns the transaction. Offering/conversion must recheck this, not trust UI state.
  function summaryInTransaction(user,id,query={}) {
    const selected=query.revision===undefined?undefined:parse(positive,query.revision),page=parse(positive,query.page??1);
    const {head,revision,price}=source(user,id,selected),current=policy();
    const flags=assessBid(price,current?.config);
    const latest=event(db.prepare("SELECT * FROM _sales_quote_review_events WHERE quote_id=? AND quote_version=? ORDER BY sequence DESC LIMIT 1").get(id,revision.version));
    const currentApproval=latest?.action==="approve"&&latest.policyVersion===current?.version&&latest.evaluationVersion===reviewEvaluationVersion;
    const state=!current?"unconfigured":latest?.action==="revoke"?"revoked":currentApproval?"approved":flags.length?latest?.action==="approve"?"approval_stale":"approval_required":"within_policy";
    const history=db.prepare("SELECT * FROM _sales_quote_review_events WHERE quote_id=? AND quote_version=? ORDER BY sequence DESC LIMIT 26 OFFSET ?").all(id,revision.version,(page-1)*25);
    return {quoteId:id,revision:revision.version,headVersion:head.version,quoteStatus:head.status,
      evaluationVersion:reviewEvaluationVersion,policy:current?{version:current.version,minimumMarginBasisPoints:current.config.minimumMarginBasisPoints,maximumDiscountBasisPoints:current.config.maximumDiscountBasisPoints,requireApprovalForAll:current.config.requireApprovalForAll}:null,
      state,qualified:state==="approved"||state==="within_policy",flags,eventSequence:latest?.sequence??0,latest,
      financials:{costCents:price.costCents,netCents:price.netCents,taxCents:price.taxCents,totalCents:price.totalCents,profitCents:price.profitCents,marginBasisPoints:price.marginBasisPoints,markupBasisPoints:price.markupBasisPoints},
      history:history.slice(0,25).map(event),page,hasMore:history.length>25};
  }
  function summary(user,id,query={}) {return transaction(db,()=>summaryInTransaction(user,id,query));}
  function record(user,id,input) {
    admin(user);parse(uuid,id);
    const data=parse(reviewInput,input),digest=hash({quoteId:id,...data});
    return transaction(db,()=>{
      source(user,id);
      const prior=db.prepare("SELECT * FROM _sales_quote_review_requests WHERE request_key=?").get(data.requestKey);
      if (prior) {
        if (prior.actor_id!==user.id) throw new SalesError("This request belongs to another user.",403);
        if (prior.request_hash!==digest) throw new SalesError("This request key has different content.",409);
        return JSON.parse(prior.result_json);
      }
      const current=summaryInTransaction(user,id);
      if (current.headVersion!==data.expectedQuoteVersion||current.quoteStatus!=="draft") throw new SalesError("Review the current internal draft revision before changing approval.",409);
      if (!current.policy||current.policy.version!==data.expectedPolicyVersion) throw new SalesError("Pricing policy changed or is unconfigured. Reload the review.",409);
      if (current.eventSequence!==data.expectedEventSequence) throw new SalesError("Another reviewer changed this approval. Reload the review.",409);
      if (db.prepare("SELECT 1 FROM _sales_quote_review_events WHERE id=?").get(data.id)) throw new SalesError("Review event ID already exists.",409);
      if (data.action==="approve") {
        const actual=new Set(data.acknowledgedFlags),expected=current.flags.map(flag=>flag.id);
        if (actual.size!==data.acknowledgedFlags.length||actual.size!==expected.length||expected.some(flag=>!actual.has(flag))) throw new SalesError("Explicitly acknowledge every current review flag exactly once.",409);
      } else if (current.latest?.action!=="approve"||current.latest.id!==data.approvalId) throw new SalesError("Only the latest approval can be revoked.",409);
      db.prepare("INSERT INTO _sales_quote_review_events(id,quote_id,quote_version,policy_version,evaluation_version,actor_id,action,previous_event_id,note,flags_json) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(data.id,id,data.expectedQuoteVersion,current.policy.version,reviewEvaluationVersion,user.id,data.action,data.approvalId,data.note,JSON.stringify(data.action==="approve"?current.flags:[]));
      const result={review:summaryInTransaction(user,id)};
      db.prepare("INSERT INTO _sales_quote_review_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)").run(data.requestKey,user.id,digest,JSON.stringify(result));
      return result;
    });
  }
  return {policyDetail,savePolicy,summary,summaryInTransaction,record};
}
