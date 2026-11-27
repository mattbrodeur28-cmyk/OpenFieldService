import { useApp } from '../context';
import { weekRange } from '../calendar';
import { ScheduleView } from './schedule-view';
import { CreateJob } from './create-job';
import { formatTimestamp } from "../time-format";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  CalendarDays,
  Clock3,
  GripVertical,
  RefreshCw,
  Search,
  X,
  ArrowRight,
  Users,
  AlertTriangle,
  SlidersHorizontal,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-preact";
import { accountRequest, useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Job, Technician } from "../types";
import {
  clockOf,
  minuteOf,
  snapMinute,
  dayInZone,
  layoutAppointments,
  overlapIds,
} from "../dispatch-layout.mjs";
import { Button } from "./ui/button";
import { Input, TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import {
  Badge,
  Notice,
  EmptyState,
  LoadingState,
  Sheet,
  Checkbox,
  Table,
} from "./ui/surfaces";
import { DispatchHours } from "./dispatch-hours";
import { DispatchCallIntake } from "./dispatch-call-intake";
import { DispatchMap } from "./dispatch-map";
import { Tooltip } from "./ui/tooltip";

type DispatchJob = Job & {
  schedule_version: number;
  equipment_name?: string;
  equipment_serial?: string;
  dispatch_override?: number;
  is_emergency: number;
  work_category: "unspecified" | "on_demand" | "quoted" | "pm";
  schedule_kind?: "actual";
  actual_start_at?: string;
  actual_end_at?: string;
  actual_elapsed_minutes?: number;
  actual_segment_minutes?: number;
  actual_worked_minutes?: number;
  actual_break_minutes?: number;
  requested_billable_minutes?: number;
  actual_timeline_approximate?: boolean;
  continues_before?: boolean;
  continues_after?: boolean;
  reportRevision?: number;
  planned_schedule?: {
    date: string;
    time: string;
    duration: number;
    technicianId: string;
  };
  outside_service_hours?: boolean;
};
type Resource = Technician & {
  dispatch_team: string;
  territory: string;
  skills: string[];
  profile_version: number;
  availability: { available: boolean; start: number; end: number } | null;
};
type Board = {
  operatingHours: {
    enabled: boolean;
    version: number;
    open: boolean;
    start: number;
    end: number;
    label: string;
    exception: boolean;
  };
  date: string;
  timeZone: string;
  now: string;
  revision: number;
  resources: Resource[];
  jobs: DispatchJob[];
  pipeline: DispatchJob[];
  pipelineTotal: number;
  page: number;
  pageSize: number;
};
type Drag = {
  job: DispatchJob;
  mode: "move" | "resize";
  x: number;
  y: number;
  originX: number;
  originY: number;
  moved: boolean;
  resourceId: string | null;
  minute: number;
  duration: number;
  grabOffset: number;
};
const statusLabel: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const active = (job: Job) =>
  ["scheduled", "confirmed", "in_progress"].includes(job.status);

function AssignmentForm({
  job,
  board,
  busy,
  save,
  close,
  canOverride,
  error,
}: {
  job: DispatchJob;
  board: Board;
  busy: boolean;
  save(
    job: DispatchJob,
    resourceId: string | null,
    date: string,
    time: string,
    duration: number,
    override?: boolean,
    reason?: string,
    emergency?: boolean,
    workCategory?: string,
  ): Promise<boolean>;
  close(): void;
  canOverride: boolean;
  error: string;
}) {
  const [resource, setResource] = useState(job.technician_id || "unassigned"),
    [date, setDate] = useState(job.scheduled_date),
    [time, setTime] = useState(job.scheduled_time || "09:00"),
    [duration, setDuration] = useState(job.duration),
    [override, setOverride] = useState(false),
    [workCategory, setWorkCategory] = useState(job.work_category),
    [reason, setReason] = useState("");
  if (job.schedule_kind === "actual")
    return (
      <Sheet close={close}>
        <header class="dispatch-sheet-header">
          <div>
            <Badge tone="success">Approved actual · {job.identifier}</Badge>
            <DialogTitle>Actual service visit</DialogTitle>
          </div>
          <Button size="icon" aria-label="Close actual visit" onClick={close}>
            <X size={18} />
          </Button>
        </header>
        <p>
          {job.customer_name} · {job.technician_name}
        </p>
        <section class="sales-details">
          <h3>Approved report · revision {job.reportRevision}</h3>
          <p>
            {formatTimestamp(job.actual_start_at!, board.timeZone)} →{" "}
            {formatTimestamp(job.actual_end_at!, board.timeZone)}
          </p>
          <p>
            {job.actual_elapsed_minutes} elapsed minutes ·{" "}
            {job.actual_worked_minutes} worked labor minutes ·{" "}
            {job.actual_break_minutes} break minutes
          </p>
          <p>
            {job.requested_billable_minutes} requested billable minutes. Billing
            and timesheet approval remain separate.
          </p>
          {(job.continues_before || job.continues_after) && (
            <p>
              This day shows {job.actual_segment_minutes} minutes of the visit;
              the full interval crosses midnight.
            </p>
          )}
          {job.actual_timeline_approximate && (
            <Notice tone="warning">
              This actual visit crosses a clock change. The 24-hour board cannot
              show repeated or skipped clock time exactly; the timestamps and
              elapsed minutes above remain authoritative.
            </Notice>
          )}
        </section>
        <section class="sales-details">
          <h3>Preserved schedule estimate</h3>
          <p>
            {job.planned_schedule?.date} at {job.planned_schedule?.time} ·{" "}
            {job.planned_schedule?.duration} estimated minutes
          </p>
        </section>
        <a href={"/jobs/" + job.id}>Open work order and report</a>
      </Sheet>
    );
  return (
    <Sheet close={close}>
      <header class="dispatch-sheet-header">
        <div>
          <Badge>{job.identifier}</Badge>
          <DialogTitle>Schedule work</DialogTitle>
        </div>
        <Button size="icon" aria-label="Close assignment" onClick={close}>
          <X size={19} />
        </Button>
      </header>
      <p class="workspace-help">
        {job.customer_name}
        {job.equipment_name ? " · " + job.equipment_name : ""}
      </p>
      <p class="workspace-help">Changes save to the work order.</p>
      <form
        class="dispatch-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            job,
            resource === "unassigned" ? null : resource,
            date,
            time,
            duration,
            override,
            reason,
            workCategory === "on_demand",
            workCategory,
          ).then((ok) => {
            if (ok) close();
          });
        }}
      >
        {error && (
          <Notice tone="danger">
            {error}
            <small>
              If this job changed, close and reopen the assignment to review its
              latest version.
            </small>
          </Notice>
        )}
        <Select
          label="Technician"
          value={resource}
          onValueChange={setResource}
          options={[
            { value: "unassigned", label: "Unassigned" },
            ...board.resources.map((item) => ({
              value: item.id,
              label: item.name + (item.active ? "" : " · Inactive"),
              disabled: !item.active,
            })),
          ]}
          disabled={busy}
        />
        <TextField
          label="Date"
          type="date"
          required
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
          disabled={busy}
        />
        <TextField
          label="Start time"
          type="time"
          required
          value={time}
          onInput={(e) => setTime(e.currentTarget.value)}
          disabled={busy}
        />
        <TextField
          label="Estimated slot duration (minutes)"
          type="number"
          min={15}
          max={1440}
          required
          value={duration}
          onInput={(e) => setDuration(Number(e.currentTarget.value))}
          disabled={busy}
        />
        <Select
          label="Work category"
          value={workCategory}
          disabled={busy}
          onValueChange={(v) =>
            setWorkCategory(v as DispatchJob["work_category"])
          }
          options={[
            { value: "unspecified", label: "Unclassified" },
            { value: "on_demand", label: "On-Demand · Emergency / T&M" },
            { value: "quoted", label: "Quoted Work / Project" },
            { value: "pm", label: "PM · Planned Maintenance" },
          ]}
        />
        <p class="workspace-help">
          Normal calls must fit company service hours. After-hours emergencies
          need an administrator override with a reason.
        </p>
        {canOverride && (
          <>
            <Checkbox
              label="Approve emergency hours, overlap or declared availability override"
              checked={override}
              onChange={(e) => setOverride(e.currentTarget.checked)}
              disabled={busy}
            />
            {override && (
              <TextField
                label="Override reason"
                hint="Recorded in the schedule audit. Inactive technicians and closed jobs remain protected."
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onInput={(e) => setReason(e.currentTarget.value)}
                disabled={busy}
              />
            )}
          </>
        )}
        <Button type="submit" variant="primary" disabled={busy || !active(job)}>
          {busy ? "Saving…" : "Save assignment"}
        </Button>
        <a href={"/jobs/" + job.id} class="dispatch-work-link">
          Open work order <ArrowRight size={14} />
        </a>
      </form>
    </Sheet>
  );
}
function ResourceForm({
  resource,
  board,
  busy,
  save,
  close,
  error,
}: {
  resource: Resource;
  board: Board;
  busy: boolean;
  save(resource: Resource, data: unknown): Promise<boolean>;
  close(): void;
  error: string;
}) {
  const [team, setTeam] = useState(resource.dispatch_team),
    [territory, setTerritory] = useState(resource.territory),
    [skills, setSkills] = useState(resource.skills.join(", ")),
    [mode, setMode] = useState(
      resource.availability
        ? resource.availability.available
          ? "window"
          : "unavailable"
        : "unknown",
    ),
    [start, setStart] = useState(clockOf(resource.availability?.start ?? 480)),
    [end, setEnd] = useState(clockOf(resource.availability?.end ?? 1020));
  return (
    <Sheet close={close}>
      <header class="dispatch-sheet-header">
        <div>
          <Badge>Resource</Badge>
          <DialogTitle>{resource.name}</DialogTitle>
        </div>
        <Button
          size="icon"
          aria-label="Close resource settings"
          onClick={close}
        >
          <X size={19} />
        </Button>
      </header>
      <form
        class="dispatch-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(resource, {
            date: board.date,
            expectedVersion: resource.profile_version,
            dispatchTeam: team,
            territory,
            skills: skills
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            availability:
              mode === "unknown"
                ? null
                : {
                    available: mode === "window",
                    start: mode === "window" ? minuteOf(start) : 0,
                    end: mode === "window" ? minuteOf(end) || 1440 : 1440,
                  },
          }).then((ok) => {
            if (ok) close();
          });
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField
          label="Dispatch team / crew"
          value={team}
          maxLength={80}
          onInput={(e) => setTeam(e.currentTarget.value)}
          disabled={busy}
        />
        <TextField
          label="Territory"
          value={territory}
          maxLength={80}
          onInput={(e) => setTerritory(e.currentTarget.value)}
          disabled={busy}
        />
        <TextField
          label="Skills (comma separated)"
          value={skills}
          onInput={(e) => setSkills(e.currentTarget.value)}
          disabled={busy}
        />
        <Select
          label={"Availability · " + board.date}
          value={mode}
          onValueChange={setMode}
          disabled={busy}
          options={[
            { value: "unknown", label: "Not declared" },
            { value: "window", label: "Available in a time window" },
            { value: "unavailable", label: "Unavailable" },
          ]}
        />
        {mode === "window" && (
          <>
            <TextField
              label="Available from"
              type="time"
              required
              value={start}
              onInput={(e) => setStart(e.currentTarget.value)}
              disabled={busy}
            />
            <TextField
              label="Available until"
              hint="00:00 means midnight at the end of this day."
              type="time"
              required
              value={end}
              onInput={(e) => setEnd(e.currentTarget.value)}
              disabled={busy}
            />
          </>
        )}
        <p class="workspace-help">
          Availability applies to this date only. No shifts, travel times or
          breaks are inferred.
        </p>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save resource"}
        </Button>
      </form>
    </Sheet>
  );
}

