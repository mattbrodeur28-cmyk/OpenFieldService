import { createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { ServiceIdentityError } from "./identity.mjs";
const fail = (message, status = 400) => {
  throw new ServiceIdentityError(message, status);
};
const schema = `
CREATE TABLE _service_billing_drafts(job_id TEXT PRIMARY KEY REFERENCES _service_execution(job_id) ON DELETE RESTRICT,version INTEGER NOT NULL,source_token TEXT NOT NULL,draft_json TEXT NOT NULL,actor_id TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _service_billing_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`;
const cents = z.number().int().min(0).max(10000000).safe();
const line = z
  .object({
    sourceId: z.string().uuid(),
    rateCents: cents,
    billableMinutes: z.number().int().min(0).max(1440).optional(),
    reason: z.string().trim().max(1000).default(""),
  })
  .strict();
const input = z
  .object({
    expectedVersion: z.number().int().nonnegative().safe(),
    sourceToken: z.string().regex(/^[a-f0-9]{64}$/),
    currency: z.literal("USD"),
    labor: z.array(line).max(20),
    materials: z.array(line.omit({ billableMinutes: true })).max(200),
    taxBasisPoints: z.number().int().min(0).max(10000),
    notes: z.string().trim().max(4000),
  })
  .strict();
const round = (numerator, denominator) => {
  const amount = (numerator + denominator / 2n) / denominator;
  if (amount > 1000000000n) fail("Billing totals cannot exceed $10 million.");
  return Number(amount);
};
export function calculateBilling(source, raw) {
  const result = input.safeParse(raw);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  const data = result.data;
  if (data.sourceToken !== source.sourceToken)
    fail(
      "Billing sources changed. Reload and review the current report and materials.",
      409,
    );
  const compare = (given, expected) =>
    given.length === expected.length &&
    new Set(given.map((e) => e.sourceId)).size === expected.length &&
    given.every((e) => expected.some((s) => s.id === e.sourceId));
  if (
    !compare(data.labor, source.labor) ||
    !compare(data.materials, source.materials)
  )
    fail(
      "Review every source exactly once; unknown or duplicate billing sources are not allowed.",
    );
  const lines = [];
  for (const row of data.labor) {
    const item = source.labor.find((e) => e.id === row.sourceId);
    if (
      row.billableMinutes === undefined ||
      row.billableMinutes > item.worked_minutes
    )
      fail(
        "Approved billable minutes must be between zero and recorded worked minutes.",
      );
    if (item.work_type === "nonbillable" && row.billableMinutes !== 0)
      fail("Nonbillable labor must retain zero billable minutes.");
    if (
      (row.billableMinutes !== item.requested_billable_minutes ||
        row.rateCents === 0) &&
      row.reason.length < 10
    )
      fail(
        "Changed billable minutes or a zero rate require a review reason of at least 10 characters.",
      );
    lines.push({
      kind: "labor",
      sourceId: item.id,
      description: source.technicianName + " · " + item.work_type,
      quantity: row.billableMinutes,
      unit: "minute",
      rateCents: row.rateCents,
      amountCents: round(
        BigInt(row.billableMinutes) * BigInt(row.rateCents),
        60n,
      ),
      reason: row.reason,
    });
  }
  for (const row of data.materials) {
    const item = source.materials.find((e) => e.id === row.sourceId);
    if (row.rateCents === 0 && row.reason.length < 10)
      fail("A no-charge material requires a reason of at least 10 characters.");
    lines.push({
      kind: "material",
      sourceId: item.id,
      materialId: item.material_id,
      description: item.material_name,
      quantity: item.quantityMilli,
      unit: "milli-unit",
      rateCents: row.rateCents,
      amountCents: round(
        BigInt(item.quantityMilli) * BigInt(row.rateCents),
        1000n,
      ),
      reason: row.reason,
    });
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (subtotalCents > 1000000000)
    fail("Billing totals cannot exceed $10 million.");
  const taxCents = round(
      BigInt(subtotalCents) * BigInt(data.taxBasisPoints),
      10000n,
    ),
    totalCents = subtotalCents + taxCents;
  if (totalCents > 1000000000)
    fail("Billing totals cannot exceed $10 million.");
  return { ...data, lines, subtotalCents, taxCents, totalCents };
}
export function createBilling({ storage }) {
  const db = storage.database;
  migrate(db, "_service_billing_migrations", [{ version: 1, sql: schema }]);
  const authorize = (user) => {
    if (
      !user?.active ||
      user.mustChangePassword ||
      !["owner", "admin"].includes(user.role)
    )
      fail("Owner or administrator billing access required.", 403);
  };
  function read(user, id) {
    authorize(user);
    const job = db
      .prepare(
        "SELECT j.id,j.identifier,j.customer_id,j.asset_id,j.status,t.name AS technician_name,e.stage,e.service_completed,e.current_report_id,COALESCE(w.category,'unspecified') AS category FROM jobs j LEFT JOIN technicians t ON t.id=j.technician_id LEFT JOIN _service_execution e ON e.job_id=j.id LEFT JOIN _service_work w ON w.job_id=j.id WHERE j.id=?",
      )
      .get(id);
    if (!job) fail("Job not found.", 404);
    const report = job.current_report_id
      ? db
          .prepare(
            "SELECT r.id,r.revision,r.asset_id,v.decision FROM _service_reports r LEFT JOIN _service_report_reviews v ON v.report_id=r.id WHERE r.id=?",
          )
          .get(job.current_report_id)
      : null;
    const labor = report
      ? db
          .prepare(
            "SELECT id,technician_id,worked_minutes,requested_billable_minutes,work_type,state,start_at,end_at FROM _service_time_entries WHERE report_id=? ORDER BY start_at,id",
          )
          .all(report.id)
      : [];
    const rows = db
      .prepare(
        "SELECT jm.id,jm.material_id,jm.quantity,jm.unit_cost,m.name AS material_name,m.unit FROM job_materials jm JOIN materials m ON m.id=jm.material_id WHERE jm.job_id=? ORDER BY jm.id LIMIT 201",
      )
      .all(id);
    const blockers = [];
    if (job.category !== "on_demand")
      blockers.push(
        "This T&M billing preparation requires On-Demand work. Quoted work needs accepted scope and PM needs agreement coverage.",
      );
    if (
      job.status !== "completed" ||
      !job.service_completed ||
      report?.decision !== "approved"
    )
      blockers.push(
        "Complete supervisor report review before preparing billing.",
      );
    if (!job.asset_id || report?.asset_id !== job.asset_id)
      blockers.push(
        "The approved report must retain this job’s equipment evidence.",
      );
    if (labor.some((e) => e.state !== "approved"))
      blockers.push("All report labor must be approved.");
    if (rows.length > 200)
      blockers.push(
        "More than 200 material entries require a planned billing split.",
      );
    const materials = rows.map((m) => ({
      ...m,
      quantityMilli: Math.round(m.quantity * 1000),
    }));
    if (
      materials.some(
        (m) =>
          m.quantityMilli <= 0 ||
          m.quantityMilli > 1000000000 ||
          Math.abs(m.quantity * 1000 - m.quantityMilli) > 0.000001,
      )
    )
      blockers.push(
        "Material quantities must be positive and use no more than three decimal places.",
      );
    const sourceToken = createHash("sha256")
      .update(JSON.stringify({ job, report, labor, materials }))
      .digest("hex");
    const row = db
      .prepare("SELECT * FROM _service_billing_drafts WHERE job_id=?")
      .get(id);
    return {
      job,
      technicianName: job.technician_name || "Technician",
      report,
      labor,
      materials,
      sourceToken,
      blockers,
      draft: row
        ? {
            ...row,
            data: JSON.parse(row.draft_json),
            stale: row.source_token !== sourceToken,
          }
        : null,
    };
  }
  const detail = (user, id) => transaction(db, () => read(user, id));
  function save(user, id, raw) {
    authorize(user);
    transaction(db, () => {
      const source = read(user, id);
      if (source.blockers.length) fail(source.blockers.join(" "), 409);
      const data = calculateBilling(source, raw);
      if (data.expectedVersion !== (source.draft?.version || 0))
        fail("Billing draft changed. Reload before saving.", 409);
      db.prepare(
        "INSERT INTO _service_billing_drafts(job_id,version,source_token,draft_json,actor_id) VALUES(?,1,?,?,?) ON CONFLICT(job_id) DO UPDATE SET version=version+1,source_token=excluded.source_token,draft_json=excluded.draft_json,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP",
      ).run(id, source.sourceToken, JSON.stringify(data), user.id);
      db.prepare(
        "INSERT INTO _service_billing_audit(job_id,actor_id,action,before_json,after_json) VALUES(?,?,'draft_saved',?,?)",
      ).run(id, user.id, JSON.stringify(source.draft), JSON.stringify(data));
    });
    return detail(user, id);
  }
  return { detail, save };
}
