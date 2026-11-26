import {createJobAccounting} from './accounting.mjs';
import {ServiceIdentityError} from '../service/identity.mjs';
export function mountJobAccounting(app,{storage,company,check}) {
 const accounting=createJobAccounting({storage,company});
 const actor=c=>{c.header('Cache-Control','private, no-store');return check(c);};
 async function body(c){try{return await c.req.json();}catch(error){if(error?.name==='BodyLimitError')throw new ServiceIdentityError('Request too large.',413);throw new ServiceIdentityError('Send valid JSON.');}}
 app.get('/receivables',c=>c.json(accounting.receivables.list(actor(c),c.req.query())));
 app.get('/invoices/:id/collections',c=>c.json(accounting.receivables.notes(actor(c),c.req.param('id'),c.req.query())));
 app.post('/invoices/:id/collections',async c=>{const d=await body(c);return c.json(accounting.receivables.addNote(actor(c),c.req.param('id'),d));});
 app.get('/jobs/:id/accounting',c=>c.json(accounting.detail(actor(c),c.req.param('id'),c.req.query())));
 app.post('/jobs/:id/accounting',async c=>{const d=await body(c);return c.json(accounting.saveReferences(actor(c),c.req.param('id'),d));});
 app.get('/invoices/:id/accounting',c=>c.json(accounting.invoice(actor(c),c.req.param('id'))));
 app.post('/invoices/:id/reconcile-legacy',async c=>{const d=await body(c);return c.json(accounting.reconciliation.reconcile(actor(c),c.req.param('id'),d));});
 app.post('/invoices/:id/credits',async c=>{const d=await body(c);return c.json(accounting.credits.issue(actor(c),c.req.param('id'),d));});
 app.post('/credits/:id/reverse',async c=>{const d=await body(c);return c.json(accounting.credits.reverse(actor(c),c.req.param('id'),d));});
 app.post('/invoices/:id/payments',async c=>{const d=await body(c);return c.json(accounting.recordPayment(actor(c),c.req.param('id'),d));});
 app.post('/payments/:id/reverse',async c=>{const d=await body(c);return c.json(accounting.reversePayment(actor(c),c.req.param('id'),d));});
 return accounting;
}
