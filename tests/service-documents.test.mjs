import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setup, issue, receipt, reason } from "./fixtures/purchasing.mjs";
import { owner, member, other, hr } from "./fixtures/service-execution.mjs";
import { createDocumentModule } from "../src/server/documents/http.mjs";
const pdf = Buffer.from("%PDF-1.4\nFixture receipt only\n%%EOF");
function uploadBody(target, extras = {}) {
  return {
    requestKey: randomUUID(),
    title: "Delivery receipt",
    tags: ["Packing Slip", "Receipt"],
    target,
    ...extras,
  };
}
test("One private original document links PO, delivery and ticket without duplicated bytes or material usage", (t) => {
  const f = setup(t),
    docs = f.module.documents,
    v = f.visit();
  issue(f);
  const received = f.p.receive(owner, receipt(f));
  const body = uploadBody({ receiptId: received.receiptId });
  const result = docs.upload(owner, body, pdf, "packing slip.pdf");
  assert.equal(docs.upload(owner, body, pdf, "packing slip.pdf").id, result.id);
  const orderDocs = docs.list(owner, { orderId: f.draft.id }).documents;
  assert.equal(orderDocs.length, 1);
  assert.deepEqual(orderDocs[0].tags, ["packing slip", "receipt"]);
  assert.equal(
    docs.list(owner, { receiptId: received.receiptId }).documents[0].id,
    result.id,
  );
  docs.link(owner, {
    requestKey: randomUUID(),
    id: result.id,
    expectedVersion: 1,
    target: { jobId: v.id },
    reason,
  });
  assert.equal(docs.list(member, { jobId: v.id }).documents[0].id, result.id);
  assert.equal(
    docs.list(member, { jobId: v.id }).documents[0].links.length,
    1,
    "member cannot discover PO links",
  );
  assert.deepEqual(docs.download(member, result.id).bytes, pdf);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_blobs").get().n,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_records").get().n,
    1,
  );
  assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 4000);
  assert.throws(
    () => docs.list(member, { orderId: f.draft.id }),
    /administrator/,
  );
  assert.throws(() => docs.download(other, result.id), /not available/);
  assert.throws(() => docs.download(hr, result.id), /not available/);
  f.module.service.save(owner, f.tech, { userId: null, expectedVersion: 1 });
  assert.throws(() => docs.download(member, result.id), /not available/);
  assert.throws(
    () => f.db.prepare("UPDATE _document_blobs SET bytes=?").run(pdf),
    /IMMUTABLE/,
  );
  assert.throws(
    () => f.db.prepare("DELETE FROM _document_links").run(),
    /IMMUTABLE/,
  );
});
test("Document metadata is audited/versioned, archive is reversible, and replay keys cannot change bytes", (t) => {
  const f = setup(t),
    docs = f.module.documents,
    v = f.visit(),
    body = uploadBody({ jobId: v.id });
  const first = docs.upload(member, body, pdf, "receipt.pdf");
  assert.throws(
    () => docs.upload(member, body, Buffer.from("%PDF-changed"), "receipt.pdf"),
    /different document data/,
  );
  assert.throws(
    () =>
      docs.edit(member, {
        requestKey: randomUUID(),
        id: first.id,
        expectedVersion: 1,
        title: "No access",
        tags: ["receipt"],
        archived: false,
        reason,
      }),
    /administrator/,
  );
  const edit = {
    requestKey: randomUUID(),
    id: first.id,
    expectedVersion: 1,
    title: "Corrected supplier receipt",
    tags: ["Receipt", "job cost"],
    archived: true,
    reason,
  };
  docs.edit(owner, edit);
  assert.equal(docs.edit(owner, edit).replayed, true);
  assert.equal(docs.list(owner, { jobId: v.id }).documents.length, 0);
  assert.equal(
    docs.list(owner, { jobId: v.id }, { includeArchived: true }).documents[0]
      .archived,
    1,
  );
  assert.throws(
    () => docs.download(owner, first.id),
    (e) => e.status === 410,
  );
  assert.throws(
    () => docs.edit(owner, { ...edit, requestKey: randomUUID() }),
    /changed/,
  );
  docs.edit(owner, {
    ...edit,
    requestKey: randomUUID(),
    expectedVersion: 2,
    archived: false,
  });
  assert.equal(
    docs.list(member, { jobId: v.id }, { tag: "JOB COST" }).documents[0].title,
    "Corrected supplier receipt",
  );
  assert.deepEqual(docs.download(member, first.id).bytes, pdf);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_audit").get().n,
    3,
  );
});
test("Unsupported/oversized files, mismatched receipts, shared-file authorization and failed links cannot leave data behind", (t) => {
  const f = setup(t),
    docs = f.module.documents,
    v = f.visit();
  issue(f);
  const received = f.p.receive(owner, receipt(f));
  assert.throws(
    () =>
      docs.upload(
        member,
        uploadBody({ jobId: v.id }),
        Buffer.from("<html>script</html>"),
        "fake.pdf",
      ),
    (e) => e.status === 415,
  );
  assert.throws(
    () =>
      docs.upload(
        owner,
        uploadBody({ jobId: v.id }),
        Buffer.alloc(10 * 1024 * 1024 + 1),
        "large.pdf",
      ),
    (e) => e.status === 413,
  );
  assert.throws(
    () =>
      docs.upload(
        owner,
        uploadBody({ receiptId: received.receiptId, orderId: randomUUID() }),
        pdf,
        "receipt.pdf",
      ),
    /different PO/,
  );
  assert.throws(
    () => docs.upload(other, uploadBody({ jobId: v.id }), pdf, "receipt.pdf"),
    /assigned technician/,
  );
  f.db.exec(
    "CREATE TRIGGER fixture_document_link_failure BEFORE INSERT ON _document_links BEGIN SELECT RAISE(ABORT,'fixture document failure'); END;",
  );
  const body = uploadBody({ jobId: v.id });
  assert.throws(
    () => docs.upload(member, body, pdf, "receipt.pdf"),
    /fixture document failure/,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_blobs").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_records").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_requests").get().n,
    0,
  );
  f.db.exec("DROP TRIGGER fixture_document_link_failure");
  docs.upload(member, body, pdf, "receipt.pdf");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_blobs").get().n,
    1,
  );
});
test("Document HTTP validates multipart uploads, live permission, private download headers and filename type", async (t) => {
  const f = setup(t),
    v = f.visit();
  let actor = owner;
  const docs = createDocumentModule({
      storage: f.storage,
      identity: f.module.service,
      currentUser: () => actor,
    }),
    app = docs.app;
  const metadata = uploadBody({ jobId: v.id }),
    form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  form.append(
    "file",
    new File([pdf], "not-really-html.html", { type: "text/html" }),
  );
  const response = await app.request("/upload", {
    method: "POST",
    headers: { "X-Requested-With": "OpenFieldService" },
    body: form,
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  const download = await app.request("/records/" + result.id + "/download");
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Content-Type"), "application/pdf");
  assert.match(
    download.headers.get("Content-Disposition"),
    /filename\*=UTF-8''not-really-html.pdf/,
  );
  assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(download.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
  actor = other;
  assert.equal(
    (await app.request("/records/" + result.id + "/download")).status,
    403,
  );
  actor = null;
  assert.equal(
    (await app.request("/records/" + result.id + "/download")).status,
    401,
  );
  actor = owner;
  assert.equal(
    (await app.request("/upload", { method: "POST", body: "{}" })).status,
    403,
  );
  assert.equal(
    (
      await app.request("/upload", {
        method: "POST",
        headers: { "X-Requested-With": "OpenFieldService" },
        body: "{}",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.request("/edit", {
        method: "POST",
        headers: { "X-Requested-With": "OpenFieldService" },
        body: "x".repeat(50001),
      })
    ).status,
    413,
  );
  const encoded = new Request("http://local/upload", {
      method: "POST",
      body: form,
    }),
    bytes = await encoded.arrayBuffer();
  let release;
  const pendingBody = new ReadableStream({
    start(c) {
      release = () => {
        c.enqueue(new Uint8Array(bytes));
        c.close();
      };
    },
  });
  const pending = app.request(
    new Request("http://local/upload", {
      method: "POST",
      headers: {
        "X-Requested-With": "OpenFieldService",
        "Content-Type": encoded.headers.get("Content-Type"),
      },
      body: pendingBody,
      duplex: "half",
    }),
  );
  actor = other;
  release();
  assert.equal((await pending).status, 403);
});

test("Document pagination and exact tags retain all records without duplicating stored bytes", (t) => {
  const f = setup(t),
    docs = f.module.documents,
    v = f.visit(),
    ids = [];
  for (let i = 0; i < 51; i++)
    ids.push(
      docs.upload(
        owner,
        uploadBody(
          { jobId: v.id },
          {
            title: "Receipt " + i,
            tags: i % 2 ? ["Receipt"] : ["Receipt", "material"],
          },
        ),
        pdf,
        "receipt.pdf",
      ).id,
    );
  const first = docs.list(owner, { jobId: v.id }),
    second = docs.list(owner, { jobId: v.id }, { page: 2 });
  assert.equal(first.documents.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.documents.length, 1);
  assert.equal(
    new Set([...first.documents, ...second.documents].map((d) => d.id)).size,
    51,
  );
  assert.equal(
    docs.list(owner, { jobId: v.id }, { tag: "MATERIAL" }).documents.length,
    26,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _document_blobs").get().n,
    1,
  );
});

test("SQLite online backup restores original file bytes, native links and PO stock together", async (t) => {
  const { backup } = await import("node:sqlite"),
    { openStorage } = await import("../src/server/sqlite.mjs"),
    { createService } = await import("../src/server/service/http.mjs");
  const f = setup(t),
    v = f.visit();
  issue(f);
  const received = f.p.receive(owner, receipt(f));
  const doc = f.module.documents.upload(
    owner,
    uploadBody({ jobId: v.id, receiptId: received.receiptId }),
    pdf,
    "retained.pdf",
  );
  const destination = f.path + ".restore";
  await backup(f.db, destination);
  const restored = openStorage(destination);
  try {
    const m = createService({
      storage: restored,
      currentUser: () => owner,
      people: () => [
        { id: owner.id, name: "Owner" },
        { id: member.id, name: "Technician" },
      ],
    });
    assert.deepEqual(m.documents.download(member, doc.id).bytes, pdf);
    assert.equal(
      m.documents.list(owner, { orderId: f.draft.id }).documents[0].id,
      doc.id,
    );
    assert.equal(
      m.purchasing.detail(owner, f.draft.id).lines[0].received_milli,
      4000,
    );
    assert.equal(
      m.inventory.detail(owner, f.place.id).stock[0].quantity_milli,
      4000,
    );
    assert.deepEqual(
      restored.database.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
    assert.equal(
      restored.database.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  } finally {
    restored.close();
  }
});

test("Supported photo signatures are identified from bytes and executable/text formats are rejected", async () => {
  const { identifyFile } = await import("../src/server/documents/service.mjs");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA3sAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal(identifyFile(png), "image/png");
  assert.equal(
    identifyFile(Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])),
    "image/jpeg",
  );
  assert.equal(identifyFile(Buffer.from("RIFF0000WEBPfixture")), "image/webp");
  assert.throws(
    () => identifyFile(Buffer.from('<svg onload="bad"></svg>')),
    (e) => e.status === 415,
  );
});
