// UTC bounds of a local calendar date, including DST and skipped-midnight transitions.
export function createDayBounds() {
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
  return dayBounds;
}
