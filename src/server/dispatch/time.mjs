export const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
export function timeMinute(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function zonedDay(timeZone, instant = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function possibleInstants(date, minute, timeZone) {
  const target = Date.parse(date + "T00:00:00Z") + minute * 60000;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const partsAt = (instant) =>
    Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) => {
      const instant = target + delta,
        p = partsAt(instant);
      return (
        Date.UTC(
          Number(p.year),
          Number(p.month) - 1,
          Number(p.day),
          Number(p.hour),
          Number(p.minute),
          Number(p.second),
        ) - instant
      );
    }),
  );
  return [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => {
      const p = partsAt(instant);
      return (
        `${p.year}-${p.month}-${p.day}` ===
          new Date(target).toISOString().slice(0, 10) &&
        Number(p.hour) * 60 + Number(p.minute) === minute % 1440
      );
    });
}
/** A wall-clock board does not silently choose a repeated hour or cross a DST transition. */
export function validZonedInterval(date, start, duration, timeZone) {
  const starts = possibleInstants(date, start, timeZone),
    ends = possibleInstants(date, start + duration, timeZone);
  return (
    starts.length === 1 &&
    ends.length === 1 &&
    ends[0] - starts[0] === duration * 60000
  );
}