export function Dispatcher() {
  const [creating,setCreating]=useState(false);
  const {scheduleStart,scheduleEnd,setScheduleRange}=useApp();
  const { user } = useAccount(),
    connectivity = useConnectivity();
  const [board, setBoard] = useState<Board | null>(null),
    [date, setDate] = useState(""),
    [bucket, setBucket] = useState("all"),
    [assignment, setAssignment] = useState("unassigned"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [connection, setConnection] = useState("Connecting"),
    [hourWidth, setHourWidth] = useState(88),
    [snap, setSnap] = useState(15),
    [resourceSearch, setResourceSearch] = useState(""),
    [team, setTeam] = useState("all"),
    [territory, setTerritory] = useState("all"),
    [skill, setSkill] = useState("all"),
    [resourceState, setResourceState] = useState("active"),
    [view, setView] = useState("gantt"),
    [editing, setEditing] = useState<DispatchJob | null>(null),
    [hoursOpen, setHoursOpen] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [pipelineOpen, setPipelineOpen] = useState(true),
    [editingResource, setEditingResource] = useState<Resource | null>(null),
    [drag, setDrag] = useState<Drag | null>(null),
    [now, setNow] = useState(new Date()),
    [businessState, setBusinessState] = useState("CT"),
    [showAllHours, setShowAllHours] = useState(false);
  const viewRangeRef = useRef({ startMin: 420, endMin: 1080 });
  useEffect(() => {
    let active = true;
    accountRequest<{ rows?: { active?: boolean; config?: { state?: string; jurisdiction?: string } }[] }>(
      "/api/sales/billing-profiles?page=1",
    )
      .then((res) => {
        if (!active) return;
        const rows = res?.rows || [];
        const prof = rows.find((r) => r.active && r.config?.state) || rows.find((r) => r.config?.state);
        if (prof?.config?.state) setBusinessState(prof.config.state);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const seq = useRef(0),
    alive = useRef(true),
    scroll = useRef<HTMLDivElement>(null),
    dragRef = useRef<Drag | null>(null),
    refreshRef = useRef<() => Promise<void>>(async () => {}),
    dirty = useRef(false),
    initialScroll = useRef(false),
    suppressClick = useRef(0),
    capture = useRef<HTMLElement | null>(null),
    pointerHandlers = useRef<{
      move: (e: PointerEvent) => void;
      up: (e: PointerEvent) => void;
      cancel: () => void;
    } | null>(null);
  useEffect(()=>{if(date && (date<scheduleStart || date>scheduleEnd))setScheduleRange(...weekRange(new Date(date+"T00:00:00")));},[date,scheduleStart,scheduleEnd]);
  const canWrite =
      user.role !== "viewer" && !connectivity.readOnly && !failed && !busy,
    admin = isAdministrator(user);
  const load = useCallback(async () => {
    const current = ++seq.current;
    try {
      const result = await accountRequest<Board>(
        "/api/dispatch/board?" +
          new URLSearchParams({
            ...(date ? { date } : {}),
            pipeline: bucket,
            assignment,
            search,
            page: String(page),
          }),
      );
      if (!alive.current || current !== seq.current) return;
      setBoard(result);
      if (!date) setDate(result.date);
      setFailed(false);
    } catch (e) {
      if (alive.current && current === seq.current) {
        setError((e as Error).message);
        setFailed(true);
      }
    } finally {
      if (alive.current && current === seq.current) setLoading(false);
    }
  }, [date, bucket, assignment, search, page]);
  refreshRef.current = load;
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      seq.current++;
    };
  }, []);
  useEffect(() => {
    if (!board) return;
    const stream = new EventSource(
      "/api/dispatch/events?after=" + board.revision,
    );
    const refresh = () => {
      if (dragRef.current) dirty.current = true;
      else void refreshRef.current();
    };
    stream.onopen = () => {
      setConnection("Live");
      refresh();
    };
    stream.addEventListener("schedule", refresh);
    stream.onerror = () => {
      setConnection("Reconnecting · polling every 5s");
    };
    const poll = setInterval(() => {
      if (!document.hidden) refresh();
    }, 5000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      stream.close();
      clearInterval(poll);
      clearInterval(clock);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [Boolean(board)]);
  useEffect(() => {
    if (board && scroll.current && !initialScroll.current) {
      scroll.current.scrollLeft = showAllHours ? 6 * hourWidth : 0;
      initialScroll.current = true;
    }
  }, [board]);
  useEffect(() => {
    const move = (e: PointerEvent) => pointerHandlers.current?.move(e),
      up = (e: PointerEvent) => pointerHandlers.current?.up(e),
      cancel = () => pointerHandlers.current?.cancel(),
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancel();
      };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  async function save(
    job: DispatchJob,
    resourceId: string | null,
    nextDate: string,
    time: string,
    duration: number,
    override = false,
    reason = "",
    emergency = Boolean(job.is_emergency),
    workCategory = job.work_category,
  ) {
    if (user.role === "viewer" || connectivity.readOnly || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await accountRequest("/api/dispatch/assignments/" + job.id, "PUT", {
        technicianId: resourceId,
        date: nextDate,
        time,
        duration,
        expectedVersion: job.schedule_version,
        override,
        reason,
        emergency,
        workCategory,
      });
      await refreshRef.current();
      setNotice(job.identifier + " assignment saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      await refreshRef.current();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveResource(resource: Resource, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await accountRequest(
        "/api/dispatch/resources/" + resource.id,
        "PUT",
        data,
      );
      await refreshRef.current();
      setNotice("Resource profile and availability saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      await refreshRef.current();
      return false;
    } finally {
      setBusy(false);
    }
  }
  function pointerDown(
    e: JSX.TargetedPointerEvent<HTMLElement>,
    job: DispatchJob,
    mode: "move" | "resize",
  ) {
    if (!canWrite || !active(job) || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "a,input,select,textarea,button:not(.dispatch-grip):not(.dispatch-appointment-title)",
      )
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    capture.current = e.currentTarget;
    const track = e.currentTarget.closest<HTMLElement>("[data-resource-track]");
    const grabOffset =
      mode === "move" && track
        ? viewRangeRef.current.startMin +
          ((e.clientX - track.getBoundingClientRect().left) / hourWidth) * 60 -
          minuteOf(job.scheduled_time)
        : 0;
    const value: Drag = {
      job,
      mode,
      x: e.clientX,
      y: e.clientY,
      originX: e.clientX,
      originY: e.clientY,
      moved: false,
      resourceId: job.technician_id,
      minute: minuteOf(job.scheduled_time),
      duration: job.duration,
      grabOffset,
    };
    dragRef.current = value;
  }
  function pointerMove(e: JSX.TargetedPointerEvent<HTMLElement>) {
    const original = dragRef.current;
    if (!original) return;
    if (
      !original.moved &&
      Math.hypot(e.clientX - original.originX, e.clientY - original.originY) < 6
    )
      return;
    const track = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-resource-track]");
    if (scroll.current && original.mode === "move") {
      const rect = scroll.current.getBoundingClientRect();
      if (e.clientX > rect.right - 35) scroll.current.scrollLeft += 18;
      else if (e.clientX < rect.left + 235) scroll.current.scrollLeft -= 18;
    }
    const value = {
      ...original,
      moved: true,
      x: e.clientX,
      y: e.clientY,
      resourceId: track?.dataset.resourceTrack || null,
      minute: track
        ? Math.max(
            viewRangeRef.current.startMin,
            Math.min(
              viewRangeRef.current.endMin - original.duration,
              snapMinute(
                viewRangeRef.current.startMin +
                  ((e.clientX - track.getBoundingClientRect().left) / hourWidth) *
                    60 -
                  original.grabOffset,
                snap,
              ),
            ),
          )
        : original.minute,
      duration:
        original.mode === "resize"
          ? Math.min(
              1440 - minuteOf(original.job.scheduled_time),
              Math.max(
                15,
                Math.round(
                  (original.job.duration +
                    ((e.clientX - original.originX) / hourWidth) * 60) /
                    snap,
                ) * snap,
              ),
            )
          : original.duration,
    };
    dragRef.current = value;
    setDrag(value);
  }
  function pointerUp(e: JSX.TargetedPointerEvent<HTMLElement>) {
    pointerMove(e);
    const value = dragRef.current;
    if (!value) return;
    dragRef.current = null;
    setDrag(null);
    if (capture.current?.hasPointerCapture(e.pointerId))
      capture.current.releasePointerCapture(e.pointerId);
    capture.current = null;
    if (!value.moved) {
      setEditing(value.job);
      return;
    }
    suppressClick.current = Date.now() + 600;
    const resourceId =
      value.mode === "resize" ? value.job.technician_id : value.resourceId;
    if (!resourceId) {
      const overPipeline =
        value.mode === "move" &&
        !!value.job.technician_id &&
        document
          .elementsFromPoint(e.clientX, e.clientY)
          .some((el) => !!el.closest("#dispatch-work-pipeline"));
      if (overPipeline) {
        dirty.current = false;
        void save(
          value.job,
          null,
          value.job.scheduled_date,
          value.job.scheduled_time,
          value.job.duration,
        );
        return;
      }
      setError(
        "Drop work onto a technician’s time row, or onto the Work Pipeline to unassign.",
      );
      if (dirty.current) {
        dirty.current = false;
        void refreshRef.current();
      }
      return;
    }
    dirty.current = false;
    void save(
      value.job,
      resourceId,
      board!.date,
      value.mode === "resize"
        ? value.job.scheduled_time
        : clockOf(value.minute),
      value.duration,
    );
  }
  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
    if (dirty.current) {
      dirty.current = false;
      void refreshRef.current();
    }
  }
  function grip(job: DispatchJob, mode: "move" | "resize" = "move") {
    return (
      <Button
        size="icon"
        variant="ghost"
        class={"dispatch-grip " + (mode === "resize" ? "dispatch-resize" : "")}
        aria-label={(mode === "resize" ? "Resize " : "Drag ") + job.identifier}
        disabled={!canWrite || !active(job)}
        onPointerDown={(e) => pointerDown(e, job, mode)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(job);
          }
          if (e.key === "Escape") cancelDrag();
        }}
      >
        {mode === "resize" ? (
          <span aria-hidden="true">↔</span>
        ) : (
          <GripVertical size={15} />
        )}
      </Button>
    );
  }
  pointerHandlers.current = {
    move: (e) =>
      pointerMove(e as unknown as JSX.TargetedPointerEvent<HTMLElement>),
    up: (e) => pointerUp(e as unknown as JSX.TargetedPointerEvent<HTMLElement>),
    cancel: cancelDrag,
  };
  if (!board)
    return (
      <div class="page">
        <h1>Dispatcher</h1>
        {error ? (
          <Notice tone="danger">
            {error}
            <Button onClick={() => void load()}>Retry</Button>
          </Notice>
        ) : (
          <LoadingState label="Loading dispatch board…" />
        )}
      </div>
    );
  const resources = board.resources.filter(
    (item) =>
      (resourceState === "all" || Boolean(item.active)) &&
      (team === "all" || "value:" + item.dispatch_team === team) &&
      (territory === "all" || "value:" + item.territory === territory) &&
      (skill === "all" ||
        item.skills.some((value) => "value:" + value === skill)) &&
      item.name
        .toLocaleLowerCase()
        .includes(resourceSearch.toLocaleLowerCase()),
  );
  const resourceIds = new Set(resources.map((item) => item.id)),
    visibleJobs = board.jobs.filter((job) =>
      resourceIds.has(job.technician_id!),
    ),
    activeJobs = visibleJobs.filter(active),
    overlaps = overlapIds(activeJobs),
    scheduledMinutes = activeJobs.reduce((sum, job) => sum + job.duration, 0);
  const options = (key: "dispatch_team" | "territory") => [
    {
      value: "all",
      label: "All " + (key === "dispatch_team" ? "teams" : "territories"),
    },
    ...[...new Set(board.resources.map((item) => item[key]).filter(Boolean))]
      .sort()
      .map((value) => ({ value: "value:" + value, label: value })),
  ];
  const currentParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: board.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const currentMinute =
      Number(currentParts.hour) * 60 + Number(currentParts.minute),
    isToday = board.date === dayInZone(board.timeZone, now);
  const viewStartHour = showAllHours
    ? 0
    : board.operatingHours.enabled && board.operatingHours.open
      ? Math.max(0, Math.floor(board.operatingHours.start / 60))
      : 7;
  const viewEndHour = showAllHours
    ? 24
    : board.operatingHours.enabled && board.operatingHours.open
      ? Math.min(24, Math.max(viewStartHour + 1, Math.ceil(board.operatingHours.end / 60)))
      : 18;
  const viewStartMin = viewStartHour * 60,
    viewEndMin = viewEndHour * 60,
    viewHours = Math.max(1, viewEndHour - viewStartHour);
  viewRangeRef.current = { startMin: viewStartMin, endMin: viewEndMin };
  const mapJobs = (() => {
    const byId = new Map<string, DispatchJob>();
    for (const j of [...visibleJobs, ...board.pipeline]) {
      if (active(j)) byId.set(j.id, j);
    }
    return [...byId.values()];
  })();
  return (
    <div class="page dispatcher-page">
      {creating && <CreateJob initialDate={board.date} onClose={()=>setCreating(false)} onCreated={job=>{if(job.scheduled_date!==date)setDate(job.scheduled_date);else void load();}}/>}
      <div class="dispatch-title">
        <div>
          <h1>Dispatch Board</h1>
        </div>
        <div class="dispatch-metrics">
          <div>
            <Clock3 size={17} />
            <strong>{(scheduledMinutes / 60).toFixed(1)}h</strong>
            <span>scheduled</span>
          </div>
          <div>
            <Users size={17} />
            <strong>{resources.length}</strong>
            <span>technicians</span>
          </div>
          <div>
            <CalendarDays size={17} />
            <strong>{board.pipelineTotal}</strong>
            <span>in pipeline</span>
          </div>
          <div>
            <AlertTriangle size={17} />
            <strong>{overlaps.size}</strong>
            <span>overlapping</span>
          </div>
        </div>
        {board.jobs.some((j) => j.outside_service_hours) && (
          <Badge tone="warning">
            {board.jobs.filter((j) => j.outside_service_hours).length} after-hours
          </Badge>
        )}
        <Badge
          tone={
            failed ? "danger" : connection === "Live" ? "success" : "warning"
          }
        >
          {failed ? "Updates unavailable" : connection}
        </Badge>
        {admin && (
          <Tooltip label={board.operatingHours.enabled ? `Service hours: ${clockOf(board.operatingHours.start)}–${board.operatingHours.end === 1440 ? "24:00" : clockOf(board.operatingHours.end)}` : "Configure company service hours"}>
            <Button
              variant="ghost"
              disabled={!canWrite}
              onClick={() => setHoursOpen(true)}
            >
              <Clock3 size={14} /> Service hours
            </Button>
          </Tooltip>
        )}
        <Tooltip label="Refresh the current board">
          <Button
            aria-label="Refresh dispatch board"
            size="icon"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={17} />
          </Button>
        </Tooltip>
      </div>
      {error && (
        <Notice tone="danger" close={() => setError("")}>
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      {(connectivity.readOnly || failed) && (
        <Notice tone="warning">
          Schedule changes are disabled until live access returns.
        </Notice>
      )}
      <DispatchCallIntake canWrite={canWrite} onDispatched={() => void load()} />
      <div class="st-dispatch-shell">
        <div class="st-dispatch-main">
        <div class="st-date-bar">
          <div class="st-date-nav">
            <button
              type="button"
              class="btn-icon"
              aria-label="Previous day"
              onClick={() => {
                const d = new Date(date + "T12:00:00Z");
                d.setUTCDate(d.getUTCDate() - 1);
                setDate(d.toISOString().slice(0, 10));
                setPage(1);
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              class="btn-icon"
              aria-label="Next day"
              onClick={() => {
                const d = new Date(date + "T12:00:00Z");
                d.setUTCDate(d.getUTCDate() + 1);
                setDate(d.toISOString().slice(0, 10));
                setPage(1);
              }}
            >
              <ChevronRight size={16} />
            </button>
            <Button
              variant="ghost"
              onClick={() => {
                setDate(dayInZone(board.timeZone, new Date()));
                setPage(1);
              }}
            >
              Today
            </Button>
            <strong class="st-date-label">
              {new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </strong>
          </div>
          <input
            type="date"
            class="st-date-input"
            aria-label="Jump to date"
            value={date}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (v) { setDate(v); setPage(1); }
            }}
          />
        </div>
        <section class="dispatch-board" aria-label="Technician schedule">
          <div class="dispatch-resource-filters">
            <label class="dispatch-resource-search">
              <Search size={15} />
              <Input
                aria-label="Search technicians"
                placeholder="Find a technician…"
                value={resourceSearch}
                onInput={(e) => setResourceSearch(e.currentTarget.value)}
              />
            </label>
            <Select
              label="Resources"
              value={resourceState}
              onValueChange={setResourceState}
              options={[
                { value: "active", label: "Active technicians" },
                { value: "all", label: "All technicians" },
              ]}
            />
            <Button
              aria-expanded={filtersOpen}
              aria-controls="dispatch-advanced-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={15} /> Filters
              {[team, territory, skill].filter((v) => v !== "all").length
                ? ` (${[team, territory, skill].filter((v) => v !== "all").length})`
                : ""}
            </Button>
            <Button
              variant="ghost"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowAllHours((v) => !v)}
            >
              <Clock3 size={14} />{" "}
              {showAllHours
                ? "Hide after-hours"
                : `Show 24h (${clockOf(viewStartMin)}–${viewEndMin === 1440 ? "24:00" : clockOf(viewEndMin)})`}
            </Button>
          </div>
          <div
            id="dispatch-advanced-filters"
            class="dispatch-advanced-filters"
            hidden={!filtersOpen}
          >
            <Select
              label="Team / crew"
              value={team}
              onValueChange={setTeam}
              options={options("dispatch_team")}
            />
            <Select
              label="Territory"
              value={territory}
              onValueChange={setTerritory}
              options={options("territory")}
            />
            <Select
              label="Skill"
              value={skill}
              onValueChange={setSkill}
              options={[
                { value: "all", label: "All skills" },
                ...[...new Set(board.resources.flatMap((item) => item.skills))]
                  .sort()
                  .map((value) => ({ value: "value:" + value, label: value })),
              ]}
            />
            <Button
              onClick={() => {
                setTeam("all");
                setTerritory("all");
                setSkill("all");
              }}
            >
              Clear filters
            </Button>
          </div>
          {view === "gantt" ? (
            <div
              class="dispatch-scroll"
              ref={scroll}
              tabIndex={0}
              aria-label="Hourly technician board. Scroll horizontally for all 24 hours."
            >
              <div
                class="dispatch-hours"
                style={{ width: 200 + hourWidth * viewHours }}
              >
                <div class="dispatch-resource-heading">
                  Technician / workload
                </div>
                <div
                  class="dispatch-hour-track"
                  style={{ width: hourWidth * viewHours }}
                >
                  {Array.from({ length: viewHours }, (_, idx) => {
                    const hour = viewStartHour + idx;
                    return (
                      <div key={hour} style={{ width: hourWidth }}>
                        {clockOf(hour * 60)}
                      </div>
                    );
                  })}
                </div>
              </div>
              {resources.map((resource) => {
                const jobs = visibleJobs.filter((job) => {
                    if (job.technician_id !== resource.id) return false;
                    if (showAllHours) return true;
                    const start = minuteOf(job.scheduled_time);
                    return start + job.duration > viewStartMin && start < viewEndMin;
                  }),
                  layout = layoutAppointments(jobs),
                  height = Math.max(80, layout.lanes * 58 + 20),
                  work = visibleJobs
                    .filter((job) => job.technician_id === resource.id && active(job))
                    .reduce((sum, job) => sum + job.duration, 0);
                return (
                  <div
                    class="dispatch-resource-row"
                    key={resource.id}
                    style={{ width: 200 + hourWidth * viewHours, height: Math.max(58, layout.lanes * 44 + 14) }}
                  >
                    <div class="dispatch-resource-label st-tech-label">
                      <span class="st-tech-avatar" style={{ background: resource.color || "#3b82f6" }}>
                        {resource.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                      <div class="st-tech-meta">
                        <div class="st-tech-name-row">
                          <strong>{resource.name}</strong>
                          <span class={"st-tech-dot " + (resource.active ? "is-online" : "is-offline")} />
                        </div>
                        <small>
                          {Math.floor(work / 60)}h {work % 60}m
                          {!resource.active ? " · Inactive" : ""}
                        </small>
                        {admin && (
                          <button
                            class="dispatch-resource-edit"
                            onClick={() => setEditingResource(resource)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      data-resource-track={resource.id}
                      class={
                        "dispatch-track " +
                        (drag?.resourceId === resource.id
                          ? "dispatch-drop-target"
                          : "")
                      }
                      style={{
                        width: hourWidth * viewHours,
                        "--hour-width": hourWidth + "px",
                      }}
                    >
                      {board.operatingHours.enabled &&
                        (!board.operatingHours.open ? (
                          <div
                            class="dispatch-service-closed"
                            style={{ left: 0, width: hourWidth * viewHours }}
                            aria-label="Outside company service hours"
                          />
                        ) : (
                          <>
                            {board.operatingHours.start > viewStartMin && (
                              <div
                                class="dispatch-service-closed"
                                style={{
                                  left: 0,
                                  width:
                                    ((Math.min(board.operatingHours.start, viewEndMin) - viewStartMin) / 60) *
                                    hourWidth,
                                }}
                                aria-label="Before company service hours"
                              />
                            )}
                            {board.operatingHours.end < viewEndMin && (
                              <div
                                class="dispatch-service-closed"
                                style={{
                                  left:
                                    ((Math.max(board.operatingHours.end, viewStartMin) - viewStartMin) / 60) *
                                    hourWidth,
                                  width:
                                    ((viewEndMin - Math.max(board.operatingHours.end, viewStartMin)) / 60) *
                                    hourWidth,
                                }}
                                aria-label="After company service hours"
                              />
                            )}
                          </>
                        ))}
                      {resource.availability &&
                        (!resource.availability.available ? (
                          <div
                            class="dispatch-unavailable"
                            style={{ left: 0, width: "100%" }}
                          />
                        ) : (
                          <>
                            {resource.availability.start > viewStartMin && (
                              <div
                                class="dispatch-unavailable"
                                style={{
                                  left: 0,
                                  width:
                                    ((Math.min(resource.availability.start, viewEndMin) - viewStartMin) / 60) *
                                    hourWidth,
                                }}
                              />
                            )}
                            {resource.availability.end < viewEndMin && (
                              <div
                                class="dispatch-unavailable"
                                style={{
                                  left:
                                    ((Math.max(resource.availability.end, viewStartMin) - viewStartMin) / 60) *
                                    hourWidth,
                                  width:
                                    ((viewEndMin - Math.max(resource.availability.end, viewStartMin)) / 60) *
                                    hourWidth,
                                }}
                              />
                            )}
                          </>
                        ))}
                      {isToday && currentMinute >= viewStartMin && currentMinute <= viewEndMin && (
                        <div
                          class="dispatch-now"
                          style={{ left: ((currentMinute - viewStartMin) / 60) * hourWidth }}
                          aria-label="Current time"
                        />
                      )}
                      {layout.items.map(({ job, lane }) => (
                        <article
                          key={job.id}
                          onPointerDown={(e) => pointerDown(e, job, "move")}
                          class={`dispatch-appointment ${drag?.moved && drag.job.id === job.id ? "is-dragging" : ""} status-${job.status} ${overlaps.has(job.id) ? "has-overlap" : ""}`}
                          style={{
                            left:
                              ((minuteOf(job.scheduled_time) - viewStartMin) / 60) * hourWidth,
                            width: Math.max(
                              30,
                              ((drag?.job.id === job.id &&
                              drag.mode === "resize"
                                ? drag.duration
                                : job.duration) /
                                60) *
                                hourWidth -
                                3,
                            ),
                            top: 8 + lane * 42,
                            "--job-color":
                              job.technician_color || "var(--info)",
                          }}
                          title={`${job.identifier} · ${job.customer_name} · ${job.scheduled_time} · ${job.duration} ${job.schedule_kind === "actual" ? "actual display" : "estimated"} min${job.actual_timeline_approximate ? " · DST: see actual timestamps" : ""}`}
                        >
                          <div>
                            {grip(job)}
                            <button
                              class="dispatch-appointment-title"
                              onClick={() => {
                                if (Date.now() > suppressClick.current)
                                  setEditing(job);
                              }}
                              aria-label={
                                (job.schedule_kind === "actual"
                                  ? "View actual "
                                  : "Edit ") +
                                job.identifier +
                                " " +
                                job.customer_name
                              }
                            >
                              {job.schedule_kind === "actual"
                                ? "Actual · "
                                : ""}
                              {job.work_category === "pm"
                                ? "PM · "
                                : job.work_category === "quoted"
                                  ? "Quoted · "
                                  : ""}
                              {job.is_emergency ? "On-Demand · " : ""}
                              {job.outside_service_hours
                                ? "After hours · "
                                : ""}
                              {job.identifier} · {job.customer_name}
                              <small>
                                {job.scheduled_time}–
                                {clockOf(
                                  minuteOf(job.scheduled_time) +
                                    (drag?.job.id === job.id &&
                                    drag.mode === "resize"
                                      ? drag.duration
                                      : job.duration),
                                )}{" "}
                                ·{" "}
                                {drag?.job.id === job.id &&
                                drag.mode === "resize"
                                  ? drag.duration
                                  : job.duration}
                                m
                              </small>
                            </button>
                            {canWrite && !["completed", "cancelled"].includes(job.status) && job.technician_id && (
                              <button
                                type="button"
                                class="btn-icon"
                                title="Return to Work Pipeline (unassign)"
                                aria-label={`Return ${job.identifier} to Work Pipeline`}
                                onPointerDown={(ev) => ev.stopPropagation()}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  void save(
                                    job,
                                    null,
                                    job.scheduled_date,
                                    job.scheduled_time,
                                    job.duration,
                                  );
                                }}
                              >
                                <PanelLeft size={12} />
                              </button>
                            )}
                            {grip(job, "resize")}
                          </div>
                          {overlaps.has(job.id) && (
                            <span
                              class="dispatch-overlap-mark"
                              aria-label="Overlapping work"
                            >
                              !
                            </span>
                          )}
                        </article>
                      ))}
                      {drag?.resourceId === resource.id &&
                        drag.mode === "move" && (
                          <div
                            class="dispatch-drop-preview"
                            style={{
                              left: ((drag.minute - viewStartMin) / 60) * hourWidth,
                              width: (drag.duration / 60) * hourWidth,
                            }}
                          >
                            <strong>{drag.job.identifier}</strong>
                            <small>
                              {clockOf(drag.minute)}–
                              {clockOf(drag.minute + drag.duration)} ·{" "}
                              {drag.duration}m
                            </small>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
              {!resources.length && (
                <EmptyState title="No matching technicians">
                  Add technicians or adjust the resource filters.
                </EmptyState>
              )}
            </div>
          ) : (
            <Table label="Dispatch appointments">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Job / customer</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.technician_name}</td>
                    <td>
                      {job.identifier}
                      <br />
                      {job.customer_name}
                    </td>
                    <td>{job.scheduled_time}</td>
                    <td>{job.duration} min</td>
                    <td>
                      {statusLabel[job.status]}
                      {overlaps.has(job.id) && " · Overlap"}
                    </td>
                    <td>
                      <Button
                        onClick={() => setEditing(job)}
                        disabled={
                          job.schedule_kind !== "actual" &&
                          (!canWrite || !active(job))
                        }
                      >
                        {job.schedule_kind === "actual"
                          ? "View actual"
                          : "Edit"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div class="dispatch-mobile-list">
            <h3>Appointments · {board.date}</h3>
            {visibleJobs.map((job) => (
              <article key={job.id}>
                <strong>
                  {job.scheduled_time} · {job.technician_name}
                </strong>
                <span>
                  {job.identifier} · {job.customer_name}
                </span>
                <Button
                  disabled={
                    job.schedule_kind !== "actual" &&
                    (!canWrite || !active(job))
                  }
                  onClick={() => setEditing(job)}
                >
                  {job.schedule_kind === "actual"
                    ? "View actual"
                    : "Edit assignment"}
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section
          id="dispatch-work-pipeline"
          class="st-pipeline-panel"
          hidden={!pipelineOpen}
        >
          <div class="st-pipeline-bar">
            <div class="st-pipeline-tabs" role="tablist" aria-label="Work pipeline filter">
              <button
                type="button"
                role="tab"
                aria-selected={assignment === "unassigned" && bucket === "all"}
                class={"st-pill-tab" + (assignment === "unassigned" && bucket === "all" ? " is-active" : "")}
                onClick={() => { setAssignment("unassigned"); setBucket("all"); setPage(1); }}
              >
                Unassigned <span class="st-pill-count">{board.pipelineTotal} jobs</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bucket === "open" && assignment === "all"}
                class={"st-pill-tab" + (bucket === "open" && assignment === "all" ? " is-active" : "")}
                onClick={() => { setAssignment("all"); setBucket("open"); setPage(1); }}
              >
                Scheduled
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bucket === "active" && assignment === "all"}
                class={"st-pill-tab" + (bucket === "active" && assignment === "all" ? " is-active" : "")}
                onClick={() => { setAssignment("all"); setBucket("active"); setPage(1); }}
              >
                Working
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignment === "assigned" && bucket === "all"}
                class={"st-pill-tab" + (assignment === "assigned" && bucket === "all" ? " is-active" : "")}
                onClick={() => { setAssignment("assigned"); setBucket("all"); setPage(1); }}
              >
                Assigned
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignment === "all" && bucket === "all"}
                class={"st-pill-tab" + (assignment === "all" && bucket === "all" ? " is-active" : "")}
                onClick={() => { setAssignment("all"); setBucket("all"); setPage(1); }}
              >
                All Work
              </button>
            </div>
            <div class="st-pipeline-search">
              <Input
                aria-label="Search work pipeline"
                placeholder="Search job, customer, address…"
                value={search}
                onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
              />
            </div>
          </div>

          <div class="table-scroll">
            <table class="table st-pipeline-table">
              <thead>
                <tr>
                  <th>Status / Tags</th>
                  <th>Date</th>
                  <th>Type / ID</th>
                  <th>Start</th>
                  <th>Technician</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {board.pipeline.map((job) => (
                  <tr
                    key={job.id}
                    class="st-pipeline-row"
                    onPointerDown={(e) => pointerDown(e, job, "move")}
                  >
                    <td>
                      <div class="btn-row">
                        {grip(job)}
                        <Badge tone={job.priority === "urgent" ? "danger" : job.priority === "high" ? "warning" : "neutral"}>
                          {job.technician_id ? statusLabel[job.status] : "Unassigned"}
                        </Badge>
                      </div>
                    </td>
                    <td class="text-muted">{job.scheduled_date}</td>
                    <td><strong>{job.service_type_name || "Service"}</strong> <span class="text-muted">#{job.identifier}</span></td>
                    <td class="text-muted">{job.scheduled_time || "—"} ({job.duration}m)</td>
                    <td>{job.technician_name || <span class="text-muted">Unassigned</span>}</td>
                    <td><strong>{job.customer_name}</strong></td>
                    <td class="text-muted">{job.address || "—"}</td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={!canWrite}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setEditing(job)}
                      >
                        {job.technician_id ? "Reschedule" : "Assign"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!board.pipeline.length && (
              <EmptyState title="No matching work">
                Drag an assigned job here from the board to unassign it, or try another filter.
              </EmptyState>
            )}
          </div>

          {(board.pipelineTotal > board.pageSize || page > 1) && (
            <div class="st-pipeline-pager">
              <Button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Previous</Button>
              <span class="text-muted">Page {page} of {Math.max(1, Math.ceil(board.pipelineTotal / board.pageSize))}</span>
              <Button disabled={page * board.pageSize >= board.pipelineTotal || busy} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </section>

        <DispatchMap
          stateCode={businessState}
          jobs={mapJobs}
          onSelectJob={(jobId) => {
            const target = mapJobs.find((j) => j.id === jobId);
            if (target) setEditing(target);
          }}
        />
        </div>

        <aside class="st-messages-rail" aria-label="Dispatch activity feed">
          <div class="st-messages-header">
            <strong>Messages</strong>
            <small>Live dispatch &amp; technician status updates for {board.date}.</small>
          </div>
          <div class="st-messages-list">
            {visibleJobs.slice(0, 12).map((job) => (
              <article
                key={job.id}
                class="st-message-item"
                onClick={() => setEditing(job)}
              >
                <strong>{job.technician_name || "Unassigned"}:</strong>
                <p>
                  {statusLabel[job.status]} Job #{job.identifier} — {job.customer_name}
                  {job.scheduled_time ? ` (${job.scheduled_time})` : ""}
                </p>
              </article>
            ))}
            {!visibleJobs.length && (
              <p class="text-muted" style={{ padding: "12px" }}>No technician updates for this date yet.</p>
            )}
          </div>
        </aside>
      </div>
      {hoursOpen && (
        <DispatchHours
          disabled={!canWrite}
          close={() => setHoursOpen(false)}
          saved={async () => {
            await refreshRef.current();
            setNotice(
              "Service hours saved. Existing appointments retained; review after-hours warnings.",
            );
          }}
        />
      )}
      {editing && (
        <AssignmentForm
          key={editing.id}
          job={editing}
          board={board}
          error={error}
          busy={
            busy ||
            user.role === "viewer" ||
            connectivity.readOnly ||
            failed ||
            (!active(editing) && editing.schedule_kind !== "actual")
          }
          save={save}
          canOverride={admin}
          close={() => setEditing(null)}
        />
      )}
      {editingResource && (
        <ResourceForm
          key={editingResource.id}
          resource={editingResource}
          board={board}
          error={error}
          busy={busy || connectivity.readOnly || failed}
          save={saveResource}
          close={() => setEditingResource(null)}
        />
      )}
      {drag && (
        <div
          class="dispatch-drag-ghost"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          {drag.job.identifier} · {clockOf(drag.minute)}–
          {clockOf(drag.minute + drag.duration)} · {drag.duration} min
          <small>
            {drag.resourceId
              ? board.resources.find((item) => item.id === drag.resourceId)
                  ?.name
              : "Drop on a technician row"}
          </small>
        </div>
      )}
    </div>
  );
}
