import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  RefreshCw,
  Search,
  X,
  ArrowRight,
  Users,
  AlertTriangle,
} from "lucide-preact";
import { accountRequest, useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Job, Technician } from "../types";
import {
  clockOf,
  minuteOf,
  snapMinute,
  shiftDate,
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
import { Tooltip } from "./ui/tooltip";

type DispatchJob = Job & {
  schedule_version: number;
  equipment_name?: string;
  equipment_serial?: string;
  dispatch_override?: number;
  is_emergency: number;
  work_category: "unspecified" | "on_demand" | "quoted" | "pm";
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
      <p class="workspace-help">
        Times are in {board.timeZone}. Changes save to the work order.
      </p>
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
    [editingResource, setEditingResource] = useState<Resource | null>(null),
    [drag, setDrag] = useState<Drag | null>(null),
    [now, setNow] = useState(new Date());
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
      scroll.current.scrollLeft = 6 * hourWidth;
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
        ? ((e.clientX - track.getBoundingClientRect().left) / hourWidth) * 60 -
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
        ? Math.min(
            1440 - original.duration,
            snapMinute(
              ((e.clientX - track.getBoundingClientRect().left) / hourWidth) *
                60 -
                original.grabOffset,
              snap,
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
      setError(
        "Drop work onto a technician’s time row. No assignment changed.",
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
  return (
    <div class="page dispatcher-page">
      <div class="dispatch-title">
        <div>
          <span class="dispatch-eyebrow">Operations</span>
          <h1>Dispatcher</h1>
          <p>Plan the day. Keep your field team moving.</p>
        </div>
        <Badge
          tone={
            failed ? "danger" : connection === "Live" ? "success" : "warning"
          }
        >
          {failed ? "Updates unavailable" : connection}
        </Badge>
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
      <div class="dispatch-toolbar">
        <p class="workspace-help">
          {board.operatingHours.enabled
            ? board.operatingHours.open
              ? `Service hours: ${clockOf(board.operatingHours.start)}–${board.operatingHours.end === 1440 ? "24:00" : clockOf(board.operatingHours.end)}`
              : "Closed for normal calls"
            : "Company service hours are not enforced"}{" "}
          · {board.operatingHours.label} · {board.timeZone}
        </p>
        {admin && (
          <Button disabled={!canWrite} onClick={() => setHoursOpen(true)}>
            Service hours
          </Button>
        )}
        <Badge
          tone={
            board.jobs.some((j) => j.outside_service_hours)
              ? "warning"
              : "neutral"
          }
        >
          {board.jobs.filter((j) => j.outside_service_hours).length} after-hours
          appointments
        </Badge>
      </div>
      <div class="dispatch-metrics">
        <div>
          <Clock3 size={17} />
          <strong>{(scheduledMinutes / 60).toFixed(1)}h</strong>
          <span>Scheduled · visible active work</span>
        </div>
        <div>
          <Users size={17} />
          <strong>{resources.length}</strong>
          <span>Visible technicians</span>
        </div>
        <div>
          <CalendarDays size={17} />
          <strong>{board.pipelineTotal}</strong>
          <span>Pipeline · current filters</span>
        </div>
        <div>
          <AlertTriangle size={17} />
          <strong>{overlaps.size}</strong>
          <span>Overlapping jobs · visible</span>
        </div>
      </div>
      <div class="dispatch-toolbar">
        <div class="dispatch-date-controls">
          <Button
            size="icon"
            aria-label="Previous day"
            disabled={busy}
            onClick={() => setDate(shiftDate(board.date, -1))}
          >
            <ChevronLeft size={17} />
          </Button>
          <TextField
            label="Dispatch date"
            type="date"
            value={board.date}
            required
            disabled={busy}
            onInput={(e) => {
              if (e.currentTarget.value) setDate(e.currentTarget.value);
            }}
          />
          <Button
            size="icon"
            aria-label="Next day"
            disabled={busy}
            onClick={() => setDate(shiftDate(board.date, 1))}
          >
            <ChevronRight size={17} />
          </Button>
          <Button onClick={() => setDate(dayInZone(board.timeZone))}>
            Today
          </Button>
          <small>{board.timeZone}</small>
        </div>
        <Select
          label="Board view"
          value={view}
          onValueChange={setView}
          options={[
            { value: "gantt", label: "Hourly board" },
            { value: "list", label: "Appointment list" },
          ]}
        />
        <Select
          label="Zoom"
          value={String(hourWidth)}
          onValueChange={(value) => setHourWidth(Number(value))}
          options={[
            { value: "64", label: "Compact" },
            { value: "88", label: "Standard" },
            { value: "128", label: "Detailed" },
          ]}
        />
        <Select
          label="Snap"
          value={String(snap)}
          onValueChange={(value) => setSnap(Number(value))}
          options={[5, 15, 30].map((value) => ({
            value: String(value),
            label: value + " minutes",
          }))}
        />
      </div>
      <div class="dispatch-layout">
        <aside class="dispatch-pipeline">
          <header>
            <h2>Work pipeline</h2>
            <Badge>{board.pipelineTotal}</Badge>
          </header>
          <Input
            aria-label="Search work pipeline"
            placeholder="Job, customer, equipment…"
            value={search}
            onInput={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
          <div class="dispatch-pipeline-filters">
            <Select
              label="Stage"
              value={bucket}
              onValueChange={(value) => {
                setBucket(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "Open & active" },
                { value: "open", label: "Open · scheduled / confirmed" },
                { value: "active", label: "Active · in progress" },
              ]}
            />
            <Select
              label="Assignment"
              value={assignment}
              onValueChange={(value) => {
                setAssignment(value);
                setPage(1);
              }}
              options={[
                { value: "unassigned", label: "Unassigned" },
                { value: "all", label: "All work" },
                { value: "assigned", label: "Assigned" },
              ]}
            />
          </div>
          <div class="dispatch-pipeline-jobs">
            {board.pipeline.map((job) => (
              <article
                key={job.id}
                class="dispatch-pipeline-card"
                onPointerDown={(e) => pointerDown(e, job, "move")}
              >
                <div class="dispatch-job-top">
                  {grip(job)}
                  <strong>{job.identifier}</strong>
                  <Badge
                    tone={
                      job.priority === "urgent"
                        ? "danger"
                        : job.priority === "high"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {job.priority}
                  </Badge>
                </div>
                <h3>{job.customer_name}</h3>
                <p>
                  {job.service_type_name || "Service visit"}
                  {job.equipment_name ? " · " + job.equipment_name : ""}
                </p>
                {job.address && <small>{job.address}</small>}
                <div class="dispatch-job-bottom">
                  <span>
                    {job.duration} min · {statusLabel[job.status]}
                  </span>
                  <Button disabled={!canWrite} onClick={() => setEditing(job)}>
                    {job.technician_id ? "Reschedule" : "Assign"}
                  </Button>
                </div>
                <small>
                  {job.technician_name || "Unassigned"} · {job.scheduled_date}
                </small>
              </article>
            ))}
            {!board.pipeline.length && (
              <EmptyState title="No matching work">
                Try another stage, assignment filter or search.
              </EmptyState>
            )}
          </div>
          <footer>
            <Button
              disabled={page <= 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of{" "}
              {Math.max(1, Math.ceil(board.pipelineTotal / board.pageSize))}
            </span>
            <Button
              disabled={page * board.pageSize >= board.pipelineTotal || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </footer>
        </aside>
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
          </div>
          <p class="dispatch-help">
            Drag a job card to assign or move work; stretch its right edge to
            resize. Use Assign/Edit for keyboard or touch. Completed and
            cancelled jobs are locked.
          </p>
          {view === "gantt" ? (
            <div
              class="dispatch-scroll"
              ref={scroll}
              tabIndex={0}
              aria-label="Hourly technician board. Scroll horizontally for all 24 hours."
            >
              <div
                class="dispatch-hours"
                style={{ width: 200 + hourWidth * 24 }}
              >
                <div class="dispatch-resource-heading">
                  Technician / workload
                </div>
                <div
                  class="dispatch-hour-track"
                  style={{ width: hourWidth * 24 }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div style={{ width: hourWidth }}>{clockOf(hour * 60)}</div>
                  ))}
                </div>
              </div>
              {resources.map((resource) => {
                const jobs = visibleJobs.filter(
                    (job) => job.technician_id === resource.id,
                  ),
                  layout = layoutAppointments(jobs),
                  height = Math.max(92, layout.lanes * 58 + 20),
                  work = jobs
                    .filter(active)
                    .reduce((sum, job) => sum + job.duration, 0);
                return (
                  <div
                    class="dispatch-resource-row"
                    key={resource.id}
                    style={{ width: 200 + hourWidth * 24, height }}
                  >
                    <div class="dispatch-resource-label">
                      <strong>{resource.name}</strong>
                      <small>
                        {(work / 60).toFixed(1)}h scheduled
                        {!resource.active ? " · Inactive" : ""}
                      </small>
                      <small>
                        {resource.availability
                          ? resource.availability.available
                            ? clockOf(resource.availability.start) +
                              "–" +
                              (resource.availability.end === 1440
                                ? "24:00"
                                : clockOf(resource.availability.end))
                            : "Unavailable"
                          : "Availability not declared"}
                      </small>
                      {admin && (
                        <button
                          class="dispatch-resource-edit"
                          onClick={() => setEditingResource(resource)}
                        >
                          Edit resource
                        </button>
                      )}
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
                        width: hourWidth * 24,
                        "--hour-width": hourWidth + "px",
                      }}
                    >
                      {board.operatingHours.enabled &&
                        (!board.operatingHours.open ? (
                          <div
                            class="dispatch-service-closed"
                            style={{ left: 0, width: hourWidth * 24 }}
                            aria-label="Outside company service hours"
                          />
                        ) : (
                          <>
                            <div
                              class="dispatch-service-closed"
                              style={{
                                left: 0,
                                width:
                                  (board.operatingHours.start / 60) * hourWidth,
                              }}
                              aria-label="Before company service hours"
                            />
                            <div
                              class="dispatch-service-closed"
                              style={{
                                left:
                                  (board.operatingHours.end / 60) * hourWidth,
                                width:
                                  ((1440 - board.operatingHours.end) / 60) *
                                  hourWidth,
                              }}
                              aria-label="After company service hours"
                            />
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
                            <div
                              class="dispatch-unavailable"
                              style={{
                                left: 0,
                                width:
                                  (resource.availability.start / 60) *
                                  hourWidth,
                              }}
                            />
                            <div
                              class="dispatch-unavailable"
                              style={{
                                left:
                                  (resource.availability.end / 60) * hourWidth,
                                width:
                                  ((1440 - resource.availability.end) / 60) *
                                  hourWidth,
                              }}
                            />
                          </>
                        ))}
                      {isToday && (
                        <div
                          class="dispatch-now"
                          style={{ left: (currentMinute / 60) * hourWidth }}
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
                              (minuteOf(job.scheduled_time) / 60) * hourWidth,
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
                            top: 10 + lane * 58,
                            "--job-color":
                              job.technician_color || "var(--info)",
                          }}
                          title={`${job.identifier} · ${job.customer_name} · ${job.scheduled_time} · ${job.duration} min`}
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
                                "Edit " +
                                job.identifier +
                                " " +
                                job.customer_name
                              }
                            >
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
                              left: (drag.minute / 60) * hourWidth,
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
                        disabled={!canWrite || !active(job)}
                      >
                        Edit
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
                  disabled={!canWrite || !active(job)}
                  onClick={() => setEditing(job)}
                >
                  Edit assignment
                </Button>
              </article>
            ))}
          </div>
        </section>
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
            busy || user.role === "viewer" || connectivity.readOnly || failed
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
