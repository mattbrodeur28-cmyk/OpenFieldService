import {creditSchema} from "./credit-schema.mjs";
import {createInvoiceCredits} from "./credits.mjs";
import {reconciliationSchema} from "./reconciliation-schema.mjs";
import {createLegacyReconciliation} from "./reconciliation.mjs";
import {receivablesSchema} from "./receivables-schema.mjs";
import {createReceivables} from "./receivables.mjs";
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {migrate,transaction} from '../platform/sqlite.mjs';
import {ServiceIdentityError} from '../service/identity.mjs';
const fail=(message,status=400)=>{throw new ServiceIdentityError(message,status);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=z.string().uuid(),version=z.number().int().nonnegative().safe(),note=z.string().trim().min(10).max(2000);
const date=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Choose a valid payment date.');
const referenceInput=z.object({requestKey:uuid,expectedVersion:version,customerPo:z.string().trim().max(200),reason:note}).strict();
const paymentInput=z.object({id:uuid,requestKey:uuid,sourceToken:z.string().regex(/^[a-f0-9]{64}$/),amountCents:z.number().int().min(1).max(10000000000).safe(),currency:z.literal('USD'),method:z.enum(['cash','check','bank_transfer','card','other']),reference:z.string().trim().max(200),paidOn:date,note,receivedAttested:z.literal(true)}).strict().refine(d=>d.method==='cash'||d.reference.length>0,'Enter the check number or transaction/reference number.');
const reverseInput=z.object({id:uuid,requestKey:uuid,sourceToken:z.string().regex(/^[a-f0-9]{64}$/),reason:note}).strict();
const schema=`
CREATE TABLE _finance_job_references(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE RESTRICT,customer_po TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _finance_job_reference_events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _finance_invoice_payments(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),currency TEXT NOT NULL CHECK(currency='USD'),method TEXT NOT NULL CHECK(method IN('cash','check','bank_transfer','card','other')),reference TEXT NOT NULL,paid_on TEXT NOT NULL,note TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _finance_payments_invoice ON _finance_invoice_payments(invoice_id,created_at,id);
CREATE TABLE _finance_payment_reversals(id TEXT PRIMARY KEY,payment_id TEXT NOT NULL UNIQUE REFERENCES _finance_invoice_payments(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _finance_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_finance_job_reference_events','_finance_invoice_payments','_finance_payment_reversals','_finance_requests'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;`)).join('\n')}
CREATE TRIGGER _finance_invoice_context BEFORE UPDATE OF customer_id,job_id,total ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_invoice_payments WHERE invoice_id=OLD.id)
 AND (NEW.customer_id IS NOT OLD.customer_id OR NEW.job_id IS NOT OLD.job_id OR NEW.total IS NOT OLD.total)
BEGIN SELECT RAISE(ABORT,'FINANCE_RETAIN_PAYMENT_CONTEXT'); END;
CREATE TRIGGER _finance_invoice_paid_state BEFORE UPDATE OF status ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_invoice_payments WHERE invoice_id=OLD.id)
BEGIN
 SELECT CASE WHEN NEW.status='paid' AND (SELECT COALESCE(SUM(p.amount_cents),0) FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL)<>CAST(round(NEW.total*100) AS INTEGER) THEN RAISE(ABORT,'FINANCE_PAYMENT_BALANCE_REQUIRED') END;
 SELECT CASE WHEN NEW.status<>'paid' AND (SELECT COALESCE(SUM(p.amount_cents),0) FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL)=CAST(round(NEW.total*100) AS INTEGER) THEN RAISE(ABORT,'FINANCE_PAYMENT_STATUS_REQUIRED') END;
 SELECT CASE WHEN NEW.status IN('draft','cancelled') AND EXISTS(SELECT 1 FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL) THEN RAISE(ABORT,'FINANCE_REVERSE_PAYMENTS_FIRST') END;
