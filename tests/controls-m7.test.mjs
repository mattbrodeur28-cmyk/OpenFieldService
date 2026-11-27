import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createControlsService } from "../src/server/controls/service.mjs";

const admin = { id: "u-admin", role: "admin", active: true };
const tech = { id: "u-tech", role: "technician", active: true };
const viewer = { id: "u-view", role: "viewer", active: true };

test("M7 Controls: full hierarchy, checkout sign-off, versioned backup, deficiency → corrective job, and handover package", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-m7-"));
  const storage = openStorage(join(dir, "service.sqlite"));
  try {
    const custId = randomUUID();
    storage.database
      .prepare("INSERT INTO customers(id,name,phone,email,address) VALUES(?,?,?,?,?)")
      .run(custId, "Hartford Hospital", "860-555-0100", "fac@hartford.test", "80 Seymour St, Hartford, CT");

    const ctrl = createControlsService({ storage });

    // CTRL-001: Building -> System
    const { system } = ctrl.createSystem(admin, {
      requestKey: randomUUID(),
      customerId: custId,
      buildingName: "East Wing",
      systemName: "Chilled Water BAS",
    });
    assert.equal(system.building_name, "East Wing");

    // CTRL-002: Reject plaintext password in network field
    assert.throws(
      () =>
        ctrl.createController(tech, {
          requestKey: randomUUID(),
          systemId: system.id,
          tag: "CHW-1",
          networkAddress: "10.0.1.5 password=secret",
        }),
      /plaintext passwords/i,
    );

    const { controller } = ctrl.createController(tech, {
      requestKey: randomUUID(),
      systemId: system.id,
      tag: "CHW-DDC-01",
      manufacturer: "Automated Logic",
      model: "ME812u-LGR",
      protocol: "BACnet/IP",
      networkAddress: "10.10.2.15",
      deviceInstance: "10042",
      pointCount: 48,
      firmwareVersion: "8.05",
      secretRef: "vault://bas/east-wing/chw-01",
    });
    assert.equal(controller.tag, "CHW-DDC-01");

    // CTRL-003: Checkout submission + admin-only sign-off
    const { checkout } = ctrl.createCheckout(tech, {
      requestKey: randomUUID(),
      controllerId: controller.id,
      templateVersion: "v2.0",
      testType: "point_to_point",
      readings: [{ point: "CHW Supply Temp", expected: "44F", actual: "44.1F", pass: true }],
      evidenceNotes: "Calibrated with Fluke 52 II.",
    });
    assert.equal(checkout.status, "submitted");
    assert.throws(
      () => ctrl.reviewCheckout(tech, checkout.id, { requestKey: randomUUID(), decision: "approved", signoffNotes: "Self approve" }),
      /Owner or administrator/i,
    );
    const reviewed = ctrl.reviewCheckout(admin, checkout.id, {
      requestKey: randomUUID(),
      decision: "approved",
      signoffNotes: "Verified readings.",
    });
    assert.equal(reviewed.checkout.status, "approved");

    // CTRL-004: Versioned backup with SHA-256
    const a1 = ctrl.createArtifact(admin, {
      requestKey: randomUUID(),
      systemId: system.id,
      controllerId: controller.id,
      kind: "backup",
      filename: "chw-ddc-01.bog",
      approved: true,
    });
    const a2 = ctrl.createArtifact(admin, {
      requestKey: randomUUID(),
      systemId: system.id,
      controllerId: controller.id,
      kind: "backup",
      filename: "chw-ddc-01.bog",
      approved: true,
    });
    assert.equal(a1.artifact.version, 1);
    assert.equal(a2.artifact.version, 2);
    assert.equal(a2.artifact.sha256.length, 64);

    // CTRL-005: Deficiency -> native corrective job -> authorized closure
    const { deficiency } = ctrl.createDeficiency(tech, {
      requestKey: randomUUID(),
      systemId: system.id,
      controllerId: controller.id,
      checkoutId: checkout.id,
      severity: "major",
      title: "Valve actuator hunts at 20% load",
      description: "Needs PID retune.",
    });
    const corr = ctrl.scheduleCorrectiveJob(tech, deficiency.id, {
      requestKey: randomUUID(),
      scheduledDate: "2026-12-01",
      scheduledTime: "10:00",
    });
    assert.ok(corr.jobId);
    assert.equal(corr.deficiency.status, "in_progress");

    const closed = ctrl.closeDeficiency(admin, deficiency.id, {
      requestKey: randomUUID(),
      retestNotes: "Retuned PID; stable across 10-90% load.",
    });
    assert.equal(closed.deficiency.status, "closed");

    // CTRL-007: Maintenance template version link
    const ml = ctrl.recordMaintLink(tech, {
      requestKey: randomUUID(),
      controllerId: controller.id,
      jobId: corr.jobId,
      templateName: "Chilled Water BAS PM",
      templateVersion: "v3.4",
    });
    assert.equal(ml.link.template_version, "v3.4");

    // CTRL-006: Traceable handover package
    const pkg = ctrl.handoverPackage(viewer, system.id);
    assert.equal(pkg.controllers.length, 1);
    assert.equal(pkg.approvedCheckouts.length, 1);
    assert.equal(pkg.approvedArtifacts.length, 2);
    assert.equal(pkg.closedDeficiencies.length, 1);
    assert.equal(pkg.openDeficiencies.length, 0);
    assert.equal(pkg.maintenanceHistory.length, 1);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
