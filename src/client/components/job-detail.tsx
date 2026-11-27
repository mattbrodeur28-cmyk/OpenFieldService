import {CustomRecordFields} from "./custom-record-fields";
import {JobSalesSource} from "./job-sales-source";
import {JobAccounting} from "./finance/job-accounting";
import {TicketDocuments} from "./ticket-documents";
import { useState } from "preact/hooks";
import { useApp } from "../context";
import { JobExecution } from "./job-execution";
import { JobEquipment } from "./asset-picker";
import { StatusBadge, PriorityBadge } from "./status-badge";
import { ArrowLeft, Trash2, Send, MapPin, Clock, DollarSign, User, Wrench, Plus, X, CheckSquare, Square, Package, FileText, ClipboardList, FolderOpen, Receipt, RotateCcw } from "lucide-preact";
import type { JobStatus } from "../types";
import { useConnectivity } from "../hooks/use-connectivity";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { Dialog, DialogTitle } from "./ui/dialog";
import { TextField } from "./ui/input";
import { Button } from "./ui/button";
import { Notice } from "./ui/surfaces";

const ALL_STATUSES: JobStatus[] = ["scheduled", "confirmed", "in_progress", "completed", "cancelled"];

export function JobDetail() {
  const {
    selectedJob: job, navigate, updateJob, deleteJob, refreshJob, setError,
    addJobNote, deleteJobNote, technicianLookup, isAgent,
    addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    addJobMaterial, deleteJobMaterial, materials, createInvoiceFromJob,
  } = useApp();
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const canReopen = isAdministrator(user);
  const [tab, setTab] = useState<"workflow" | "materials" | "documents" | "billing">("workflow");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("Fix billing or edit ticket");
  const [reopening, setReopening] = useState(false);
  const [workflowRev, setWorkflowRev] = useState(0);
  const [notice, setNotice] = useState("");
  const [noteText, setNoteText] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [materialQty, setMaterialQty] = useState("1");

  if (!job) return null;

  const handleStatusChange = (status: JobStatus) =>
    updateJob(job.id, {
      status,
      ...(job.schedule_version !== undefined ? { expected_version: job.schedule_version } : {}),
    } as any).catch(err => setError((err as Error).message));

  const handleReopen = async (e: Event) => {
    e.preventDefault();
    setReopening(true);
    try {
      await accountRequest(`/api/service/jobs/${job.id}/reopen`, "POST", {
        reason: reopenReason.trim() || "Reopened to edit ticket or fix billing.",
      });
      await refreshJob(job.id);
      setWorkflowRev((n) => n + 1);
      setReopenOpen(false);
      setNotice("Job reopened — you can now edit the ticket, materials, and billing.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReopening(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addJobNote(job.id, noteText.trim());
    setNoteText("");
  };

  const handleAddChecklist = async () => {
    if (!checklistText.trim()) return;
    await addChecklistItem(job.id, checklistText.trim());
    setChecklistText("");
  };

  const handleAddMaterial = async () => {
    if (!materialId) return;
    await addJobMaterial(job.id, materialId, parseFloat(materialQty) || 1);
    setMaterialId("");
    setMaterialQty("1");
    setShowAddMaterial(false);
  };

  const checklistCount = (job.checklist || []).length;
  const materialsCount = (job.job_materials || []).length;
  const notesCount = (job.job_notes || []).length;

  return (
    <div class="page job-detail-page">
      <div class="record-header job-hero-header">
        <div class="record-header-main">
          <button class="btn btn-back" onClick={() => navigate("/jobs")}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div class="job-hero-title-row">
              <h1 class="record-header-title">{job.identifier}</h1>
              <StatusBadge status={job.status} />
              <PriorityBadge priority={job.priority} />
              {job.service_type_name && (
                <span class="service-pill" style={{ borderColor: job.service_type_color || "var(--text-muted)" }}>
                  <span class="service-dot" style={{ background: job.service_type_color || "var(--text-muted)" }} />
                  {job.service_type_name}
                </span>
              )}
            </div>
            <div class="record-header-subtitle">
              <button type="button" class="customer-context-link" onClick={() => navigate(`/customers/${job.customer_id}`)}>
                <User size={13} /> {job.customer_name || "Customer"}
              </button>
              {job.address && <span><MapPin size={13} /> {job.address}</span>}
              <span><Clock size={13} /> {job.scheduled_date} at {job.scheduled_time} ({job.duration} min)</span>
              <span><DollarSign size={13} /> ${job.price.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div class="page-header-right">
          {job.status === "confirmed" && (
            <button class="btn btn-primary" disabled={readOnly} onClick={() => handleStatusChange("in_progress")}>
              Start Job
            </button>
          )}
          {job.status === "completed" && canReopen && (
            <button class="btn" disabled={readOnly} onClick={() => setReopenOpen(true)}>
              <RotateCcw size={14} /> Re-open Job
            </button>
          )}
          <button class="btn btn-primary" disabled={readOnly} onClick={() => createInvoiceFromJob(job.id).catch(err => setError((err as Error).message))}>
            <FileText size={14} /> Create Invoice
          </button>
          <button class="btn btn-danger" disabled={readOnly} onClick={() => deleteJob(job.id).catch(err => setError((err as Error).message))}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: "12px" }}>
          <Notice tone="success" close={() => setNotice("")}>{notice}</Notice>
        </div>
      )}

      <div class="detail-layout job-detail-layout">
        <div class="detail-main">
          {job.notes && (
            <div class="job-call-notes-card">
              <strong>Call Description / Dispatch Notes</strong>
              <p>{job.notes}</p>
            </div>
          )}

          <div class="st-pipeline-tabs job-workflow-tabs" role="tablist" aria-label="Job sections">
            <button type="button" role="tab" aria-selected={tab === "workflow"} class={"st-pill-tab" + (tab === "workflow" ? " is-active" : "")} onClick={() => setTab("workflow")}>
              <ClipboardList size={14} /> Workflow &amp; Execution
            </button>
            <button type="button" role="tab" aria-selected={tab === "materials"} class={"st-pill-tab" + (tab === "materials" ? " is-active" : "")} onClick={() => setTab("materials")}>
              <Package size={14} /> Equipment &amp; Materials {materialsCount > 0 && <span class="st-pill-count">{materialsCount}</span>}
            </button>
            <button type="button" role="tab" aria-selected={tab === "documents"} class={"st-pill-tab" + (tab === "documents" ? " is-active" : "")} onClick={() => setTab("documents")}>
              <FolderOpen size={14} /> Documents &amp; Fields
            </button>
            <button type="button" role="tab" aria-selected={tab === "billing"} class={"st-pill-tab" + (tab === "billing" ? " is-active" : "")} onClick={() => setTab("billing")}>
              <Receipt size={14} /> Billing &amp; Accounting
            </button>
          </div>

          {tab === "workflow" && (
            <div class="job-tab-stack">
              <JobExecution key={`execution-${job.id}-${workflowRev}`} jobId={job.id} jobVersion={job.schedule_version} equipmentId={job.asset_id} />

              <div class="job-two-col">
                <div class="detail-section job-card-clean">
                  <h3><CheckSquare size={15} /> Checklist {checklistCount > 0 && <span class="text-muted">({checklistCount})</span>}</h3>
                  <div class="checklist-list">
                    {(job.checklist || []).map((item) => (
                      <div key={item.id} class="checklist-item">
                        <button class="checklist-toggle" disabled={readOnly} onClick={() => toggleChecklistItem(item.id)}>
                          {item.checked ? <CheckSquare size={16} color="var(--success)" /> : <Square size={16} />}
                        </button>
                        <span class={item.checked ? "checklist-done" : ""}>{item.label}</span>
                        {isAgent && (
                          <button class="btn-icon danger" disabled={readOnly} onClick={() => deleteChecklistItem(item.id)}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    {checklistCount === 0 && <p class="text-muted" style={{ fontSize: "12px", margin: "4px 0 8px" }}>No checklist items yet.</p>}
                  </div>
                  <div class="note-input-row">
                    <input
                      type="text"
                      disabled={readOnly}
                      value={checklistText}
                      onInput={(e) => setChecklistText((e.target as HTMLInputElement).value)}
                      placeholder="Add checklist item..."
                      onKeyDown={(e) => e.key === "Enter" && handleAddChecklist()}
                    />
                    <button class="btn btn-sm" disabled={readOnly} onClick={handleAddChecklist}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div class="detail-section job-card-clean">
                  <h3><Send size={15} /> Activity &amp; Notes {notesCount > 0 && <span class="text-muted">({notesCount})</span>}</h3>
                  <div class="note-input-row">
                    <input
                      type="text"
                      disabled={readOnly}
                      value={noteText}
                      onInput={(e) => setNoteText((e.target as HTMLInputElement).value)}
                      placeholder="Add a field note..."
                      onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                    />
                    <button class="btn btn-sm" disabled={readOnly} onClick={handleAddNote}>
                      <Send size={14} />
                    </button>
                  </div>
                  <div class="notes-list">
                    {(job.job_notes || []).map((note) => (
                      <div key={note.id} class="note-item">
                        <div class="note-content">{note.content}</div>
                        <div class="note-meta">
                          <span>{new Date(note.created_at).toLocaleString()}</span>
                          {isAgent && (
                            <button class="btn-icon danger" disabled={readOnly} onClick={() => deleteJobNote(note.id)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {notesCount === 0 && <p class="text-muted" style={{ fontSize: "12px", margin: "8px 0 0" }}>No activity notes yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "materials" && (
            <div class="job-tab-stack">
              <JobEquipment key={job.id} job={job} />
              <div class="detail-section job-card-clean">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <h3 style={{ margin: 0 }}><Package size={15} /> Materials Used</h3>
                  {!showAddMaterial && (
                    <button class="btn btn-sm" disabled={readOnly} onClick={() => setShowAddMaterial(true)}>
                      <Plus size={14} /> Add Material
                    </button>
                  )}
                </div>
                {(job.job_materials || []).length > 0 ? (
                  <div class="table-scroll" style={{ marginBottom: 12 }}>
                    <table class="table">
                      <thead>
                        <tr><th>Material</th><th>Qty</th><th>Unit Cost</th><th>Total</th>{isAgent && <th></th>}</tr>
                      </thead>
                      <tbody>
                        {(job.job_materials || []).map((jm) => (
                          <tr key={jm.id} class="table-row">
                            <td>{jm.material_name || "—"}</td>
                            <td>{jm.quantity} {jm.material_unit}</td>
                            <td>${jm.unit_cost.toFixed(2)}</td>
                            <td class="text-bold">${(jm.quantity * jm.unit_cost).toFixed(2)}</td>
                            {isAgent && (
                              <td><button class="btn-icon danger" disabled={readOnly} onClick={() => deleteJobMaterial(jm.id).catch(err => setError((err as Error).message))}><Trash2 size={12} /></button></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p class="text-muted" style={{ fontSize: "12px", margin: "4px 0 10px" }}>No materials logged on this job yet.</p>
                )}
                {showAddMaterial && (
                  <div class="note-input-row">
                    <select disabled={readOnly} value={materialId} onChange={(e) => setMaterialId((e.target as HTMLSelectElement).value)} style={{ flex: 2 }}>
                      <option value="">Select material...</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} (${m.unit_cost}/{m.unit})</option>
                      ))}
                    </select>
                    <input type="number" disabled={readOnly} value={materialQty} onInput={(e) => setMaterialQty((e.target as HTMLInputElement).value)} style={{ width: 70 }} min="0.1" step="0.1" />
                    <button class="btn btn-sm btn-primary" disabled={readOnly} onClick={() => handleAddMaterial().catch(err => setError((err as Error).message))}>Add</button>
                    <button class="btn btn-sm" onClick={() => setShowAddMaterial(false)}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div class="job-tab-stack">
              <TicketDocuments key={"documents-" + job.id} target={{ jobId: job.id }} />
              <CustomRecordFields key={"fields-" + job.id} objectKey="service.job" recordId={job.id} />
            </div>
          )}

          {tab === "billing" && (
            <div class="job-tab-stack">
              <JobSalesSource key={`sales:${job.id}`} jobId={job.id} />
              <JobAccounting key={job.id} jobId={job.id} />
            </div>
          )}
        </div>

        <div class="detail-sidebar job-detail-sidebar">
          <div class="detail-sidebar-section">
            <h4>Status</h4>
            <div class="status-buttons">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={readOnly}
                  class={`status-btn ${job.status === s ? "active" : ""}`}
                  onClick={() => handleStatusChange(s)}
                >
                  {s === "confirmed" ? "Dispatched" : s.replace("_", " ")}
                </button>
              ))}
            </div>
            {job.status === "completed" && canReopen && (
              <button class="btn" style={{ width: "100%", marginTop: "8px", justifyContent: "center" }} disabled={readOnly} onClick={() => setReopenOpen(true)}>
                <RotateCcw size={14} /> Re-open for Editing / Billing
              </button>
            )}
          </div>

          <div class="detail-sidebar-section">
            <h4>Assigned Technician</h4>
            <select
              disabled={readOnly}
              value={job.technician_id || ""}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                void updateJob(job.id, { technician_id: val || null }).catch(err => setError((err as Error).message));
              }}
            >
              <option value="">Unassigned</option>
              {technicianLookup.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div class="detail-sidebar-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h4 style={{ margin: 0 }}>Customer Context</h4>
              <button class="btn btn-sm" disabled={readOnly} onClick={() => navigate(`/customers/${job.customer_id}`)}>
                Open
              </button>
            </div>
            <div class="job-sidebar-kv">
              <div><small>Customer</small><strong>{job.customer_name || "—"}</strong></div>
              {job.customer_phone && <div><small>Phone</small><span>{job.customer_phone}</span></div>}
              <div><small>Lifetime jobs</small><strong>{job.customer_job_count ?? 1}</strong></div>
              <div>
                <small>Last service</small>
                {job.customer_last_service_id ? (
                  <button class="customer-context-link" onClick={() => navigate(`/jobs/${job.customer_last_service_id}`)}>
                    {job.customer_last_service_identifier} · {job.customer_last_service_date}
                  </button>
                ) : (
                  <span>None yet</span>
                )}
              </div>
              <div>
                <small>{job.customer_recorded_receipts !== undefined ? "Recorded receipts" : "Paid invoices"}</small>
                <strong>${(job.customer_recorded_receipts ?? job.customer_lifetime_revenue ?? 0).toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {job.is_recurring === 1 && (
            <div class="detail-sidebar-section">
              <h4>Recurring</h4>
              <p class="text-muted">{job.recurrence_interval || "Not set"}</p>
            </div>
          )}
        </div>
      </div>
      {reopenOpen && (
        <Dialog close={() => setReopenOpen(false)}>
          <DialogTitle>Re-open Completed Job ({job.identifier})</DialogTitle>
          <p class="workspace-help">
            Reopening returns this job to <strong>In Progress</strong> and unlocks ticket edits, materials, post-work reports, and billing adjustments while preserving all prior safety and report records.
          </p>
          <form class="sales-form" onSubmit={handleReopen}>
            <TextField
              label="Reason for reopening"
              value={reopenReason}
              onInput={(e) => setReopenReason((e.target as HTMLInputElement).value)}
              placeholder="Fix billing or edit ticket details"
            />
            <div class="dialog-actions">
              <Button disabled={reopening} onClick={() => setReopenOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={reopening}>
                <RotateCcw size={14} /> {reopening ? "Reopening..." : "Re-open Job"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
