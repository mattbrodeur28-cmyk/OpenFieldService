import { createDispatcher } from "../../src/server/dispatch/service.mjs";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../../src/server/sqlite.mjs";
import { createCompanySettings } from "../../src/server/service/company.mjs";
import { createService } from "../../src/server/service/http.mjs";
import { createPostWork } from "../../src/server/service/reports.mjs";
export const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  other = { id: randomUUID(), role: "member", active: true },
  hr = { id: randomUUID(), role: "member", hr: true, active: true };
export function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-sheets-")),
    path = join(dir, "test.sqlite"),
    storage = openStorage(path),
    db = storage.database;
  createCompanySettings({
    storage,
    env: { COMPANY_TIMEZONE: "America/New_York" },
  });
  const dispatcher = createDispatcher({ storage, currentUser: () => owner });
  const module = createService({
    storage,
    currentUser: () => owner,
    people: () =>
      [owner, member, other, hr].map((u) => ({ id: u.id, name: u.role })),
  });
  const customer = randomUUID(),
    tech = randomUUID(),
    site = randomUUID(),
    asset = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,'Customer')").run(
    customer,
  );
  db.prepare("INSERT INTO technicians(id,name) VALUES(?,'Technician')").run(
    tech,
  );
  db.prepare(
    "INSERT INTO sites(id,customer_id,name) VALUES(?,?,'Building')",
  ).run(site, customer);
  db.prepare(
    "INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,'Controller','TEST')",
  ).run(asset, customer, site);
  module.service.save(owner, tech, { userId: member.id, expectedVersion: 0 });
  const template = module.execution.saveTemplate(owner, {
    expectedRevision: 0,
    name: "Fixture PJSA",
    questions: [{ key: "ack", label: "Reviewed", kind: "ack", required: true }],
    approvedForUse: true,
  });
  const reports = createPostWork({
    storage,
    identity: module.service,
    safety: module.execution,
    clock: () => new Date("2026-12-01T00:00:00Z"),
  });
  function visit(
    start = "2026-11-10T14:00:00.000Z",
    end = "2026-11-10T15:00:00.000Z",
    approve = true,
  ) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,technician_id,asset_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,'2026-11-10','09:00',60)",
    ).run(id, "TIME-" + id, customer, tech, asset);
    module.execution.enroll(owner, id, {
      templateId: template.template_id,
      templateRevision: 1,
      expectedScheduleVersion: 0,
    });
    module.execution.safety(
      member,
      id,
      { expectedVersion: 0, answers: { ack: true } },
      true,
    );
    const report = {
      timeZone: "America/New_York",
      workPerformed: "Fixture equipment inspection",
      findings: "",
      deficiencies: "",
      followUp: "",
      visitStartAt: start,
      visitEndAt: end,
      entries: [
        {
          technicianId: tech,
          startAt: start,
          endAt: end,
          breakMinutes: 10,
          requestedBillableMinutes: 40,
          workType: "work",
          notes: "Recorded work",
        },
      ],
    };
    const submitted = reports.save(
      owner,
      id,
      {
        expectedVersion: 1,
        delegationReason: "Supervisor entering disposable technician evidence",
        lateEntryReason:
          "Fixture historical evidence retained without backdating safety",
        report,
      },
      true,
    );
    if (approve)
      reports.review(owner, id, {
        expectedVersion: 2,
        reportId: submitted.reports[0].id,
        decision: "approved",
        notes: "Reviewed fixture work and labor evidence",
      });
    return { id, report, reportId: submitted.reports[0].id };
  }
  t.after(() => {
    dispatcher.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const key = { technicianId: tech, weekStart: "2026-11-09" };
  return { storage, db, module, tech, key, visit, path, reports };
}
