// Additive finance v3; applied v1/v2 definitions remain unchanged.
export const reconciliationSchema=`
CREATE TABLE _finance_legacy_reconciliations(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT,resolution TEXT NOT NULL CHECK(resolution IN('record_receipt','reopen_unsubstantiated')),payment_id TEXT UNIQUE REFERENCES _finance_invoice_payments(id) ON DELETE RESTRICT,evidence_reference TEXT NOT NULL,note TEXT NOT NULL,original_context_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK((resolution='record_receipt' AND payment_id IS NOT NULL) OR (resolution='reopen_unsubstantiated' AND payment_id IS NULL)));
CREATE TRIGGER _finance_reconciliation_update BEFORE UPDATE ON _finance_legacy_reconciliations BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;
CREATE TRIGGER _finance_reconciliation_delete BEFORE DELETE ON _finance_legacy_reconciliations BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;
CREATE TRIGGER _finance_reconciliation_context BEFORE UPDATE OF customer_id,job_id,total ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_legacy_reconciliations WHERE invoice_id=OLD.id)
 AND (NEW.customer_id IS NOT OLD.customer_id OR NEW.job_id IS NOT OLD.job_id OR NEW.total IS NOT OLD.total)
BEGIN SELECT RAISE(ABORT,'FINANCE_RETAIN_RECONCILIATION_CONTEXT'); END;
CREATE TRIGGER _finance_reconciliation_paid_state BEFORE UPDATE OF status ON invoices
WHEN EXISTS(SELECT 1 FROM _finance_legacy_reconciliations WHERE invoice_id=OLD.id)
BEGIN
 SELECT CASE WHEN NEW.status='paid' AND (SELECT COALESCE(SUM(p.amount_cents),0) FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL)<>CAST(round(NEW.total*100) AS INTEGER) THEN RAISE(ABORT,'FINANCE_PAYMENT_BALANCE_REQUIRED') END;
 SELECT CASE WHEN NEW.status<>'paid' AND (SELECT COALESCE(SUM(p.amount_cents),0) FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id WHERE p.invoice_id=OLD.id AND r.id IS NULL)=CAST(round(NEW.total*100) AS INTEGER) THEN RAISE(ABORT,'FINANCE_PAYMENT_STATUS_REQUIRED') END;
END;
`;
