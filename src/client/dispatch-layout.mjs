export function minuteOf(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
export function clockOf(minute) {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function snapMinute(minute, interval) {
  return Math.max(0, Math.min(1439, Math.round(minute / interval) * interval));
}
export function shiftDate(date, days) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dayInZone(timeZone, instant = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((item) => [item.type, item.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function layoutAppointments(jobs) {
  const ends = [];
  const items = [...jobs]
    .sort(
      (a, b) =>
        minuteOf(a.scheduled_time) - minuteOf(b.scheduled_time) ||
        a.id.localeCompare(b.id),
    )
    .map((job) => {
      const start = minuteOf(job.scheduled_time);
      let lane = ends.findIndex((end) => end <= start);
      if (lane < 0) lane = ends.length;
      ends[lane] = start + Math.max(15, job.duration);
      return { job, lane };
    });
  return { items, lanes: Math.max(1, ends.length) };
}
export function overlapIds(jobs) {
  const conflicts = new Set();
  const active = jobs.filter(
    (job) =>
      ["scheduled", "confirmed", "in_progress"].includes(job.status) &&
      job.technician_id,
  );
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j];
      if (
        a.technician_id === b.technician_id &&
        a.scheduled_date === b.scheduled_date &&
        minuteOf(a.scheduled_time) < minuteOf(b.scheduled_time) + b.duration &&
        minuteOf(b.scheduled_time) < minuteOf(a.scheduled_time) + a.duration
      ) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  return conflicts;
}