END;
`;
function parse(spec,raw){const result=spec.safeParse(raw);if(!result.success)fail(result.error.issues.map(i=>i.message).join('; '));return result.data;}
const admin=user=>{if(!user?.active||user.mustChangePassword||!['owner','admin'].includes(user.role))fail('Owner or administrator accounting access required.',403);};
// Legacy REAL totals must already represent exact cents; never silently round a
// damaged/imported invoice into a different amount while accepting a payment.
function invoiceCents(value){const text=String(value);if(!/^\d+(?:\.\d{1,2})?$/.test(text))fail('Invoice total needs an exact-cent accounting review.',409);const [whole,fraction='']=text.split('.');const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(n>10000000000n)fail('Invoice total exceeds this payment ledger limit.',422);return Number(n);}
export function createJobAccounting({storage,company,clock=()=>new Date()}) {
 const db=storage.database;migrate(db,'_finance_accounting_migrations',[{version:1,sql:schema},{version:2,sql:receivablesSchema},{version:3,sql:reconciliationSchema},{version:4,sql:creditSchema}]);
 const today=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:company.timeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock()).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
 const job=id=>{parse(uuid,id);const row=db.prepare('SELECT id,identifier,customer_id FROM jobs WHERE id=?').get(id);if(!row)fail('Job / Work Order not found.',404);return row;};
 const references=id=>db.prepare('SELECT customer_po AS customerPo,version,updated_at AS updatedAt FROM _finance_job_references WHERE job_id=?').get(id)??{customerPo:'',version:0,updatedAt:null};
 const installed=table=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 function supplierOrders(jobId,page=1){
  if(!installed('_purch_lines'))return null;
  const rows=db.prepare("SELECT DISTINCT o.id,o.number,o.status,s.name AS supplier FROM _purch_lines l JOIN _purch_orders o ON o.id=l.order_id JOIN _purch_suppliers s ON s.id=o.supplier_id WHERE l.job_id=? ORDER BY o.created_at DESC,o.id LIMIT 26 OFFSET ?").all(jobId,(page-1)*25);
  return {rows:rows.slice(0,25),page,hasMore:rows.length>25};
 }
 function invoiceInTransaction(id){
  parse(uuid,id);const invoice=db.prepare('SELECT i.id,i.identifier,i.customer_id,i.job_id,i.subtotal,i.tax_amount,i.total,i.status,i.due_date,j.identifier AS job_identifier FROM invoices i LEFT JOIN jobs j ON j.id=i.job_id WHERE i.id=?').get(id);if(!invoice)fail('Invoice not found.',404);
  const payments=db.prepare('SELECT p.*,r.id AS reversal_id,r.reason AS reversal_reason,r.created_at AS reversed_at FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=? ORDER BY p.created_at,p.id LIMIT 1001').all(id);
  if(payments.length>1000)fail('Use an administrator-led export for this invoice payment history.',422);
  const credits=db.prepare('SELECT c.*,r.id AS reversal_id,r.reason AS reversal_reason,r.created_at AS reversed_at FROM _finance_invoice_credits c LEFT JOIN _finance_credit_reversals r ON r.credit_id=c.id WHERE c.invoice_id=? ORDER BY c.number DESC LIMIT 1001').all(id);
  if(credits.length>1000)fail('Use an administrator-led export for this invoice credit history.',422);
  const creditedCents=credits.filter(c=>!c.reversal_id).reduce((n,c)=>n+c.total_cents,0);
  const component=value=>{try{return invoiceCents(value);}catch{return null;}};
  const legacyReconciliation=db.prepare('SELECT id,resolution,payment_id AS paymentId,evidence_reference AS evidenceReference,note,actor_id AS actorId,created_at AS createdAt FROM _finance_legacy_reconciliations WHERE invoice_id=?').get(id)??null;
  const totalCents=invoiceCents(invoice.total),paidCents=payments.filter(p=>!p.reversal_id).reduce((n,p)=>n+p.amount_cents,0),legacyPaid=invoice.status==='paid'&&!payments.length&&!credits.length&&!legacyReconciliation;
  return {invoice:{id:invoice.id,identifier:invoice.identifier,status:invoice.status,jobId:invoice.job_id,jobIdentifier:invoice.job_identifier,totalCents,subtotalCents:component(invoice.subtotal),taxCents:component(invoice.tax_amount)},customerPo:invoice.job_id?references(invoice.job_id):null,supplierOrders:invoice.job_id?supplierOrders(invoice.job_id):null,payments,credits,creditedCents,paidCents:legacyPaid?null:paidCents,balanceCents:legacyPaid?null:totalCents-paidCents-creditedCents,legacyPaidNeedsReconciliation:legacyPaid,legacyReconciliation,sourceToken:hash({invoice,payments,credits,legacyReconciliation}),companyDate:today()};
 }
 function invoice(user,id){admin(user);return transaction(db,()=>invoiceInTransaction(id));}
 function detail(user,id,query={}){
  admin(user);const invoicePage=parse(z.coerce.number().int().min(1).max(1000000),query.invoicePage??1),poPage=parse(z.coerce.number().int().min(1).max(1000000),query.poPage??1);
  return transaction(db,()=>{const row=job(id),rows=db.prepare('SELECT id,identifier,status,total FROM invoices WHERE job_id=? ORDER BY created_at DESC,id LIMIT 26 OFFSET ?').all(id,(invoicePage-1)*25);return {job:row,customerPo:references(id),invoices:{rows:rows.slice(0,25),page:invoicePage,hasMore:rows.length>25},supplierOrders:supplierOrders(id,poPage)};});
 }
 function command(user,key,fingerprint,work){
  admin(user);return transaction(db,()=>{const previous=db.prepare('SELECT * FROM _finance_requests WHERE request_key=?').get(key);if(previous){if(previous.actor_id!==user.id)fail('This request belongs to another user.',403);if(previous.request_hash!==fingerprint)fail('This request key has different content.',409);return JSON.parse(previous.result_json);}const result=work();db.prepare('INSERT INTO _finance_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(key,user.id,fingerprint,JSON.stringify(result));return result;});
 }
 function saveReferences(user,id,raw){admin(user);parse(uuid,id);const d=parse(referenceInput,raw);return command(user,d.requestKey,hash({action:'job_reference',id,...d}),()=>{job(id);const before=references(id);if(before.version!==d.expectedVersion)fail('Job references changed. Reload before saving.',409);db.prepare('INSERT INTO _finance_job_references(job_id,customer_po,version,updated_by) VALUES(?,?,1,?) ON CONFLICT(job_id) DO UPDATE SET customer_po=excluded.customer_po,version=version+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').run(id,d.customerPo,user.id);const after=references(id);db.prepare('INSERT INTO _finance_job_reference_events(job_id,actor_id,before_json,after_json,reason) VALUES(?,?,?,?,?)').run(id,user.id,JSON.stringify(before),JSON.stringify(after),d.reason);return {customerPo:after};});}
 function recordPayment(user,id,raw){admin(user);parse(uuid,id);const d=parse(paymentInput,raw);return command(user,d.requestKey,hash({action:'record_payment',invoiceId:id,...d}),()=>{
  const source=invoiceInTransaction(id);
  if(source.sourceToken!==d.sourceToken)fail('Invoice or payment history changed. Reload before recording payment.',409);
  if(source.legacyPaidNeedsReconciliation)fail('This legacy paid invoice needs reconciliation before new payments can be entered.',409);
  if(!['sent','overdue'].includes(source.invoice.status))fail('Record a payment against an issued, unpaid invoice.',409);
  if(d.paidOn>source.companyDate)fail('Payment date cannot be in the future.',409);
  if(d.amountCents>source.balanceCents)fail('Payment exceeds the outstanding balance. Deposits/overpayments require a separate allocation workflow.',409);
  if(d.method!=='cash'&&db.prepare('SELECT 1 FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=? AND p.method=? AND p.reference=? AND r.id IS NULL').get(id,d.method,d.reference))fail('This invoice already has an active payment with that method/reference. Review the existing receipt.',409);
  db.prepare('INSERT INTO _finance_invoice_payments(id,invoice_id,amount_cents,currency,method,reference,paid_on,note,actor_id) VALUES(?,?,?,?,?,?,?,?,?)').run(d.id,id,d.amountCents,d.currency,d.method,d.reference,d.paidOn,d.note,user.id);
  if(d.amountCents===source.balanceCents)db.prepare("UPDATE invoices SET status='paid',paid_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.paidOn,id);
  return {accounting:invoiceInTransaction(id),externalReconciled:false};
 });}
 function reversePayment(user,paymentId,raw){admin(user);parse(uuid,paymentId);const d=parse(reverseInput,raw);return command(user,d.requestKey,hash({action:'reverse_payment',paymentId,...d}),()=>{
  const payment=db.prepare('SELECT invoice_id FROM _finance_invoice_payments WHERE id=?').get(paymentId);if(!payment)fail('Payment not found.',404);
  const source=invoiceInTransaction(payment.invoice_id);if(source.sourceToken!==d.sourceToken)fail('Invoice payment history changed. Reload before reversing.',409);
  if(db.prepare('SELECT 1 FROM _finance_payment_reversals WHERE payment_id=?').get(paymentId))fail('This payment was already reversed.',409);
  db.prepare('INSERT INTO _finance_payment_reversals(id,payment_id,actor_id,reason) VALUES(?,?,?,?)').run(d.id,paymentId,user.id,d.reason);
  if(source.invoice.status==='paid'){const due=db.prepare('SELECT due_date FROM invoices WHERE id=?').get(payment.invoice_id).due_date;db.prepare("UPDATE invoices SET status=?,paid_date='',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(due&&due<today()?'overdue':'sent',payment.invoice_id);}
  return {accounting:invoiceInTransaction(payment.invoice_id),externalReconciled:false};
 });}
 const credits=createInvoiceCredits({storage,admin,command,invoiceInTransaction,today});
 const reconciliation=createLegacyReconciliation({storage,admin,command,invoiceInTransaction,today});
 const receivables=createReceivables({storage,admin,today,command});
 storage.customerFinancialSummary=receivables.customerSummary;
 return {detail,invoice,saveReferences,recordPayment,reversePayment,receivables,reconciliation,credits};
}
