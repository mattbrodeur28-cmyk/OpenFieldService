import { useRef, useState } from "preact/hooks";
import { ChevronLeft, ChevronRight, Plus, Receipt, Edit3 } from "lucide-preact";
import { Button } from "../ui/button";
import { Badge } from "../ui/surfaces";

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type ZoomLevel = "day" | "week" | "month" | "quarter";
const ZOOM_PX: Record<ZoomLevel, number> = { day: 36, week: 16, month: 6, quarter: 2.5 };
const ZOOM_LABELS: { id: ZoomLevel; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
];

const parseYmd = (value?: string | null): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const fmtShort = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const fmtFull = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const money = (cents: number) => "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DragMode = "move" | "resize-start" | "resize-end";
type DragState = {
  phase: any;
  mode: DragMode;
  startX: number;
  origStart: Date;
  origEnd: Date;
  deltaDays: number;
  moved: boolean;
};

export function ProjectGantt({
  phases,
  milestones,
  sovLines = [],
  canWrite = false,
  onAddPhase,
  onEditPhase,
  onUpdatePhaseDates,
  onBillPhase,
}: {
  phases: any[];
  milestones: any[];
  sovLines?: any[];
  canWrite?: boolean;
  onAddPhase?: () => void;
  onEditPhase?: (phase: any) => void;
  onUpdatePhaseDates?: (phase: any, plannedStart: string, plannedEnd: string) => Promise<void>;
  onBillPhase?: (phase: any, existingSov: any | null) => void;
}) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [shiftDays, setShiftDays] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const todayUtc = parseYmd(new Date().toISOString().slice(0, 10))!;
  const points = [
    ...phases.flatMap((p) => [parseYmd(p.plannedStart), parseYmd(p.plannedEnd)]),
    ...milestones.map((m) => parseYmd(m.dueDate)),
  ].filter((d): d is Date => !!d);

  const hasTimeline = points.length > 0;
  const baseMin = hasTimeline ? new Date(Math.min(...points.map((d) => d.getTime()))) : todayUtc;
  const baseMax = hasTimeline ? new Date(Math.max(...points.map((d) => d.getTime()))) : addDays(todayUtc, 45);
  const padDays = zoom === "day" ? 7 : zoom === "week" ? 14 : zoom === "month" ? 30 : 45;
  const start = addDays(baseMin, -padDays + shiftDays);
  const minSpan = zoom === "day" ? 30 : zoom === "week" ? 60 : zoom === "month" ? 150 : 270;
  const rawEnd = addDays(baseMax, padDays + shiftDays);
  const totalDays = Math.max(minSpan, diffDays(start, rawEnd));
  const end = addDays(start, totalDays);
  const pxPerDay = ZOOM_PX[zoom];
  const timelineWidth = Math.max(520, Math.round(totalDays * pxPerDay));

  const xFor = (d: Date) => diffDays(start, d) * pxPerDay;

  // Build header ticks based on zoom scale
  const ticks: { label: string; left: number }[] = [];
  if (zoom === "day") {
    for (let i = 0; i <= totalDays; i += 2) {
      const d = addDays(start, i);
      ticks.push({ label: fmtShort(d), left: i * pxPerDay });
    }
  } else if (zoom === "week") {
    const first = new Date(start.getTime());
    const dow = first.getUTCDay();
    const offset = dow === 1 ? 0 : (8 - dow) % 7;
    for (let i = offset; i <= totalDays; i += 7) {
      const d = addDays(start, i);
      ticks.push({ label: fmtShort(d), left: i * pxPerDay });
    }
  } else {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      const x = xFor(cursor);
      if (x >= 0) ticks.push({ label: `${MONTHS[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`, left: x });
      cursor.setUTCMonth(cursor.getUTCMonth() + (zoom === "quarter" ? 2 : 1));
    }
  }

  const todayX = xFor(todayUtc);
  const showToday = todayX >= 0 && todayX <= timelineWidth;

  function jumpToday() {
    setShiftDays(0);
    requestAnimationFrame(() => {
      if (scrollRef.current && showToday) {
        scrollRef.current.scrollLeft = Math.max(0, todayX - scrollRef.current.clientWidth / 3);
      }
    });
  }

  function startDrag(e: PointerEvent, phase: any, mode: DragMode) {
    if (!canWrite || !onUpdatePhaseDates || e.button !== 0) return;
    const origStart = parseYmd(phase.plannedStart);
    const origEnd = parseYmd(phase.plannedEnd) || origStart;
    if (!origStart || !origEnd) return;
    e.stopPropagation();
    e.preventDefault();
    const initial: DragState = { phase, mode, startX: e.clientX, origStart, origEnd, deltaDays: 0, moved: false };
    setDrag(initial);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - initial.startX;
      const deltaDays = Math.round(dx / pxPerDay);
      setDrag((curr) => curr ? { ...curr, deltaDays, moved: curr.moved || Math.abs(dx) > 4 } : null);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - initial.startX;
      const deltaDays = Math.round(dx / pxPerDay);
      const moved = Math.abs(dx) > 4;
      setDrag(null);
      if (!moved) {
        if (mode === "move") onEditPhase?.(phase);
        return;
      }
      if (deltaDays === 0) return;
      let nextStart = origStart;
      let nextEnd = origEnd;
      if (mode === "move") {
        nextStart = addDays(origStart, deltaDays);
        nextEnd = addDays(origEnd, deltaDays);
      } else if (mode === "resize-start") {
        nextStart = addDays(origStart, deltaDays);
        if (nextStart.getTime() > origEnd.getTime()) nextStart = origEnd;
      } else if (mode === "resize-end") {
        nextEnd = addDays(origEnd, deltaDays);
        if (nextEnd.getTime() < origStart.getTime()) nextEnd = origStart;
      }
      setSavingId(phase.id);
      void onUpdatePhaseDates(phase, toYmd(nextStart), toYmd(nextEnd)).finally(() => setSavingId(null));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function effectiveDates(phase: any): { s: Date | null; e: Date | null } {
    const origStart = parseYmd(phase.plannedStart);
    const origEnd = parseYmd(phase.plannedEnd) || origStart;
    if (!origStart || !origEnd) return { s: null, e: null };
    if (!drag || drag.phase.id !== phase.id) return { s: origStart, e: origEnd };
    if (drag.mode === "move") return { s: addDays(origStart, drag.deltaDays), e: addDays(origEnd, drag.deltaDays) };
    if (drag.mode === "resize-start") {
      const next = addDays(origStart, drag.deltaDays);
      return { s: next.getTime() > origEnd.getTime() ? origEnd : next, e: origEnd };
    }
    const next = addDays(origEnd, drag.deltaDays);
    return { s: origStart, e: next.getTime() < origStart.getTime() ? origStart : next };
  }

  const markers = milestones.filter((m) => parseYmd(m.dueDate));
  const sovByPhase = new Map(sovLines.filter((s) => s.phaseId).map((s) => [s.phaseId, s]));
  const panStep = zoom === "day" ? 7 : zoom === "week" ? 14 : 30;

  return (
    <div class="project-gantt">
      <div class="project-gantt-toolbar">
        <div class="project-gantt-nav">
          <button type="button" class="btn-icon" aria-label="Pan earlier" title="Pan earlier" onClick={() => setShiftDays((d) => d - panStep)}><ChevronLeft size={14} /></button>
          <Button variant="ghost" onClick={jumpToday}>Today</Button>
          <button type="button" class="btn-icon" aria-label="Pan later" title="Pan later" onClick={() => setShiftDays((d) => d + panStep)}><ChevronRight size={14} /></button>
          <span class="project-gantt-range">{fmtFull(start)} → {fmtFull(end)}</span>
        </div>
        <div class="project-gantt-actions">
          <div class="project-gantt-zoom-group" role="group" aria-label="Timeline zoom">
            {ZOOM_LABELS.map((z) => (
              <button
                key={z.id}
                type="button"
                class={"project-gantt-zoom-btn" + (zoom === z.id ? " is-active" : "")}
                onClick={() => setZoom(z.id)}
              >
                {z.label}
              </button>
            ))}
          </div>
          {onAddPhase && (
            <Button variant="primary" disabled={!canWrite} onClick={onAddPhase}>
              <Plus size={14} /> Add phase
            </Button>
          )}
        </div>
      </div>

      {!phases.length && !markers.length ? (
        <p class="text-muted">No phases yet. Click <strong>Add phase</strong> above to build your schedule and link stages to Progress Billing (SOV).</p>
      ) : (
        <div class="project-gantt-shell">
          <div class="project-gantt-scroll" ref={scrollRef}>
            <div class="project-gantt-grid" style={{ minWidth: `${170 + timelineWidth + 140}px` }}>
              <div class="project-gantt-header-row">
                <div class="project-gantt-col-label">Phase / Stage</div>
                <div class="project-gantt-header-track" style={{ width: `${timelineWidth}px` }}>
                  {ticks.map((t) => <span key={t.label + t.left} style={{ left: `${t.left}px` }}>{t.label}</span>)}
                  {showToday && <span class="project-gantt-today-pill" style={{ left: `${todayX}px` }}>Today</span>}
                </div>
                <div class="project-gantt-col-actions">SOV / Billing</div>
              </div>

              {phases.map((p) => {
                const { s, e } = effectiveDates(p);
                const linkedSov = sovByPhase.get(p.id) || null;
                const hasDates = !!(s && e);
                const leftPx = hasDates ? xFor(s!) : 0;
                const widthPx = hasDates ? Math.max(Math.max(18, pxPerDay), (diffDays(s!, e!) + 1) * pxPerDay) : 0;
                const isDragging = drag?.phase.id === p.id;
                return (
                  <div class="project-gantt-data-row" key={p.id}>
                    <button
                      type="button"
                      class="project-gantt-label-btn"
                      title={`${p.name}${p.costCode ? ` · ${p.costCode}` : ""}${p.owner ? ` · ${p.owner}` : ""}`}
                      onClick={() => onEditPhase?.(p)}
                    >
                      <span class="project-gantt-label">{p.name}</span>
                      <span class="project-gantt-meta">{p.costCode || "No code"} · {p.percentComplete ?? 0}%</span>
                    </button>

                    <div class="project-gantt-track" style={{ width: `${timelineWidth}px` }} onClick={() => { if (!hasDates) onEditPhase?.(p); }}>
                      {ticks.map((t) => <span key={t.left} class="project-gantt-gridline" style={{ left: `${t.left}px` }} />)}
                      {showToday && <span class="project-gantt-today-line" style={{ left: `${todayX}px` }} />}
                      {hasDates ? (
                        <div
                          class={"project-gantt-bar" + (isDragging ? " is-dragging" : "") + (savingId === p.id ? " is-saving" : "")}
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          title={`${p.name}: ${fmtFull(s!)} → ${fmtFull(e!)} (${p.percentComplete ?? 0}%) · Drag to move, edges to resize`}
                          onPointerDown={(ev) => startDrag(ev as unknown as PointerEvent, p, "move")}
                        >
                          {canWrite && (
                            <span
                              class="project-gantt-handle is-left"
                              title="Drag left edge to change start date"
                              onPointerDown={(ev) => startDrag(ev as unknown as PointerEvent, p, "resize-start")}
                            />
                          )}
                          <span class="project-gantt-bar-fill" style={{ width: `${p.percentComplete ?? 0}%` }} />
                          <span class="project-gantt-bar-text">
                            {isDragging ? `${fmtShort(s!)} → ${fmtShort(e!)}` : `${p.percentComplete ?? 0}%`}
                          </span>
                          {canWrite && (
                            <span
                              class="project-gantt-handle is-right"
                              title="Drag right edge to change end date"
                              onPointerDown={(ev) => startDrag(ev as unknown as PointerEvent, p, "resize-end")}
                            />
                          )}
                        </div>
                      ) : (
                        <span class="project-gantt-unscheduled">Unscheduled — click to set dates ({p.percentComplete ?? 0}%)</span>
                      )}
                    </div>

                    <div class="project-gantt-row-actions">
                      {onEditPhase && (
                        <button type="button" class="btn-icon" aria-label={`Edit ${p.name}`} title="Edit phase" onClick={() => onEditPhase(p)}>
                          <Edit3 size={13} />
                        </button>
                      )}
                      {onBillPhase && (
                        linkedSov ? (
                          <Button variant="ghost" onClick={() => onBillPhase(p, linkedSov)} title={`SOV ${linkedSov.itemNumber}: ${money(linkedSov.scheduledValueCents)}`}>
                            <Badge tone="success">SOV {money(linkedSov.scheduledValueCents)}</Badge>
                          </Button>
                        ) : (
                          <Button variant="ghost" disabled={!canWrite} onClick={() => onBillPhase(p, null)} title="Add this Gantt stage to Schedule of Values for Progress Billing">
                            <Receipt size={13} /> Add to SOV
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}

              {markers.map((m) => {
                const md = parseYmd(m.dueDate)!;
                return (
                  <div class="project-gantt-data-row" key={m.id}>
                    <span class="project-gantt-label" title={m.name}>{m.name}</span>
                    <div class="project-gantt-track" style={{ width: `${timelineWidth}px` }}>
                      {ticks.map((t) => <span key={t.left} class="project-gantt-gridline" style={{ left: `${t.left}px` }} />)}
                      {showToday && <span class="project-gantt-today-line" style={{ left: `${todayX}px` }} />}
                      <span
                        class={"project-gantt-milestone" + (m.completed ? " is-done" : "")}
                        style={{ left: `${xFor(md)}px` }}
                        title={`${m.name} · ${fmtFull(md)}`}
                      />
                    </div>
                    <div class="project-gantt-row-actions" />
                  </div>
                );
              })}
            </div>
          </div>
          {canWrite && phases.length > 0 && (
            <p class="workspace-help" style={{ marginTop: "6px" }}>Drag a phase bar to move dates, drag either edge to resize duration, or click to edit details.</p>
          )}
        </div>
      )}
    </div>
  );
}
