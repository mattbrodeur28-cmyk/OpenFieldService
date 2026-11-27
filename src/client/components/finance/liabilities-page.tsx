import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { useConnectivity } from "../../hooks/use-connectivity";
import { Button } from "../ui/button";
import { Dialog, DialogTitle } from "../ui/dialog";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Badge, EmptyState, Notice, Table } from "../ui/surfaces";
import { Plus, RefreshCw, CheckCircle2, DollarSign } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const todayYmd = () => new Date().toISOString().slice(0, 10);
const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format((cents || 0) / 100);

export function LiabilitiesPage() {
  const { readOnly } = useConnectivity();
  const [data, setData] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [rev, setRev] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [crediting, setCrediting] = useState<any>(null);

  const [form, setForm] = useState({
    supplierName: "",
    billNumber: "",
    billDate: todayYmd(),
    dueDate: todayYmd(),
    subtotal: "",
    tax: "0",
    notes: "",
  });
  const [payForm, setPayForm] = useState({ paidOn: todayYmd(), amount: "", method: "ach", reference: "" });
  const [credForm, setCredForm] = useState({ creditedOn: todayYmd(), amount: "", reason: "", reference: "" });

  useEffect(() => {
    let live = true;
    setError("");
    accountRequest<any>(`/api/service/liabilities?status=${encodeURIComponent(statusFilter)}`)
      .then((res) => {
        if (live) setData(res);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [statusFilter, rev]);

  const reload = (msg: string) => {
    setCreating(false);
    setPaying(null);
    setCrediting(null);
    setNotice(msg);
    setRev((r) => r + 1);
  };

  async function saveBill(e: Event) {
    e.preventDefault();
    try {
      await accountRequest("/api/service/liabilities", "POST", {
        requestKey: uuid(),
        supplierName: form.supplierName,
        billNumber: form.billNumber,
        billDate: form.billDate,
        dueDate: form.dueDate,
        subtotalCents: Math.round(Number(form.subtotal || 0) * 100),
        taxCents: Math.round(Number(form.tax || 0) * 100),
        notes: form.notes,
      });
      setForm({ supplierName: "", billNumber: "", billDate: todayYmd(), dueDate: todayYmd(), subtotal: "", tax: "0", notes: "" });
      reload("Supplier bill recorded.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function approveBill(id: string) {
    try {
      await accountRequest(`/api/service/liabilities/${id}/approve`, "POST", { requestKey: uuid() });
      reload("Supplier bill approved for payment.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitPay(e: Event) {
    e.preventDefault();
    if (!paying) return;
    try {
      await accountRequest(`/api/service/liabilities/${paying.id}/payments`, "POST", {
        requestKey: uuid(),
        paidOn: payForm.paidOn,
        amountCents: Math.round(Number(payForm.amount || 0) * 100),
        method: payForm.method,
        reference: payForm.reference,
      });
      reload("Supplier payment recorded.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitCredit(e: Event) {
    e.preventDefault();
    if (!crediting) return;
    try {
      await accountRequest(`/api/service/liabilities/${crediting.id}/credits`, "POST", {
        requestKey: uuid(),
        creditedOn: credForm.creditedOn,
        amountCents: Math.round(Number(credForm.amount || 0) * 100),
        reason: credForm.reason,
        reference: credForm.reference,
      });
      reload("Vendor credit applied.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const summary = data?.summary;
  const bills = data?.bills || [];
  const caps = data?.capabilities || {};

  return (
    <div class="page">
      <header class="dispatch-title">
        <div>
          <h1>Liabilities &amp; Supplier Bills</h1>
          <p class="workspace-help">Track supplier bills, PO matching, vendor credits, approval, and payments separately from committed PO spend.</p>
        </div>
        <div class="btn-row">
          <Button variant="ghost" onClick={() => setRev((r) => r + 1)}><RefreshCw size={14} /> Refresh</Button>
          {caps.canManageLiabilities && (
            <Button variant="primary" disabled={readOnly} onClick={() => setCreating(true)}>
              <Plus size={14} /> Add Supplier Bill
            </Button>
          )}
        </div>
      </header>

      {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" close={() => setNotice("")}>{notice}</Notice>}

      {summary && (
        <div class="project-kpis" style={{ marginBottom: "14px" }}>
          <div class="card"><small class="text-muted">Open Recognized Payables</small><strong>{money(summary.openRecognizedCents)}</strong></div>
          <div class="card"><small class="text-muted">Overdue Payables</small><strong>{money(summary.overdueCents)}</strong></div>
          <div class="card"><small class="text-muted">Draft Bills (Unapproved)</small><strong>{money(summary.draftCents)}</strong></div>
          <div class="card"><small class="text-muted">Committed PO Spend (Separate)</small><strong>{money(summary.committedPoCents)}</strong></div>
          <div class="card"><small class="text-muted">Paid to Date</small><strong>{money(summary.paidTotalCents)}</strong></div>
        </div>
      )}

      <div class="btn-row" style={{ marginBottom: "12px" }}>
        <div style={{ width: "200px" }}>
          <Select
            label="Filter status"
            value={statusFilter}
            options={[
              { value: "all", label: "All bills" },
              { value: "draft", label: "Draft" },
              { value: "approved", label: "Approved" },
              { value: "partially_paid", label: "Partially paid" },
              { value: "paid", label: "Paid" },
            ]}
            onValueChange={setStatusFilter}
          />
        </div>
      </div>

      {bills.length ? (
        <Table label="Supplier bills">
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Supplier</th>
              <th>Bill / Due Date</th>
              <th>Total</th>
              <th>Balance</th>
              <th>Aging</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b: any) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.bill_number}</strong>
                  {b.po_matched && <div class="text-muted" style={{ fontSize: "11px" }}>PO matched</div>}
                </td>
                <td>{b.supplier_name}</td>
                <td>{b.bill_date} → {b.due_date}</td>
                <td>{money(b.total_cents)}</td>
                <td><strong>{money(b.balanceCents)}</strong></td>
                <td><Badge tone={["current", "paid"].includes(b.agingBucket) ? "neutral" : "warning"}>{b.agingBucket.replaceAll("_", " ")}</Badge></td>
                <td><Badge tone={b.status === "paid" ? "success" : b.status === "approved" ? "warning" : "neutral"}>{b.status.replaceAll("_", " ")}</Badge></td>
                <td>
                  <div class="btn-row">
                    {caps.canApproveBills && b.status === "draft" && (
                      <Button variant="primary" disabled={readOnly} onClick={() => void approveBill(b.id)}>
                        <CheckCircle2 size={13} /> Approve
                      </Button>
                    )}
                    {caps.canManageLiabilities && ["approved", "partially_paid"].includes(b.status) && b.balanceCents > 0 && (
                      <>
                        <Button
                          variant="primary"
                          disabled={readOnly}
                          onClick={() => {
                            setPaying(b);
                            setPayForm({ paidOn: todayYmd(), amount: (b.balanceCents / 100).toFixed(2), method: "ach", reference: "" });
                          }}
                        >
                          <DollarSign size={13} /> Pay
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={readOnly}
                          onClick={() => {
                            setCrediting(b);
                            setCredForm({ creditedOn: todayYmd(), amount: "", reason: "", reference: "" });
                          }}
                        >
                          Credit
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No supplier bills recorded">Add a supplier bill to track accounts payable, approvals, vendor credits, and payments.</EmptyState>
      )}

      {creating && (
        <Dialog close={() => setCreating(false)}>
          <DialogTitle>Add Supplier Bill</DialogTitle>
          <form class="sales-form" onSubmit={saveBill}>
            <TextField label="Supplier name" required value={form.supplierName} onInput={(e) => setForm({ ...form, supplierName: e.currentTarget.value })} />
            <TextField label="Bill / Invoice #" required value={form.billNumber} onInput={(e) => setForm({ ...form, billNumber: e.currentTarget.value })} />
            <div class="sales-form-grid">
              <TextField label="Bill date" type="date" required value={form.billDate} onInput={(e) => setForm({ ...form, billDate: e.currentTarget.value })} />
              <TextField label="Due date" type="date" required value={form.dueDate} onInput={(e) => setForm({ ...form, dueDate: e.currentTarget.value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Subtotal ($)" type="number" step="0.01" required value={form.subtotal} onInput={(e) => setForm({ ...form, subtotal: e.currentTarget.value })} />
              <TextField label="Tax ($)" type="number" step="0.01" value={form.tax} onInput={(e) => setForm({ ...form, tax: e.currentTarget.value })} />
            </div>
            <TextField label="Notes" value={form.notes} onInput={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" type="submit">Save Bill</Button>
            </div>
          </form>
        </Dialog>
      )}

      {paying && (
        <Dialog close={() => setPaying(null)}>
          <DialogTitle>Record Payment — {paying.bill_number}</DialogTitle>
          <form class="sales-form" onSubmit={submitPay}>
            <div class="sales-form-grid">
              <TextField label="Paid on" type="date" required value={payForm.paidOn} onInput={(e) => setPayForm({ ...payForm, paidOn: e.currentTarget.value })} />
              <TextField label="Amount ($)" type="number" step="0.01" required value={payForm.amount} onInput={(e) => setPayForm({ ...payForm, amount: e.currentTarget.value })} />
            </div>
            <div class="sales-form-grid">
              <Select label="Method" value={payForm.method} options={["ach", "check", "wire", "card", "cash", "other"].map((m) => ({ value: m, label: m.toUpperCase() }))} onValueChange={(v) => setPayForm({ ...payForm, method: v })} />
              <TextField label="Check / ACH reference" value={payForm.reference} onInput={(e) => setPayForm({ ...payForm, reference: e.currentTarget.value })} />
            </div>
            <div class="dialog-actions">
              <Button onClick={() => setPaying(null)}>Cancel</Button>
              <Button variant="primary" type="submit">Record Payment</Button>
            </div>
          </form>
        </Dialog>
      )}

      {crediting && (
        <Dialog close={() => setCrediting(null)}>
          <DialogTitle>Apply Vendor Credit — {crediting.bill_number}</DialogTitle>
          <form class="sales-form" onSubmit={submitCredit}>
            <div class="sales-form-grid">
              <TextField label="Credited on" type="date" required value={credForm.creditedOn} onInput={(e) => setCredForm({ ...credForm, creditedOn: e.currentTarget.value })} />
              <TextField label="Amount ($)" type="number" step="0.01" required value={credForm.amount} onInput={(e) => setCredForm({ ...credForm, amount: e.currentTarget.value })} />
            </div>
            <TextField label="Reason" required value={credForm.reason} onInput={(e) => setCredForm({ ...credForm, reason: e.currentTarget.value })} />
            <TextField label="Credit memo ref" value={credForm.reference} onInput={(e) => setCredForm({ ...credForm, reference: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setCrediting(null)}>Cancel</Button>
              <Button variant="primary" type="submit">Apply Credit</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
