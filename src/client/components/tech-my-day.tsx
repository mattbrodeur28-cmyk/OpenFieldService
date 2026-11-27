import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "../api";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Job } from "../types";
import { JobExecution } from "./job-execution";
import { JobEquipment } from "./asset-picker";
import { StatusBadge, PriorityBadge } from "./status-badge";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Badge, EmptyState, Notice } from "./ui/surfaces";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  ClipboardList,
  Receipt,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-preact";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return ymd(d);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

export function TechMyDay() {
  const { user } = useAccount();
  const { technicianLookup, navigate, updateJob } = useApp();
  const { readOnly } = useConnectivity();
  const admin = isAdministrator(user);

  const today = useMemo(() => ymd(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(today));
  const [linkedTechId, setLinkedTechId] = useState<string>("");
  const [activeTechId, setActiveTechId] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);

  // Discover the logged-in user's linked technician record
  useEffect(() => {
    let live = true;
    accountRequest<{ technician?: { technician_id?: string } | null }>("/api/service/my-technician")
      .then((res) => {
        if (!live) return;
        const tid = res?.technician?.technician_id || "";
        setLinkedTechId(tid);
        setActiveTechId((prev) => prev || tid || (admin ? technicianLookup[0]?.id || "" : ""));
      })
      .catch(() => {
        if (live && admin && technicianLookup[0]?.id) {
          setActiveTechId((prev) => prev || technicianLookup[0].id);
        }
      });
    return () => {
      live = false;
    };
  }, [technicianLookup.length, admin]);

  // Load jobs for the active technician
  useEffect(() => {
    if (!activeTechId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    api<{ jobs: Job[] }>("GET", `/api/jobs?technician_id=${encodeURIComponent(activeTechId)}&limit=200`)
      .then((res) => {
        if (!live) return;
        setJobs(res.jobs || []);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [activeTechId, rev]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dStr = addDays(weekStart, i);
        const dt = new Date(dStr + "T12:00:00Z");
        const dayJobs = jobs
          .filter((j) => j.scheduled_date === dStr && j.status !== "cancelled")
          .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""));
        const totalMin = dayJobs.reduce((s, j) => s + (j.duration || 0), 0);
        return {
          date: dStr,
          weekday: dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          dayNum: dt.getUTCDate(),
          monthShort: dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
          jobs: dayJobs,
          totalMin,
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

  const weekTotalJobs = weekDays.reduce((s, d) => s + d.jobs.length, 0);
  const dayTotalMin = dayJobs.reduce((s, j) => s + (j.duration || 0), 0);
  const dayCompleted = dayJobs.filter((j) => j.status === "completed").length;
  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId) || null, [jobs, activeJobId]);
  const activeTechName = technicianLookup.find((t) => t.id === activeTechId)?.name || user.name;

  function shiftWeek(deltaDays: number) {
    const nextStart = addDays(weekStart, deltaDays);
    setWeekStart(nextStart);
    setSelectedDate(nextStart);
  }

  // Focused 3-step Technician Field Execution mode for the selected job
  if (activeJob) {
    return (
      <div class="page tech-day-page">
        <div class="record-header job-hero-header">
          <div class="record-header-main">
            <button class="btn btn-back" onClick={() => { setActiveJobId(null); setRev((r) => r + 1); }}>
              <ArrowLeft size={16} /> Back to My Day
            </button>
            <div>
              <div class="job-hero-title-row">
                <h1 class="record-header-title">{activeJob.identifier} · {activeJob.customer_name}</h1>
                <StatusBadge status={activeJob.status} />
                <PriorityBadge priority={activeJob.priority} />
              </div>
              <div class="record-header-subtitle">
                <span><Clock size={13} /> {activeJob.scheduled_date} at {activeJob.scheduled_time} ({activeJob.duration} min)</span>
                {activeJob.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeJob.address)}`}
                    target="_blank"
                    rel="noopener"
                    class="customer-context-link"
                  >
                    <MapPin size={13} /> {activeJob.address}
                  </a>
                )}
                {activeJob.customer_phone && <span><Phone size={13} /> {activeJob.customer_phone}</span>}
              </div>
            </div>
          </div>
          <div class="page-header-right">
            {activeJob.status === "confirmed" || activeJob.status === "scheduled" ? (
              <Button
                variant="primary"
                disabled={readOnly}
                onClick={async () => {
                  try {
                    const fresh = await api<{ job: Job }>("GET", `/api/jobs/${activeJob.id}`);
                    const ver = fresh?.job?.schedule_version ?? activeJob.schedule_version;
                    await updateJob(activeJob.id, { status: "in_progress", ...(ver !== undefined ? { expected_version: ver } : {}) } as any);
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
                Start Work Order
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => navigate(`/jobs/${activeJob.id}`)}>
              <ExternalLink size={14} /> Full Ticket
            </Button>
          </div>
        </div>

        {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}

        {activeJob.notes && (
          <div class="job-call-notes-card">
            <strong>Call Description / Dispatch Notes</strong>
            <p>{activeJob.notes}</p>
          </div>
        )}

        <div class="job-tab-stack">
          <JobExecution
            key={`myday-exec-${activeJob.id}-${rev}`}
            jobId={activeJob.id}
            jobVersion={activeJob.schedule_version}
            equipmentId={activeJob.asset_id}
          />
          <JobEquipment key={`myday-eq-${activeJob.id}`} job={activeJob} />
        </div>
      </div>
    );
  }

  return (
    <div class="page tech-day-page">
      <header class="dispatch-title">
        <div>
          <h1>My Day &amp; Weekly Outlook</h1>
          <p class="workspace-help">
            Field schedule for <strong>{activeTechName}</strong> · Safety / PJSA → Ticket &amp; Billing → Complete Work Order.
          </p>
        </div>
        <div class="btn-row">
          {admin && technicianLookup.length > 0 && (
            <div style={{ minWidth: "200px" }}>
              <Select
                label=""
                value={activeTechId}
                options={technicianLookup.map((t) => ({ value: t.id, label: t.name }))}
                onValueChange={(v) => setActiveTechId(v)}
              />
            </div>
          )}
          <Button variant="primary" onClick={() => navigate("/mobile")}>
            Mobile Field View
          </Button>
          <Button variant="ghost" onClick={() => setRev((r) => r + 1)}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </header>

      {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}

      {!activeTechId && !loading && (
        <EmptyState title="No technician profile linked">
          Ask an administrator to link your user account to a Technician profile in Settings / Technicians to view your daily schedule.
        </EmptyState>
      )}

      {activeTechId && (
        <>
          <div class="project-kpis" style={{ marginBottom: "14px" }}>
            <div class="card">
              <small>{selectedDate === today ? "Today's Jobs" : `Jobs on ${selectedDate}`}</small>
              <strong>{dayJobs.length}</strong>
            </div>
            <div class="card">
              <small>Scheduled Hours</small>
              <strong>{(dayTotalMin / 60).toFixed(1)}h</strong>
            </div>
            <div class="card">
              <small>Completed</small>
              <strong>{dayCompleted} / {dayJobs.length}</strong>
            </div>
            <div class="card">
              <small>This Week</small>
              <strong>{weekTotalJobs} {weekTotalJobs === 1 ? "job" : "jobs"}</strong>
            </div>
          </div>

          {/* 7-Day Weekly Outlook */}
          <section class="tech-week-card">
            <div class="tech-week-header">
              <div class="st-date-nav">
                <button type="button" class="btn-icon" aria-label="Previous week" onClick={() => shiftWeek(-7)}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" class="btn-icon" aria-label="Next week" onClick={() => shiftWeek(7)}>
                  <ChevronRight size={16} />
                </button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setWeekStart(startOfWeekMonday(today));
                    setSelectedDate(today);
                  }}
                >
                  This Week
                </Button>
                <strong style={{ marginLeft: "6px", fontSize: "13px" }}>
                  <CalendarDays size={14} style={{ verticalAlign: "text-bottom", marginRight: "4px" }} />
                  Weekly Outlook ({weekStart} → {addDays(weekStart, 6)})
                </strong>
              </div>
            </div>

            <div class="tech-week-grid">
              {weekDays.map((d) => {
                const isSelected = d.date === selectedDate;
                const isTodayCell = d.date === today;
                return (
                  <button
                    type="button"
                    key={d.date}
                    class={
                      "tech-week-day" +
                      (isSelected ? " is-selected" : "") +
                      (isTodayCell ? " is-today" : "")
                    }
                    onClick={() => setSelectedDate(d.date)}
                  >
                    <div class="tech-week-day-top">
                      <span>{d.weekday}</span>
                      <strong>{d.monthShort} {d.dayNum}</strong>
                    </div>
                    <div class="tech-week-day-meta">
                      <Badge tone={d.jobs.length > 0 ? "info" : "neutral"}>
                        {d.jobs.length} {d.jobs.length === 1 ? "job" : "jobs"}
                      </Badge>
                      <small>{(d.totalMin / 60).toFixed(1)}h</small>
                    </div>
                    {d.jobs.slice(0, 2).map((j) => (
                      <div key={j.id} class="tech-week-mini-pill">
                        {j.scheduled_time} {j.customer_name}
                      </div>
                    ))}
                    {d.jobs.length > 2 && (
                      <small class="text-muted">+{d.jobs.length - 2} more</small>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected Day Overview */}
          <section style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>
                Day Overview —{" "}
                {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </h2>
              {linkedTechId && (
                <Button variant="ghost" onClick={() => navigate("/timesheets")}>
                  Open Timesheets
                </Button>
              )}
            </div>

            {loading ? (
              <p class="text-muted">Loading schedule…</p>
            ) : dayJobs.length === 0 ? (
              <EmptyState title="No jobs scheduled for this day">
                Select another day in your Weekly Outlook above to preview upcoming calls.
              </EmptyState>
            ) : (
              <div class="tech-day-list">
                {dayJobs.map((job) => {
                  const done = job.status === "completed";
                  const inProg = job.status === "in_progress";
                  return (
                    <article key={job.id} class={"tech-day-job-card" + (done ? " is-done" : "")}>
                      <div class="tech-day-job-time">
                        <strong>{job.scheduled_time || "TBD"}</strong>
                        <small>{job.duration} min</small>
                        <StatusBadge status={job.status} />
                      </div>
                      <div class="tech-day-job-body">
                        <div class="tech-day-job-head">
                          <strong>{job.identifier} · {job.customer_name}</strong>
                          <PriorityBadge priority={job.priority} />
                          {job.service_type_name && <Badge>{job.service_type_name}</Badge>}
                        </div>
                        <div class="tech-day-job-meta">
                          {job.address && (
                            <span><MapPin size={12} /> {job.address}</span>
                          )}
                          {job.customer_phone && (
                            <span><Phone size={12} /> {job.customer_phone}</span>
                          )}
                        </div>
                        {job.notes && <p class="tech-day-job-notes">{job.notes}</p>}
                        <div class="tech-day-steps-preview">
                          <span class={inProg || done ? "is-done" : "is-next"}><ShieldCheck size={12} /> 1. Safety / PJSA</span>
                          <span class={done ? "is-done" : inProg ? "is-next" : ""}><ClipboardList size={12} /> 2. Ticket &amp; Billing</span>
                          <span class={done ? "is-done" : ""}><Receipt size={12} /> 3. Complete</span>
                        </div>
                      </div>
                      <div class="tech-day-job-actions">
                        <Button variant={done ? "ghost" : "primary"} onClick={() => setActiveJobId(job.id)}>
                          {done ? (
                            <><CheckCircle2 size={14} /> View Ticket</>
                          ) : inProg ? (
                            "Continue Work Order"
                          ) : (
                            "Start Safety & Ticket"
                          )}
                        </Button>
                        <Button variant="ghost" onClick={() => navigate(`/jobs/${job.id}`)}>
                          Open Full Job
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
