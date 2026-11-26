import {z} from 'zod';
import {createHash} from 'node:crypto';
import {ServiceIdentityError} from '../service/identity.mjs';
const fail=(message,status=400)=>{throw new ServiceIdentityError(message,status);};
const uuid=z.string().uuid(),note=z.string().trim().min(10).max(2000),token=z.string().regex(/^[a-f0-9]{64}$/);
const date=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Choose a valid credit date.');
const cents=z.number().int().nonnegative().max(10000000000).safe();
const issueInput=z.object({id:uuid,requestKey:uuid,sourceToken:token,netCents:cents,taxCents:cents,currency:z.literal('USD'),issuedOn:date,evidenceReference:note,note,reviewAttested:z.literal(true)}).strict().refine(d=>d.netCents+d.taxCents>0,'Credit must be greater than zero.');
const reverseInput=z.object({id:uuid,requestKey:uuid,sourceToken:token,reason:note}).strict();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parse=(schema,raw)=>{const r=schema.safeParse(raw);if(!r.success)fail(r.error.issues.map(i=>i.message).join('; '));return r.data;};
export function createInvoiceCredits({storage,admin,command,invoiceInTransaction,today}) {
 const db=storage.database;
 function syncStatus(invoiceId,source) {
  const credited=db.prepare('SELECT total_cents FROM _finance_active_credits WHERE invoice_id=?').get(invoiceId)?.total_cents??0;
  const receipts=db.prepare('SELECT p.amount_cents,p.paid_on FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=? AND r.id IS NULL').all(invoiceId);
  const paid=receipts.reduce((n,p)=>n+p.amount_cents,0),complete=paid+credited===source.invoice.totalCents;
  const due=db.prepare('SELECT due_date FROM invoices WHERE id=?').get(invoiceId).due_date;
  const unpaid=date.safeParse(due).success&&due<today()?'overdue':'sent';
  // Compatibility paid means settled. A pure credit never invents a paid date.
  const lastReceipt=receipts.reduce((latest,p)=>p.paid_on>latest?p.paid_on:latest,'');
  db.prepare('UPDATE invoices SET status=?,paid_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(complete?'paid':unpaid,complete?lastReceipt:'',invoiceId);
 }
 function issue(user,invoiceId,raw){
  admin(user);parse(uuid,invoiceId);const d=parse(issueInput,raw);
  return command(user,d.requestKey,hash({action:'issue_credit',invoiceId,...d}),()=>{
   const source=invoiceInTransaction(invoiceId);
   if(source.sourceToken!==d.sourceToken)fail('Invoice settlements changed. Reload before issuing credit.',409);
   if(source.legacyPaidNeedsReconciliation)fail('Resolve the unsupported legacy paid flag before issuing a credit.',409);
   if(!['sent','overdue'].includes(source.invoice.status)||source.balanceCents===null||source.balanceCents<=0)fail('Issue credit against a known unpaid issued-invoice balance. Paid-invoice refunds require a separate workflow.',409);
   if(d.issuedOn>today())fail('Credit date cannot be in the future.',409);
   if(source.invoice.subtotalCents===null||source.invoice.taxCents===null||source.invoice.subtotalCents+source.invoice.taxCents!==source.invoice.totalCents)fail('Review the original exact net/tax amounts before crediting this invoice.',409);
   const old=db.prepare('SELECT net_cents,tax_cents FROM _finance_active_credits WHERE invoice_id=?').get(invoiceId);
   if(d.netCents>source.invoice.subtotalCents-(old?.net_cents??0)||d.taxCents>source.invoice.taxCents-(old?.tax_cents??0))fail('Credit components exceed the original uncredited net or tax amounts.',409);
   if(d.netCents+d.taxCents>source.balanceCents)fail('Credit exceeds the outstanding balance. Do not manufacture a refund or customer deposit.',409);
   if(db.prepare('SELECT 1 FROM _finance_invoice_credits WHERE id=?').get(d.id))fail('This credit identity already exists.',409);
   const number=db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM _finance_invoice_credits').get().n;
   const original=db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId);
   db.prepare('INSERT INTO _finance_invoice_credits(id,number,invoice_id,net_cents,tax_cents,total_cents,issued_on,evidence_reference,note,original_context_json,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(d.id,number,invoiceId,d.netCents,d.taxCents,d.netCents+d.taxCents,d.issuedOn,d.evidenceReference,d.note,JSON.stringify(original),user.id);
   syncStatus(invoiceId,source);
   return {creditId:d.id,identifier:`CN-${String(number).padStart(6,'0')}`,accounting:invoiceInTransaction(invoiceId),externalPosted:false,communicationSent:false};
  });
 }
 function reverse(user,creditId,raw){admin(user);parse(uuid,creditId);const d=parse(reverseInput,raw);return command(user,d.requestKey,hash({action:'reverse_credit',creditId,...d}),()=>{
  const credit=db.prepare('SELECT invoice_id FROM _finance_invoice_credits WHERE id=?').get(creditId);if(!credit)fail('Credit note not found.',404);
  const source=invoiceInTransaction(credit.invoice_id);if(source.sourceToken!==d.sourceToken)fail('Invoice settlements changed. Reload before reversing credit.',409);
  if(db.prepare('SELECT 1 FROM _finance_credit_reversals WHERE credit_id=?').get(creditId))fail('Credit was already reversed.',409);
  if(db.prepare('SELECT 1 FROM _finance_credit_reversals WHERE id=?').get(d.id))fail('This reversal identity already exists.',409);
  db.prepare('INSERT INTO _finance_credit_reversals(id,credit_id,reason,actor_id) VALUES(?,?,?,?)').run(d.id,creditId,d.reason,user.id);
  syncStatus(credit.invoice_id,source);
  return {accounting:invoiceInTransaction(credit.invoice_id),externalPosted:false,communicationSent:false};
 });}
 return {issue,reverse};
}
