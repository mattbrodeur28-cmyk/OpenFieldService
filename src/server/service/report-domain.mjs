import { z } from "zod";
import { ServiceIdentityError } from "./identity.mjs";
export const fail = (message, status = 400) => {
  throw new ServiceIdentityError(message, status);
};
export const instant = z
  .string()
  .datetime({ offset: true })
  .refine((v) => {
    const d = new Date(v),
      day = new Date(v.slice(0, 10));
    return (
      Number.isFinite(d.getTime()) &&
      Number.isFinite(day.getTime()) &&
      day.toISOString().slice(0, 10) === v.slice(0, 10) &&
      d.getUTCSeconds() === 0 &&
      d.getUTCMilliseconds() === 0
    );
  }, "Use a valid date and time with an offset, to the minute.")
  .transform((v) => new Date(v).toISOString());
const optionalInstant = z.union([z.literal(""), instant]);
const entry = z
  .object({
    technicianId: z.string().uuid(),
    startAt: optionalInstant,
    endAt: optionalInstant,
    breakMinutes: z.number().int().min(0).max(1440),
    requestedBillableMinutes: z.number().int().min(0).max(1440),
    workType: z.enum(["work", "travel", "nonbillable"]),
    notes: z.string().trim().max(1000),
  })
  .strict();
export const reportInput = z
  .object({
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone."),
    workPerformed: z.string().trim().max(12000),
    findings: z.string().trim().max(8000),
    deficiencies: z.string().trim().max(8000),
    followUp: z.string().trim().max(8000),
    visitStartAt: optionalInstant,
    visitEndAt: optionalInstant,
    entries: z.array(entry).max(20),
  })
  .strict();
export const requestInput = z
  .object({
    expectedVersion: z.number().int().nonnegative().safe(),
    delegationReason: z.string().trim().max(1000).default(""),
    lateEntryReason: z.string().trim().max(1000).default(""),
    report: reportInput,
  })
  .strict()
  .refine(
    (v) => JSON.stringify(v.report).length <= 44000,
    "The report is too large.",
  );
export const reviewInput = z
  .object({
    expectedVersion: z.number().int().nonnegative().safe(),
    reportId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().min(3).max(4000),
  })
  .strict();
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}
export function validateReport(report, technicianId, now) {
  if (
    !report.workPerformed ||
    !report.visitStartAt ||
    !report.visitEndAt ||
    !report.entries.length
  )
    fail(
      "Record work performed, the actual visit interval and at least one labor entry.",
    );
  const elapsed =
    (Date.parse(report.visitEndAt) - Date.parse(report.visitStartAt)) / 60000;
  if (
    !Number.isInteger(elapsed) ||
    elapsed < 1 ||
    elapsed > 1440 ||
    Date.parse(report.visitEndAt) > now.getTime()
  )
    fail(
      "Record a finished actual visit of 1–1440 minutes. Split longer visits into separate records.",
    );
  const intervals = [];
  for (const e of report.entries) {
    if (e.technicianId !== technicianId)
      fail(
        "Labor entries must identify the assigned technician. Crew entries require a separately authorized crew workflow.",
        403,
      );
    const minutes = (Date.parse(e.endAt) - Date.parse(e.startAt)) / 60000;
    if (
      !e.startAt ||
      !e.endAt ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      e.startAt < report.visitStartAt ||
      e.endAt > report.visitEndAt ||
      e.breakMinutes >= minutes ||
      e.requestedBillableMinutes > minutes - e.breakMinutes ||
      (e.workType === "nonbillable" && e.requestedBillableMinutes !== 0)
    )
      fail(
        "Labor must fit inside the actual visit; breaks and requested billable minutes cannot exceed worked time.",
      );
    if (
      intervals.some((peer) => peer.startAt < e.endAt && peer.endAt > e.startAt)
    )
      fail("Labor entries for one technician cannot overlap.");
    intervals.push(e);
  }
  return elapsed;
}
