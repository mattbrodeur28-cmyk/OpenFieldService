// Additive finance v4. Replaces compatibility status guards deliberately;
// previously applied migration definitions remain unchanged.
const paid=`(SELECT COALESCE(SUM(p.amount_cents),0) FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL)`;
const credited=`(SELECT COALESCE(SUM(c.total_cents),0) FROM _finance_invoice_credits c LEFT JOIN _finance_credit_reversals r ON r.credit_id=c.id WHERE c.invoice_id=OLD.id AND r.id IS NULL)`;
const balance=`(CAST(round(NEW.total*100) AS INTEGER)-${credited})`;
export const creditSchema=`
CREATE TABLE _finance_invoice_credits(id TEXT PRIMARY KEY,number INTEGER NOT NULL UNIQUE CHECK(number>0),invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,net_cents INTEGER NOT NULL CHECK(net_cents>=0),tax_cents INTEGER NOT NULL CHECK(tax_cents>=0),total_cents INTEGER NOT NULL CHECK(total_cents=net_cents+tax_cents AND total_cents>0),issued_on TEXT NOT NULL,evidence_reference TEXT NOT NULL,note TEXT NOT NULL,original_context_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _finance_credits_invoice ON _finance_invoice_credits(invoice_id,created_at,id);
CREATE TABLE _finance_credit_reversals(id TEXT PRIMARY KEY,credit_id TEXT NOT NULL UNIQUE REFERENCES _finance_invoice_credits(id) ON DELETE RESTRICT,reason TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_finance_invoice_credits','_finance_credit_reversals'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;`)).join(' ')}
CREATE VIEW _finance_active_credits AS SELECT c.invoice_id,SUM(c.net_cents) AS net_cents,SUM(c.tax_cents) AS tax_cents,SUM(c.total_cents) AS total_cents FROM _finance_invoice_credits c LEFT JOIN _finance_credit_reversals r ON r.credit_id=c.id WHERE r.id IS NULL GROUP BY c.invoice_id;
CREATE TRIGGER _finance_credit_context BEFORE UPDATE OF customer_id,job_id,total,subtotal,tax_amount ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_invoice_credits WHERE invoice_id=OLD.id)
 AND (NEW.customer_id IS NOT OLD.customer_id OR NEW.job_id IS NOT OLD.job_id OR NEW.total IS NOT OLD.total OR NEW.subtotal IS NOT OLD.subtotal OR NEW.tax_amount IS NOT OLD.tax_amount)
BEGIN SELECT RAISE(ABORT,'FINANCE_RETAIN_CREDIT_CONTEXT'); END;
DROP TRIGGER _finance_invoice_paid_state;
DROP TRIGGER _finance_reconciliation_paid_state;
CREATE TRIGGER _finance_invoice_paid_state BEFORE UPDATE OF status ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_invoice_payments WHERE invoice_id=OLD.id) OR EXISTS(SELECT 1 FROM _finance_legacy_reconciliations WHERE invoice_id=OLD.id) OR EXISTS(SELECT 1 FROM _finance_invoice_credits WHERE invoice_id=OLD.id)
BEGIN
 SELECT CASE WHEN NEW.status='paid' AND ${paid}<>${balance} THEN RAISE(ABORT,'FINANCE_SETTLEMENT_BALANCE_REQUIRED') END;
 SELECT CASE WHEN NEW.status<>'paid' AND ${paid}=${balance} THEN RAISE(ABORT,'FINANCE_SETTLEMENT_STATUS_REQUIRED') END;
 SELECT CASE WHEN NEW.status IN('draft','cancelled') AND (${paid}>0 OR ${credited}>0) THEN RAISE(ABORT,'FINANCE_REVERSE_SETTLEMENTS_FIRST') END;
END;
`;
