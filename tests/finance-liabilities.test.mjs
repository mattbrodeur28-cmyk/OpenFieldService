import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createLiabilities } from "../src/server/finance/liabilities.mjs";

const owner = { id: "u-owner", role: "owner", active: true };
const hrUser = { id: "u-hr", role: "hr", active: true };
const clerk = { id: "u-clerk", role: "member", active: true };

test("Finance FIN-002 & FIN-003: supplier bills, approval, credits, payments, and strict HR/accounting capability boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-fin-liab-"));
  const storage = openStorage(join(dir, "service.sqlite"));
  try {
    const liab = createLiabilities({ storage });

    // FIN-003: HR role does NOT imply accounting permissions
    assert.throws(() => liab.list(hrUser), /Finance permission required/i);
    assert.throws(() => liab.list(clerk), /Finance permission required/i);

    // Grant clerk view + manage liabilities (but NOT approve bills)
    liab.setPermissions(owner, {
      userId: clerk.id,
      canViewFinance: true,
      canManageLiabilities: true,
      canApproveBills: false,
    });

    // Clerk creates draft supplier bill
    const { bill } = liab.createBill(clerk, {
      requestKey: randomUUID(),
      supplierName: "Ferguson HVAC Supply",
      billNumber: "INV-99210",
      billDate: "2026-11-20",
      dueDate: "2026-12-20",
      subtotalCents: 100000,
      taxCents: 6350,
    });
    assert.equal(bill.status, "draft");
    assert.equal(bill.total_cents, 106350);

    // Clerk cannot approve without canApproveBills
    assert.throws(
      () => liab.approveBill(clerk, bill.id, { requestKey: randomUUID() }),
      /approve supplier bills/i,
    );

    // Owner approves bill
    const approved = liab.approveBill(owner, bill.id, { requestKey: randomUUID() });
    assert.equal(approved.bill.status, "approved");

    // Apply vendor credit ($63.50)
    const credited = liab.applyCredit(clerk, bill.id, {
      requestKey: randomUUID(),
      creditedOn: "2026-11-22",
      amountCents: 6350,
      reason: "Returned unused fittings",
    });
    assert.equal(credited.bill.balanceCents, 100000);

    // Partial payment ($400.00), then final payment ($600.00)
    const p1 = liab.recordPayment(clerk, bill.id, {
      requestKey: randomUUID(),
      paidOn: "2026-11-25",
      amountCents: 40000,
      method: "ach",
      reference: "ACH-1001",
    });
    assert.equal(p1.bill.status, "partially_paid");
    assert.equal(p1.bill.balanceCents, 60000);

    // Overpayment rejected
    assert.throws(
      () =>
        liab.recordPayment(clerk, bill.id, {
          requestKey: randomUUID(),
          paidOn: "2026-11-26",
          amountCents: 70000,
          method: "check",
        }),
      /exceeds remaining/i,
    );

    const p2 = liab.recordPayment(clerk, bill.id, {
      requestKey: randomUUID(),
      paidOn: "2026-11-26",
      amountCents: 60000,
      method: "check",
      reference: "CHK-442",
    });
    assert.equal(p2.bill.status, "paid");
    assert.equal(p2.bill.balanceCents, 0);

    const listed = liab.list(owner);
    assert.equal(listed.summary.paidTotalCents, 100000);
    assert.equal(listed.summary.openRecognizedCents, 0);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
