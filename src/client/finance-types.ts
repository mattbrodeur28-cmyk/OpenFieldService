export interface CustomerPo {
    customerPo: string;
    version: number;
    updatedAt: string | null;
}
export interface SupplierOrders {
    rows: {
        id: string;
        number: string;
        status: string;
        supplier: string;
    }[];
    page: number;
    hasMore: boolean;
}
export interface PaymentRecord {
    id: string;
    amount_cents: number;
    method: string;
    reference: string;
    paid_on: string;
    note: string;
    actor_id: string;
    created_at: string;
    reversal_id: string | null;
    reversal_reason: string | null;
    reversed_at: string | null;
}
export interface CreditRecord {
    id: string;
    number: number;
    invoice_id: string;
    net_cents: number;
    tax_cents: number;
    total_cents: number;
    issued_on: string;
    evidence_reference: string;
    note: string;
    actor_id: string;
    created_at: string;
    reversal_id: string | null;
    reversal_reason: string | null;
    reversed_at: string | null;
}
export interface InvoiceAccountingData {
    invoice: {
        id: string;
        identifier: string;
        status: string;
        jobId: string | null;
        jobIdentifier: string | null;
        totalCents: number;
        subtotalCents: number | null;
        taxCents: number | null;
    };
    customerPo: CustomerPo | null;
    supplierOrders: SupplierOrders | null;
    payments: PaymentRecord[];
    credits: CreditRecord[];
    creditedCents: number;
    paidCents: number | null;
    balanceCents: number | null;
    legacyPaidNeedsReconciliation: boolean;
    legacyReconciliation: {
        id: string;
        resolution: 'record_receipt' | 'reopen_unsubstantiated';
        paymentId: string | null;
        evidenceReference: string;
        note: string;
        actorId: string;
        createdAt: string;
    } | null;
    sourceToken: string;
    companyDate: string;
}
export interface JobAccountingData {
    job: {
        id: string;
        identifier: string;
        customer_id: string;
    };
    customerPo: CustomerPo;
    invoices: {
        rows: {
            id: string;
            identifier: string;
            status: string;
            total: number;
        }[];
        page: number;
        hasMore: boolean;
    };
    supplierOrders: SupplierOrders | null;
}
export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | 'over_90' | 'undated' | 'review';
export interface ReceivableRow {
    id: string;
    identifier: string;
    status: string;
    customer_id: string;
    customer_name: string;
    job_id: string | null;
    job_identifier: string | null;
    customer_po: string | null;
    due_date: string;
    total_cents: number | null;
    paid_cents: number;
    receipt_count: number;
    balance_cents: number | null;
    days_past_due: number | null;
    aging_bucket: AgingBucket;
}
export interface ReceivablesData {
    companyDate: string;
    currency: 'USD';
    summary: {
        bucket: AgingBucket;
        count: number;
        amountCents: number | null;
    }[];
    knownBalanceCents: number;
    unresolvedCount: number;
    rows: ReceivableRow[];
    total: number;
    page: number;
    pageSize: number;
}
export interface CollectionsData {
    invoiceId: string;
    identifier: string;
    sourceToken: string;
    notes: {
        id: string;
        actorId: string;
        content: string;
        followUpOn: string;
        createdAt: string;
    }[];
    page: number;
    hasMore: boolean;
}
