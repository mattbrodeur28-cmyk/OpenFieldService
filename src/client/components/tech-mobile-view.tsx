import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api } from "../api";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Job } from "../types";
import type { DocumentList, TicketDocument } from "../document-types";

type JobDetailRecord = Job & {
  checklist?: { id: string; label: string; checked: number }[];
  job_materials?: { id: string; material_name?: string; material_unit?: string; quantity: number; unit_cost: number }[];
  job_notes?: { id: string; content: string; created_at: string }[];
};
import { JobExecution } from "./job-execution";
import { JobEquipment } from "./asset-picker";
import { StatusBadge, PriorityBadge } from "./status-badge";
import { Button } from "./ui/button";
import { Notice, Badge, EmptyState } from "./ui/surfaces";
import {
  ArrowLeft,
  Camera,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Image as ImageIcon,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plus,
  Send,
  Smartphone,
  Square,
  Wrench,
  RefreshCw,
} from "lucide-preact";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
function startOfWeekMonday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return ymd(d);
}

const PHOTO_TAGS = ["before", "after", "nameplate", "deficiency", "receipt"];

export function TechMobileView() {
  const { user } = useAccount();
  const { technicianLookup, materials, navigate, updateJob, addJobNote, addJobMaterial, toggleChecklistItem, addChecklistItem } = useApp();
  const { readOnly } = useConnectivity();
  const admin = isAdministrator(user);

  const today = useMemo(() => ymd(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeTechId, setActiveTechId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetailRecord | null>(null);
  const [jobTab, setJobTab] = useState<"ticket" | "photos" | "parts" | "equipment">("ticket");

  const [docs, setDocs] = useState<TicketDocument[]>([]);
  const [photoTag, setPhotoTag] = useState("before");
  const [photoTitle, setPhotoTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [checkText, setCheckText] = useState("");
  const [matId, setMatId] = useState("");
  const [matQty, setMatQty] = useState("1");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rev, setRev] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    accountRequest<{ technician?: { technician_id?: string } | null }>("/api/service/my-technician")
      .then((res) => {
        if (!live) return;
        const tid = res?.technician?.technician_id || "";
        setActiveTechId((prev) => prev || tid || (admin ? technicianLookup[0]?.id || "" : ""));
      })
      .catch(() => {
        if (live && admin && technicianLookup[0]?.id) {
          setActiveTechId((prev) => prev || technicianLookup[0].id);
        }
      });
    return () => { live = false; };
  }, [technicianLookup.length, admin]);

  useEffect(() => {
    if (!activeTechId) { setJobs([]); return; }
    let live = true;
    api<{ jobs: Job[] }>("GET", `/api/jobs?technician_id=${encodeURIComponent(activeTechId)}&limit=200`)
      .then((res) => { if (live) setJobs(res.jobs || []); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [activeTechId, rev]);

  // Load full job detail + photos when a job is open
  useEffect(() => {
    if (!activeJobId) { setJobDetail(null); setDocs([]); return; }
    let live = true;
    Promise.all([
      api<{ job: JobDetailRecord }>("GET", `/api/jobs/${activeJobId}`),
      accountRequest<DocumentList>(`/api/documents/records?jobId=${encodeURIComponent(activeJobId)}&page=1`).catch(() => null),
    ])
      .then(([jd, dl]) => {
        if (!live) return;
        setJobDetail(jd?.job || null);
        setDocs(dl?.documents || []);
      })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [activeJobId, rev]);

  const weekStart = useMemo(() => startOfWeekMonday(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dStr = addDays(weekStart, i);
        const dt = new Date(dStr + "T12:00:00Z");
        const count = jobs.filter((j) => j.scheduled_date === dStr && j.status !== "cancelled").length;
        return {
          date: dStr,
          day: dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          num: dt.getUTCDate(),
          count,
        };
      }),
    [weekStart, jobs],
  );

  const dayJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.scheduled_date === selectedDate && j.status !== "cancelled")
        .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || "")),
    [jobs, selectedDate],
  );

  async function handlePhotoSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !activeJobId || readOnly) return;
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Photo must be between 1 byte and 10 MiB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "metadata",
        JSON.stringify({
          requestKey: crypto.randomUUID(),
          title: photoTitle.trim() || `${photoTag.toUpperCase()} photo · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          tags: ["field-photo", photoTag],
          target: { jobId: activeJobId },
        }),
      );
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "OpenFieldService" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Photo upload failed.");
      setPhotoTitle("");
      setNotice("Photo saved to job ticket.");
      setRev((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function quickAddNote() {
    if (!activeJobId || !noteText.trim()) return;
    try {
      await addJobNote(activeJobId, noteText.trim());
      setNoteText("");
      setNotice("Field note added.");
      setRev((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function quickAddCheck() {
    if (!activeJobId || !checkText.trim()) return;
    try {
      await addChecklistItem(activeJobId, checkText.trim());
      setCheckText("");
      setRev((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function quickAddMaterial() {
    if (!activeJobId || !matId) return;
    try {
      await addJobMaterial(activeJobId, matId, parseFloat(matQty) || 1);
      setMatId("");
      setMatQty("1");
      setNotice("Material logged on ticket.");
      setRev((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const activeTechName = technicianLookup.find((t) => t.id === activeTechId)?.name || user.name;

  // === ACTIVE JOB MOBILE TICKET VIEW ===
  if (activeJobId && jobDetail) {
    return (
      <div class="tmob-shell">
        <header class="tmob-topbar">
          <button type="button" class="tmob-icon-btn" onClick={() => { setActiveJobId(null); setRev((r) => r + 1); }}>
            <ArrowLeft size={20} />
          </button>
          <div class="tmob-topbar-title">
            <strong>{jobDetail.identifier}</strong>
            <small>{jobDetail.customer_name}</small>
          </div>
          <StatusBadge status={jobDetail.status} />
        </header>

        <div class="tmob-body">
          {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}
          {notice && <Notice tone="success" close={() => setNotice("")}>{notice}</Notice>}

          {/* Quick Contact & Navigation Bar */}
          <div class="tmob-quick-actions">
            {jobDetail.customer_phone && (
              <a class="tmob-action-pill" href={`tel:${jobDetail.customer_phone}`}>
                <Phone size={16} /> Call
              </a>
            )}
            {jobDetail.address && (
              <a
                class="tmob-action-pill"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobDetail.address)}`}
                target="_blank"
                rel="noopener"
              >
                <Navigation size={16} /> Navigate
              </a>
            )}
            {(jobDetail.status === "scheduled" || jobDetail.status === "confirmed") && (
              <button
                type="button"
                class="tmob-action-pill is-primary"
                disabled={readOnly}
                onClick={async () => {
                  try {
                    const fresh = await api<{ job: JobDetailRecord }>("GET", `/api/jobs/${jobDetail.id}`);
                    const ver = fresh?.job?.schedule_version ?? jobDetail.schedule_version;
                    await updateJob(jobDetail.id, { status: "in_progress", ...(ver !== undefined ? { expected_version: ver } : {}) } as any);
                    setNotice("Work order started.");
                    setRev((r) => r + 1);
                  } catch (err) {
                    const msg = (err as Error).message || "";
                    if (/safety|pjsa/i.test(msg)) {
                      setError("Complete Step 1 (Safety / PJSA) below to start this work order.");
                    } else {
                      setError(msg);
                    }
                  }
                }}
              >
                Start Job
              </button>
            )}
          </div>

          {jobTab === "ticket" && (
            <div class="tmob-stack">
              <div class="tmob-card">
                <div class="tmob-card-label">Service Details</div>
                <div class="tmob-meta-line"><MapPin size={14} /> {jobDetail.address || "No address on file"}</div>
                <div class="tmob-meta-line">
                  <PriorityBadge priority={jobDetail.priority} />
                  <span>{jobDetail.scheduled_date} at {jobDetail.scheduled_time} ({jobDetail.duration} min)</span>
                </div>
                {jobDetail.notes && (
                  <div class="tmob-notes-box">
                    <strong>Dispatch Notes</strong>
                    <p>{jobDetail.notes}</p>
                  </div>
                )}
              </div>

              <JobExecution
                key={`tmob-exec-${jobDetail.id}-${rev}`}
                jobId={jobDetail.id}
                jobVersion={jobDetail.schedule_version}
                equipmentId={jobDetail.asset_id}
              />
            </div>
          )}

          {jobTab === "photos" && (
            <div class="tmob-stack">
              <div class="tmob-card">
                <div class="tmob-card-label">Capture Job Photo</div>
                <div class="tmob-tag-row">
                  {PHOTO_TAGS.map((t) => (
                    <button
                      type="button"
                      key={t}
                      class={"tmob-tag-chip" + (photoTag === t ? " is-active" : "")}
                      onClick={() => setPhotoTag(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  class="tmob-input"
                  placeholder="Optional caption (e.g., Bad capacitor, Data plate)..."
                  value={photoTitle}
                  onInput={(e) => setPhotoTitle((e.target as HTMLInputElement).value)}
                />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoSelected} />
                <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoSelected} />
                <div class="tmob-photo-buttons">
                  <button
                    type="button"
                    class="tmob-big-btn is-primary"
                    disabled={readOnly || uploading}
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera size={20} /> {uploading ? "Uploading…" : "Take Photo"}
                  </button>
                  <button
                    type="button"
                    class="tmob-big-btn"
                    disabled={readOnly || uploading}
                    onClick={() => galleryRef.current?.click()}
                  >
                    <ImageIcon size={20} /> Gallery
                  </button>
                </div>
              </div>

              <div class="tmob-card">
                <div class="tmob-card-label">Job Photos &amp; Files ({docs.length})</div>
                {docs.length === 0 ? (
                  <p class="text-muted" style={{ fontSize: "13px", margin: "6px 0 0" }}>No photos uploaded on this ticket yet.</p>
                ) : (
                  <div class="tmob-photo-grid">
                    {docs.map((d) => (
                      <a
                        key={d.id}
                        class="tmob-photo-tile"
                        href={`/api/documents/${d.id}/file`}
                        target="_blank"
                        rel="noopener"
                      >
                        {d.media_type?.startsWith("image/") ? (
                          <img src={`/api/documents/${d.id}/file`} alt={d.title || d.original_name} loading="lazy" />
                        ) : (
                          <div class="tmob-photo-doc-fallback">{d.original_name}</div>
                        )}
                        <div class="tmob-photo-cap">
                          <strong>{d.title || d.original_name}</strong>
                          <small>{(d.tags || []).join(", ")}</small>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {jobTab === "parts" && (
            <div class="tmob-stack">
              <div class="tmob-card">
                <div class="tmob-card-label">Checklist</div>
                <div class="checklist-list">
                  {(jobDetail.checklist || []).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      class="tmob-check-row"
                      disabled={readOnly}
                      onClick={async () => {
                        await toggleChecklistItem(item.id);
                        setRev((r) => r + 1);
                      }}
                    >
                      {item.checked ? <CheckSquare size={20} color="var(--success)" /> : <Square size={20} />}
                      <span class={item.checked ? "checklist-done" : ""}>{item.label}</span>
                    </button>
                  ))}
                </div>
                <div class="tmob-inline-add">
                  <input
                    type="text"
                    class="tmob-input"
                    placeholder="Add checklist item..."
                    value={checkText}
                    onInput={(e) => setCheckText((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => e.key === "Enter" && void quickAddCheck()}
                  />
                  <button type="button" class="tmob-big-btn is-compact" disabled={readOnly} onClick={() => void quickAddCheck()}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div class="tmob-card">
                <div class="tmob-card-label">Materials Used ({(jobDetail.job_materials || []).length})</div>
                {(jobDetail.job_materials || []).map((m) => (
                  <div key={m.id} class="tmob-list-row">
                    <span>{m.material_name} × {m.quantity} {m.material_unit}</span>
                    <strong>${(m.quantity * m.unit_cost).toFixed(2)}</strong>
                  </div>
                ))}
                <div class="tmob-inline-add" style={{ marginTop: "8px" }}>
                  <select class="tmob-input" value={matId} onChange={(e) => setMatId((e.target as HTMLSelectElement).value)}>
                    <option value="">Select part / material…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} (${m.unit_cost}/{m.unit})</option>
                    ))}
                  </select>
                  <input type="number" class="tmob-input" style={{ width: "68px", flex: "0 0 auto" }} min="0.1" step="0.1" value={matQty} onInput={(e) => setMatQty((e.target as HTMLInputElement).value)} />
                  <button type="button" class="tmob-big-btn is-primary is-compact" disabled={readOnly || !matId} onClick={() => void quickAddMaterial()}>
                    Add
                  </button>
                </div>
              </div>

              <div class="tmob-card">
                <div class="tmob-card-label">Field Notes ({(jobDetail.job_notes || []).length})</div>
                <div class="tmob-inline-add">
                  <input
                    type="text"
                    class="tmob-input"
                    placeholder="Type a field note..."
                    value={noteText}
                    onInput={(e) => setNoteText((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => e.key === "Enter" && void quickAddNote()}
                  />
                  <button type="button" class="tmob-big-btn is-primary is-compact" disabled={readOnly} onClick={() => void quickAddNote()}>
                    <Send size={16} />
                  </button>
                </div>
                <div class="notes-list" style={{ marginTop: "8px" }}>
                  {(jobDetail.job_notes || []).map((n) => (
                    <div key={n.id} class="note-item">
                      <div class="note-content">{n.content}</div>
                      <div class="note-meta"><span>{new Date(n.created_at).toLocaleString()}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {jobTab === "equipment" && (
            <div class="tmob-stack">
              <JobEquipment key={`tmob-eq-${jobDetail.id}`} job={jobDetail} />
            </div>
          )}
        </div>

        {/* Sticky Thumb-Friendly Bottom Tab Bar */}
        <nav class="tmob-bottom-nav" aria-label="Mobile job sections">
          <button type="button" class={jobTab === "ticket" ? "is-active" : ""} onClick={() => setJobTab("ticket")}>
            <ClipboardList size={20} /><span>Ticket</span>
          </button>
          <button type="button" class={jobTab === "photos" ? "is-active" : ""} onClick={() => setJobTab("photos")}>
            <Camera size={20} /><span>Photos ({docs.length})</span>
          </button>
          <button type="button" class={jobTab === "parts" ? "is-active" : ""} onClick={() => setJobTab("parts")}>
            <Package size={20} /><span>Parts</span>
          </button>
          <button type="button" class={jobTab === "equipment" ? "is-active" : ""} onClick={() => setJobTab("equipment")}>
            <Wrench size={20} /><span>Unit</span>
          </button>
        </nav>
      </div>
    );
  }

  // === MOBILE SCHEDULE LIST VIEW ===
  return (
    <div class="tmob-shell">
      <header class="tmob-topbar">
        <div class="tmob-topbar-title">
          <strong><Smartphone size={16} style={{ verticalAlign: "text-bottom", marginRight: "4px" }} /> Mobile Field</strong>
          <small>{activeTechName}</small>
        </div>
        <div class="btn-row">
          <button type="button" class="tmob-icon-btn" aria-label="Refresh" onClick={() => setRev((r) => r + 1)}>
            <RefreshCw size={18} />
          </button>
          <Button variant="ghost" onClick={() => navigate("/my-day")}>Desktop</Button>
        </div>
      </header>

      <div class="tmob-body">
        {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}

        {admin && technicianLookup.length > 0 && (
          <select
            class="tmob-input"
            style={{ marginBottom: "10px" }}
            aria-label="Preview technician"
            value={activeTechId}
            onChange={(e) => setActiveTechId((e.target as HTMLSelectElement).value)}
          >
            {technicianLookup.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {/* Date Strip */}
        <div class="tmob-date-bar">
          <button type="button" class="tmob-icon-btn" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" class="tmob-date-today" onClick={() => setSelectedDate(today)}>
            {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
          </button>
          <button type="button" class="tmob-icon-btn" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div class="tmob-week-strip">
          {weekDays.map((d) => (
            <button
              type="button"
              key={d.date}
              class={"tmob-day-pill" + (d.date === selectedDate ? " is-active" : "")}
              onClick={() => setSelectedDate(d.date)}
            >
              <span>{d.day}</span>
              <strong>{d.num}</strong>
              {d.count > 0 && <em class="tmob-day-dot" />}
            </button>
          ))}
        </div>

        {/* Job Cards */}
        <div class="tmob-stack" style={{ marginTop: "12px" }}>
          {dayJobs.length === 0 ? (
            <EmptyState title="No jobs scheduled">
              Tap another day above to check upcoming field calls.
            </EmptyState>
          ) : (
            dayJobs.map((job) => (
              <article
                key={job.id}
                class="tmob-job-card"
                onClick={() => {
                  setJobDetail(job);
                  setActiveJobId(job.id);
                  setJobTab("ticket");
                }}
              >
                <div class="tmob-job-top">
                  <strong class="tmob-job-time">{job.scheduled_time || "TBD"} · {job.duration}m</strong>
                  <StatusBadge status={job.status} />
                </div>
                <div class="tmob-job-title">{job.identifier} — {job.customer_name}</div>
                {job.address && <div class="tmob-meta-line"><MapPin size={13} /> {job.address}</div>}
                {job.notes && <p class="tmob-job-notes">{job.notes}</p>}
                <div class="tmob-job-footer">
                  <Badge>{job.service_type_name || "Service"}</Badge>
                  <span class="tmob-tap-cta">Open Ticket →</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
