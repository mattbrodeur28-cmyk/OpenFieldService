import { zonedInput, zonedCandidates } from "./time-zone.mjs";
/** SQL audit timestamps are UTC; ISO instants retain their explicit offset. */
export function formatTimestamp(value: string, timeZone?: string) {
  const iso = value.replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : iso + "Z");
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "Unknown time";
}

export function localInput(
  iso: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return zonedInput(iso, timeZone);
}
export function localCandidates(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return zonedCandidates(value, timeZone);
}
export function resolveLocal(
  value: string,
  choice = "",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  if (!value) return "";
  const candidates = localCandidates(value, timeZone);
  if (!candidates.length)
    throw new Error(
      "Choose a valid local date/time; this time may fall in a daylight-saving gap.",
    );
  if (candidates.length > 1 && !candidates.includes(choice))
    throw new Error(
      "Choose the exact occurrence for a repeated daylight-saving time.",
    );
  return candidates.length === 1 ? candidates[0] : choice;
}
