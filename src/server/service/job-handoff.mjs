import { z } from "zod";
import { migrate } from "../platform/sqlite.mjs";
import { setWorkCategory } from "./work.mjs";
import { ServiceIdentityError } from "./identity.mjs";

// Service owns this relationship. Sales retains the immutable accepted document;
// this table links its source to the existing native Job, Customer and Location.
const schema = `
CREATE TABLE _service_job_contracts(
 job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE RESTRICT,
 source_kind TEXT NOT NULL CHECK(source_kind='accepted_quote'),
 source_id TEXT NOT NULL UNIQUE,document_hash TEXT NOT NULL,html_hash TEXT NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
 total_cents INTEGER NOT NULL CHECK(total_cents>=0),currency TEXT NOT NULL CHECK(currency='USD'),
 actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER _service_job_contracts_update BEFORE UPDATE ON _service_job_contracts BEGIN SELECT RAISE(ABORT,'SERVICE_CONTRACT_IMMUTABLE'); END;
CREATE TRIGGER _service_job_contracts_delete BEFORE DELETE ON _service_job_contracts BEGIN SELECT RAISE(ABORT,'SERVICE_CONTRACT_IMMUTABLE'); END;
CREATE TRIGGER _service_contract_job_context BEFORE UPDATE OF customer_id,asset_id,price ON jobs
WHEN EXISTS(SELECT 1 FROM _service_job_contracts c WHERE c.job_id=OLD.id)
 AND (NEW.customer_id IS NOT OLD.customer_id OR (NEW.asset_id IS NOT OLD.asset_id AND NOT (OLD.asset_id IS NULL AND NEW.asset_id IS NOT NULL AND EXISTS(SELECT 1 FROM assets a JOIN _service_job_contracts c ON c.job_id=OLD.id WHERE a.id=NEW.asset_id AND a.customer_id=NEW.customer_id AND a.site_id=c.site_id))) OR NEW.price IS NOT OLD.price)
BEGIN SELECT RAISE(ABORT,'SERVICE_CONTRACT_CHANGE_ORDER_REQUIRED'); END;
CREATE TRIGGER _service_contract_site_owner BEFORE UPDATE OF customer_id ON sites
WHEN NEW.customer_id IS NOT OLD.customer_id AND EXISTS(SELECT 1 FROM _service_job_contracts WHERE site_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'SERVICE_CONTRACT_LOCATION_REASSIGNMENT'); END;
CREATE TRIGGER _service_contract_invoice_insert BEFORE INSERT ON invoices
WHEN EXISTS(SELECT 1 FROM _service_job_contracts WHERE job_id=NEW.job_id)
BEGIN SELECT RAISE(ABORT,'SERVICE_QUOTED_INVOICE_REQUIRED'); END;
CREATE TRIGGER _service_contract_invoice_update BEFORE UPDATE OF job_id ON invoices
WHEN EXISTS(SELECT 1 FROM _service_job_contracts WHERE job_id=NEW.job_id)
BEGIN SELECT RAISE(ABORT,'SERVICE_QUOTED_INVOICE_REQUIRED'); END;
`;
const uuid = z.string().uuid();
const input = z.object({
 id:uuid,sourceId:uuid,documentHash:z.string().regex(/^[0-9a-f]{64}$/),htmlHash:z.string().regex(/^[0-9a-f]{64}$/),
 customerId:uuid,siteId:uuid,assetId:uuid.nullable(),serviceTypeId:uuid.nullable(),
 planningDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),
 durationMinutes:z.number().int().min(15).max(1440),priority:z.enum(['low','normal','high','urgent']),
 totalCents:z.number().int().nonnegative().max(10_000_000_000),currency:z.literal('USD'),
 title:z.string().min(1).max(200),scope:z.string().min(1).max(12000),exclusions:z.string().max(10000),
}).strict();

