import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { SalesError, isSalesAdmin, requireWriter, requireOwner, parse, version } from "./domain.mjs";

const uuid = z.string().uuid();
const positive = z.coerce.number().int().min(1).max(1000000);
export const templateReference = z.object({ id: uuid, version: z.number().int().min(1).max(1000000) }).strict();
const command = z.object({
  id: uuid, requestKey: uuid, expectedVersion: version,
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  active: z.boolean(),
  reviewNote: z.string().trim().min(10).max(2000),
  source: z.object({ quoteId: uuid, revision: z.number().int().min(1).max(1000000) }).strict(),
}).strict();
const instantiateInput = z.object({
  expectedTemplateVersion: z.number().int().min(1).max(1000000),
  opportunityId: uuid,
  expectedOpportunityVersion: version,
}).strict();

/** All writes are local configuration; source lines keep native material references. */
export function createQuoteTemplates({ storage, sales, materialSnapshots }) {
  const db = storage.database;
  function head(id) {
    parse(uuid,id);
    const row = db.prepare("SELECT * FROM _sales_quote_templates WHERE id=?").get(id);
    if (!row) throw new SalesError("Quote template not found.",404);
    return row;
  }
  function shape(row, selected=row.version) {
    const saved = db.prepare("SELECT * FROM _sales_quote_template_revisions WHERE template_id=? AND version=?").get(row.id,selected);
    if (!saved) throw new SalesError("Template revision not found.",404);
    return {
      id:row.id, version:saved.version, currentVersion:row.version,
      config:JSON.parse(saved.config_json), actorId:saved.actor_id, savedAt:saved.created_at,
      source:{ quoteId:saved.source_quote_id, revision:saved.source_quote_version },
    };
  }
  function detail(user,id,query={}) {
    requireWriter(user);
    const selected=query.revision===undefined?undefined:parse(positive,query.revision);
    const page=parse(positive,query.historyPage??1);
    return transaction(db,()=>{
      const row=head(id);
      const history=db.prepare("SELECT version,actor_id AS actorId,created_at AS savedAt FROM _sales_quote_template_revisions WHERE template_id=? ORDER BY version DESC LIMIT 26 OFFSET ?").all(id,(page-1)*25);
      return { template:shape(row,selected), history:history.slice(0,25), historyPage:page, hasMoreHistory:history.length>25 };
    });
  }
  function list(user,query={}) {
    requireWriter(user);
    const page=parse(positive,query.page??1);
    const state=parse(z.enum(["active","archived","all"]),query.state??"active");
    const segment=query.segment===undefined?null:parse(z.enum(["commercial","residential"]),query.segment);
    const search=String(query.search??"").slice(0,200);
    return transaction(db,()=>{
      const where="WHERE instr(lower(name),lower(?))>0"+(state==="all"?"":" AND active=?")+(segment?" AND segment=?":"");
      const args=[search,...(state==="all"?[]:[state==="active"?1:0]),...(segment?[segment]:[])];
      const total=db.prepare(`SELECT COUNT(*) AS n FROM _sales_quote_templates ${where}`).get(...args).n;
      const rows=db.prepare(`SELECT id,name,version,segment,active,updated_at AS updatedAt FROM _sales_quote_templates ${where} ORDER BY name,id LIMIT 25 OFFSET ?`).all(...args,(page-1)*25).map(row=>({...row,active:!!row.active}));
      return { rows,total,page,pageSize:25 };
    });
  }
  function save(user,input) {
    if (!isSalesAdmin(user)) throw new SalesError("Only Owners/Admins manage quote templates.",403);
    const data=parse(command,input), hash=createHash("sha256").update(JSON.stringify(data)).digest("hex");
    return transaction(db,()=>{
      const prior=db.prepare("SELECT * FROM _sales_quote_template_requests WHERE request_key=?").get(data.requestKey);
      if (prior) {
        if (prior.actor_id!==user.id) throw new SalesError("This request belongs to another user.",403);
        if (prior.request_hash!==hash) throw new SalesError("This request key has different content.",409);
        return JSON.parse(prior.result_json);
      }
      const old=db.prepare("SELECT * FROM _sales_quote_templates WHERE id=?").get(data.id);
      if ((old?.version??0)!==data.expectedVersion) throw new SalesError("Template changed. Reload before saving.",409);
      if (!old && db.prepare("SELECT COUNT(*) AS n FROM _sales_quote_templates").get().n>=1000) throw new SalesError("At most 1000 quote templates are supported.",409);
      const quote=db.prepare("SELECT * FROM _sales_quotes WHERE id=?").get(data.source.quoteId);
      if (!quote) throw new SalesError("Source quote not found.",404);
      requireOwner(user,sales.opportunity(quote.opportunity_id));
      const revision=db.prepare("SELECT * FROM _sales_quote_revisions WHERE quote_id=? AND version=?").get(quote.id,data.source.revision);
      if (!revision) throw new SalesError("Source quote revision not found.",404);
      const document=JSON.parse(revision.document_json), price=JSON.parse(revision.pricing_json);
      const lines=price.lines.map(line=>({
        sourceLineId:line.id,kind:line.kind,description:line.description,
        quantityMilli:line.quantityMilli,headcount:line.headcount,
        unitCostCents:line.kind==="material"?null:line.unitCostCents,
        unitSellCents:line.unitSellCents,discountBasisPoints:line.discountBasisPoints,
        materialId:line.materialId,travelGroup:line.travelGroup,includesFuel:line.includesFuel,
      }));
      const config={ name:data.name,title:data.title,segment:price.profile.segment,active:data.active,
        scope:document.scope,exclusions:document.exclusions,reviewNote:data.reviewNote,lines };
      const next=data.expectedVersion+1;
      db.prepare("INSERT INTO _sales_quote_templates(id,version,name,segment,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,name=excluded.name,segment=excluded.segment,active=excluded.active,updated_at=CURRENT_TIMESTAMP").run(data.id,next,data.name,config.segment,data.active?1:0);
      db.prepare("INSERT INTO _sales_quote_template_revisions(template_id,version,actor_id,source_quote_id,source_quote_version,config_json) VALUES(?,?,?,?,?,?)").run(data.id,next,user.id,quote.id,data.source.revision,JSON.stringify(config));
      const insert=db.prepare("INSERT INTO _sales_quote_template_lines(template_id,version,position,material_id,source_quote_id,source_quote_version,source_line_id) VALUES(?,?,?,?,?,?,?)");
      lines.forEach((line,position)=>insert.run(data.id,next,position,line.materialId,quote.id,data.source.revision,line.sourceLineId));
      const result={template:shape(head(data.id))};
      db.prepare("INSERT INTO _sales_quote_template_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)").run(data.requestKey,user.id,hash,JSON.stringify(result));
      return result;
    });
  }
  function instantiate(user,id,input) {
    requireWriter(user);
    const data=parse(instantiateInput,input);
    return transaction(db,()=>{
      const current=head(id);
      if (!current.active) throw new SalesError("This template is archived.",409);
      if (current.version!==data.expectedTemplateVersion) throw new SalesError("Template changed. Select its current revision.",409);
      const opportunity=sales.opportunity(data.opportunityId);
      requireOwner(user,opportunity);
      if (opportunity.version!==data.expectedOpportunityVersion) throw new SalesError("Opportunity changed. Refresh before applying a template.",409);
      if (opportunity.stage_kind!=="open") throw new SalesError("Reopen the opportunity before estimating.",409);
      if (opportunity.segment!==current.segment) throw new SalesError("Choose a template for this work segment.",409);
      const template=shape(current), ids=[...new Set(template.config.lines.map(line=>line.materialId).filter(Boolean))];
      if (ids.length && !materialSnapshots) throw new SalesError("Material pricing is not configured.",503);
      const snapshots=ids.length?materialSnapshots(ids):[];
      const materials=new Map(snapshots.map(item=>[item.id,item]));
      if (ids.some(materialId=>!materials.has(materialId))) throw new SalesError("A template material is unavailable. Review the template.",409);
      const lines=template.config.lines.map(line=>{
        const cost=line.materialId?materials.get(line.materialId).unitCostCents:line.unitCostCents;
        if (cost!==null && (!Number.isSafeInteger(cost)||cost<0||cost>1000000000)) throw new SalesError("Current material cost cannot be applied. Review inventory pricing.",422);
        return { id:randomUUID(),kind:line.kind,description:line.description,
          quantityMilli:line.quantityMilli,headcount:line.headcount,unitCostCents:cost,
          unitSellCents:line.unitSellCents,discountBasisPoints:line.discountBasisPoints,
          materialId:line.materialId,costOverrideReason:"",travelGroup:line.travelGroup,includesFuel:line.includesFuel };
      });
      return { template:{id:current.id,version:current.version,name:current.name},
        document:{title:template.config.title,scope:template.config.scope,exclusions:template.config.exclusions},
        lines,materialSnapshots:snapshots,
        warnings:["Review copied scope, estimated costs and selling rates; choose billing rules and calculate prices before saving.",
          ...(lines.some(line=>line.unitCostCents===null)?["Some materials have no company stock cost. Enter a reviewed cost and explicit override reason."]:[])] };
    });
  }
  // Synchronous narrow contract; quote save owns the enclosing database transaction.
  function referenceInTransaction(user,input) {
    requireWriter(user);
    if (input==null) return null;
    const ref=parse(templateReference,input), selected=shape(head(ref.id),ref.version);
    return {id:ref.id,version:ref.version,name:selected.config.name};
  }
  return {list,detail,save,instantiate,referenceInTransaction};
}
