// A read projection only: the caller owns the consistent database snapshot.
// Approved actual intervals never update the planned job schedule.
export function createActualSlots(db) {
  const boundsCache = new Map();
  function dayBounds(date, timeZone) {
    const key = date + "|" + timeZone;
    if (boundsCache.has(key)) return boundsCache.get(key);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dayAt = (ms) => {
      const p = Object.fromEntries(
        formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
      );
      return p.year + "-" + p.month + "-" + p.day;
    };
    const lowerBound = (target) => {
      const base = Date.parse(target + "T00:00:00Z");
      let lo = base - 36 * 3600000,
        hi = base + 36 * 3600000;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 120000) * 60000;
        if (dayAt(mid) < target) lo = mid + 60000;
        else hi = mid;
      }
      return lo;
    };
    const next = new Date(Date.parse(date + "T00:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10),
      result = [lowerBound(date), lowerBound(next)];
    if (boundsCache.size >= 512) boundsCache.clear();
    boundsCache.set(key, result);
    return result;
  }
  return (date, timeZone) => {
    const [start, end] = dayBounds(date, timeZone),
      rows = db
        .prepare(
          "SELECT r.id AS report_id,r.job_id,r.revision,r.visit_start_at,r.visit_end_at FROM _service_reports r JOIN _service_execution e ON e.current_report_id=r.id JOIN _service_report_reviews v ON v.report_id=r.id WHERE e.service_completed=1 AND v.decision='approved' AND r.visit_end_at>? AND r.visit_start_at<? ORDER BY r.visit_start_at,r.id LIMIT 2001",
        )
        .all(new Date(start).toISOString(), new Date(end).toISOString());
    const replacedJobIds = db
      .prepare(
        "SELECT e.job_id FROM _service_execution e JOIN jobs j ON j.id=e.job_id JOIN _service_report_reviews v ON v.report_id=e.current_report_id WHERE e.service_completed=1 AND v.decision='approved' AND j.scheduled_date=?",
      )
      .all(date)
      .map((r) => r.job_id);
    const format = new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const minuteAt = (ms) => {
      const parts = Object.fromEntries(
        format.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
      );
      return Number(parts.hour) * 60 + Number(parts.minute);
    };
    return {
      overflow: rows.length > 2000,
      replacedJobIds,
      slots: rows.slice(0, 2000).map((row) => {
        const segmentStart = Math.max(start, Date.parse(row.visit_start_at)),
          segmentEnd = Math.min(end, Date.parse(row.visit_end_at)),
          from = minuteAt(segmentStart),
          to = segmentEnd === end ? 1440 : minuteAt(segmentEnd),
          real = (segmentEnd - segmentStart) / 60000,
          wall = to - from,
          totals = db
            .prepare(
              "SELECT COALESCE(SUM(worked_minutes),0) AS worked,COALESCE(SUM(break_minutes),0) AS breaks,COALESCE(SUM(requested_billable_minutes),0) AS requested FROM _service_time_entries WHERE report_id=? AND state='approved'",
            )
            .get(row.report_id);
        return {
          jobId: row.job_id,
          reportId: row.report_id,
          reportRevision: row.revision,
          scheduled_date: date,
          scheduled_time:
            String(Math.floor(from / 60)).padStart(2, "0") +
            ":" +
            String(from % 60).padStart(2, "0"),
          duration: Math.max(1, wall),
          schedule_kind: "actual",
          actual_start_at: row.visit_start_at,
          actual_end_at: row.visit_end_at,
          actual_elapsed_minutes:
            (Date.parse(row.visit_end_at) - Date.parse(row.visit_start_at)) /
            60000,
          actual_segment_minutes: real,
          actual_worked_minutes: totals.worked,
          actual_break_minutes: totals.breaks,
          requested_billable_minutes: totals.requested,
          actual_timeline_approximate: wall !== real,
          continues_before: segmentStart > Date.parse(row.visit_start_at),
          continues_after: segmentEnd < Date.parse(row.visit_end_at),
        };
      }),
    };
  };
}