/** Install at composition time, after Dispatcher. Commands use the caller's transaction. */
export function createJobHandoff({storage}) {
 const db=storage.database;
 migrate(db,'_service_job_handoff_migrations',[{version:1,sql:schema}]);
 function createInTransaction(user,raw) {
  if(!user?.active||user.mustChangePassword||!['owner','admin'].includes(user.role))throw new ServiceIdentityError('Owner or administrator access required.',403);
  if(!db.isTransaction)throw new Error('Native job handoff requires a caller-owned transaction.');
  const parsed=input.safeParse(raw);
  if(!parsed.success)throw new ServiceIdentityError('Review the native job handoff fields.');
  const d=parsed.data;
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_dispatch_job_state'").get())throw new ServiceIdentityError('Dispatcher is not installed.',503);
  if(db.prepare('SELECT 1 FROM jobs WHERE id=?').get(d.id)||db.prepare('SELECT 1 FROM _service_job_contracts WHERE source_id=?').get(d.sourceId))throw new ServiceIdentityError('This job or accepted source was already handed off.',409);
  const site=db.prepare('SELECT name,address FROM sites WHERE id=? AND customer_id=?').get(d.siteId,d.customerId);
  if(!site)throw new ServiceIdentityError('Choose an existing location belonging to this customer.',409);
  if(d.assetId&&!db.prepare('SELECT 1 FROM assets WHERE id=? AND customer_id=? AND site_id=?').get(d.assetId,d.customerId,d.siteId))throw new ServiceIdentityError('Equipment must belong to the chosen customer location.',409);
  if(d.serviceTypeId&&!db.prepare('SELECT 1 FROM service_types WHERE id=?').get(d.serviceTypeId))throw new ServiceIdentityError('Service type is unavailable.',409);
  // Share native job numbering with the generic Jobs API. Skip occupied identifiers
  // from imported records; never create a second numbering namespace for Sales.
  const prefix=db.prepare("SELECT value FROM _meta WHERE key='identifier_prefix'").get()?.value||'JOB';
  let identifier;
  do {
   const counter=db.prepare("INSERT INTO _meta(key,value) VALUES('job_counter','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value").get();
   const number=Number(counter.value);
   if(!Number.isSafeInteger(number)||number<1)throw new ServiceIdentityError('Review the native job number counter.',409);
   identifier=`${prefix}-${number}`;
  } while(db.prepare('SELECT 1 FROM jobs WHERE identifier=?').get(identifier));
  const notes=[d.title,d.scope,d.exclusions?`Exclusions:\n${d.exclusions}`:''].filter(Boolean).join('\n\n');
  db.prepare("INSERT INTO jobs(id,identifier,customer_id,asset_id,service_type_id,technician_id,status,priority,scheduled_date,scheduled_time,duration,price,address,notes) VALUES(?,?,?,?,?,NULL,'scheduled',?,?,'',?,?,?,?)")
   .run(d.id,identifier,d.customerId,d.assetId,d.serviceTypeId,d.priority,d.planningDate,d.durationMinutes,d.totalCents/100,site.address||'',notes);
  const state=db.prepare('UPDATE _dispatch_job_state SET managed=1 WHERE job_id=?').run(d.id);
  if(state.changes!==1)throw new Error('Dispatcher did not project the native job.');
  setWorkCategory(db,user,d.id,'quoted');
  db.prepare("INSERT INTO _service_job_contracts(job_id,source_kind,source_id,document_hash,html_hash,customer_id,site_id,asset_id,total_cents,currency,actor_id) VALUES(?,'accepted_quote',?,?,?,?,?,?,?,?,?)")
   .run(d.id,d.sourceId,d.documentHash,d.htmlHash,d.customerId,d.siteId,d.assetId,d.totalCents,d.currency,user.id);
  return {id:d.id,identifier,customerId:d.customerId,siteId:d.siteId,assetId:d.assetId,planningDate:d.planningDate,durationMinutes:d.durationMinutes,status:'scheduled',assigned:false,workCategory:'quoted'};
 }
 const invoiceBlocked=id=>Boolean(db.prepare('SELECT 1 FROM _service_job_contracts WHERE job_id=?').get(id));
 return {createInTransaction,invoiceBlocked};
}
