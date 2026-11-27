import { useState } from "preact/hooks";
import { ChevronLeft, ChevronRight } from "lucide-preact";

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asDate = (value?: string | null) => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const fmt = (date: Date) => `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

export function ProjectGantt({ phases, milestones }: { phases: any[]; milestones: any[] }) {
  const [pad, setPad] = useState(7);
  const points = [
    ...phases.flatMap((p) => [asDate(p.plannedStart), asDate(p.plannedEnd)]),
    ...milestones.map((m) => asDate(m.dueDate)),
  ].filter((d): d is Date => !!d);
  if (!points.length) return <p class="text-muted">Add planned phase dates or milestone due dates to build the timeline.</p>;
  const min = new Date(Math.min(...points.map((d) => d.getTime())));
  const max = new Date(Math.max(...points.map((d) => d.getTime())));
  const start = new Date(min.getTime() - pad * DAY);
  const end = new Date(max.getTime() + pad * DAY);
  const span = Math.max(1, (end.getTime() - start.getTime()) / DAY);
  const pos = (d: Date) => ((d.getTime() - start.getTime()) / DAY / span) * 100;
  const ticks: { label: string; left: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    ticks.push({ label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, left: Math.max(0, Math.min(100, pos(cursor))) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const bars = phases.filter((p) => asDate(p.plannedStart) && asDate(p.plannedEnd));
  const markers = milestones.filter((m) => asDate(m.dueDate));

  return (
    <div class="project-gantt">
      <div class="project-gantt-toolbar">
        <span class="project-gantt-range">{fmt(start)} → {fmt(end)}</span>
        <div class="project-gantt-zoom">
          <button type="button" class="btn-icon" aria-label="Shrink timeline" onClick={() => setPad((v) => Math.max(0, v - 7))}><ChevronLeft size={14} /></button>
          <button type="button" class="btn-icon" aria-label="Extend timeline" onClick={() => setPad((v) => v + 7)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div class="project-gantt-months">{ticks.map((t) => <span key={t.label + t.left} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>
      <div class="project-gantt-rows">
        {bars.map((p) => {
          const s = asDate(p.plannedStart)!, e = asDate(p.plannedEnd)!;
          const left = Math.max(0, Math.min(100, pos(s)));
          const width = Math.max(2, Math.min(100 - left, pos(e) - left));
          return (
            <div class="project-gantt-row" key={p.id}>
              <span class="project-gantt-label" title={p.name}>{p.name}</span>
              <div class="project-gantt-track">
                <div class="project-gantt-bar" style={{ left: `${left}%`, width: `${width}%` }} title={`${p.name}: ${fmt(s)} → ${fmt(e)}`}>
                  <span class="project-gantt-bar-fill" style={{ width: `${p.percentComplete ?? 0}%` }} />
                  <span class="project-gantt-bar-text">{p.percentComplete ?? 0}%</span>
                </div>
              </div>
            </div>
          );
        })}
        {markers.map((m) => (
          <div class="project-gantt-row" key={m.id}>
            <span class="project-gantt-label" title={m.name}>{m.name}</span>
            <div class="project-gantt-track">
              <span class={"project-gantt-milestone" + (m.completed ? " is-done" : "")} style={{ left: `${Math.max(0, Math.min(100, pos(asDate(m.dueDate)!)))}%` }} title={`${m.name} · ${fmt(asDate(m.dueDate)!)}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
