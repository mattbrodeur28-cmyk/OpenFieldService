import {createHash} from 'node:crypto';
import {z} from 'zod';
import {transaction} from '../platform/sqlite.mjs';
import {SalesError,parse,version,isSalesAdmin} from './domain.mjs';
export const contentHash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const logoUrl = z.string().max(1000000).refine(v => v === '' || /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v), 'Upload a valid PNG, JPEG, WebP, or SVG logo image.');
const config=z.object({schemaVersion:z.literal(1),legalName:z.string().trim().min(1).max(200),address:z.string().trim().max(1000).default(''),email:z.union([z.literal(''),z.string().email().max(254)]).default(''),phone:z.string().trim().max(80).default(''),terms:z.string().trim().min(1).max(50000),reviewNote:z.string().trim().max(2000).optional().default('Updated via Quote Issuer settings'),logoDataUrl:logoUrl.optional()}).strict();
const command=z.object({requestKey:z.string().uuid(),expectedVersion:version,config}).strict();
const page=z.coerce.number().int().min(1).max(1000000);
const admin=user=>{if(!isSalesAdmin(user))throw new SalesError('Owner or administrator access required to configure the quote issuer.',403);};
export function createQuoteIssuer(db){
  function current(){
    const row=db.prepare('SELECT r.* FROM _sales_quote_issuer h JOIN _sales_quote_issuer_revisions r ON r.version=h.version WHERE h.id=1').get();
    return row?{version:row.version,actorId:row.actor_id,config:JSON.parse(row.config_json),savedAt:row.created_at}:null;
  }
  function publicFields(){
    const row=current();
    if(!row)return null;
    const c=row.config;
    return {version:row.version,legalName:c.legalName,address:c.address,email:c.email,phone:c.phone,terms:c.terms,...(c.logoDataUrl?{logoDataUrl:c.logoDataUrl}:{})};
  }
  function detail(user,query={}){
    admin(user);const selected=parse(page,query.page??1);
    return transaction(db,()=>{
      const rows=db.prepare('SELECT version,actor_id AS actorId,config_json,created_at AS savedAt FROM _sales_quote_issuer_revisions ORDER BY version DESC LIMIT 26 OFFSET ?').all((selected-1)*25);
      return {issuer:current(),history:rows.slice(0,25).map(({config_json,...row})=>({...row,config:JSON.parse(config_json)})),page:selected,hasMore:rows.length>25};
    });
  }
  function save(user,input){
    admin(user);const data=parse(command,input),digest=contentHash(data);
    return transaction(db,()=>{
      const old=db.prepare('SELECT * FROM _sales_quote_issuer_requests WHERE request_key=?').get(data.requestKey);
      if(old){
        if(old.actor_id!==user.id)throw new SalesError('This request belongs to another user.',403);
        if(old.request_hash!==digest)throw new SalesError('This request key has different content.',409);
        return JSON.parse(old.result_json);
      }
      if((current()?.version??0)!==data.expectedVersion)throw new SalesError('Quote issuer changed. Reload before saving.',409);
      const next=data.expectedVersion+1;
      db.prepare('INSERT INTO _sales_quote_issuer_revisions(version,actor_id,config_json) VALUES(?,?,?)').run(next,user.id,JSON.stringify(data.config));
      db.prepare('INSERT INTO _sales_quote_issuer(id,version) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').run(next);
      const result={issuer:current()};
      db.prepare('INSERT INTO _sales_quote_issuer_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(data.requestKey,user.id,digest,JSON.stringify(result));
      return result;
    });
  }
  return {detail,save,publicFields};
}
