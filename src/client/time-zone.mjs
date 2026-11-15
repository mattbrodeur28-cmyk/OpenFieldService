const formatters = new Map(),
  candidateCache = new Map();
export function zonedInput(iso, timeZone) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const p = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedCandidates(value, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return [];
  const key = timeZone + "|" + value;
  if (candidateCache.has(key)) return [...candidateCache.get(key)];
  const nominal = Date.parse(value + "Z");
  if (!Number.isFinite(nominal)) return [];
  const result = [];
  // Modern IANA offsets are multiples of 15 minutes; test both sides of all current offsets.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const iso = new Date(nominal + offset * 60000).toISOString();
    if (zonedInput(iso, timeZone) === value) result.push(iso);
  }
  if (candidateCache.size >= 500) candidateCache.clear();
  candidateCache.set(key, result);
  return [...result];
}
