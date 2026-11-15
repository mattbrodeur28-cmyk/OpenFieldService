import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import {
  admin,
  writer,
  fail,
  parse,
  version,
  reason,
} from "../inventory/domain.mjs";
import { documentsSchema } from "./schema.mjs";
const uuid = z.string().uuid();
const tags = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[^\u0000-\u001f\u007f,]+$/)
      .transform((v) => v.toLowerCase()),
  )
  .min(1)
  .max(12)
  .transform((v) => [...new Set(v)]);
const target = z
  .object({
    jobId: uuid.optional(),
    orderId: uuid.optional(),
    receiptId: uuid.optional(),
  })
  .strict()
  .refine(
    (t) => Object.values(t).some(Boolean),
    "Choose a job, PO or receipt.",
  );
const uploadInput = z
  .object({
    requestKey: uuid,
    title: z.string().trim().min(1).max(160),
    tags,
    target,
  })
  .strict();
const editInput = z
  .object({
    requestKey: uuid,
    id: uuid,
    expectedVersion: version,
    title: z.string().trim().min(1).max(160),
    tags,
    archived: z.boolean(),
    reason,
  })
  .strict();
const linkInput = z
  .object({
    requestKey: uuid,
    id: uuid,
    expectedVersion: version,
    target,
    reason,
  })
  .strict();
const hash = (v) => createHash("sha256").update(v).digest("hex");
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export function identifyFile(bytes) {
  const b = Buffer.from(bytes);
  if (!b.length || b.length > MAX_DOCUMENT_BYTES)
    fail("Choose a file between 1 byte and 10 MiB.", 413);
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "image/jpeg";
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  fail(
    "Upload a PDF, PNG, JPEG or WebP document. The file contents must match a supported format.",
    415,
  );
}
export function createDocuments({ storage, identity }) {
  const db = storage.database;
  migrate(db, "_documents_migrations", [{ version: 1, sql: documentsSchema }]);
  const requireWriter = (user) => {
    if (!writer(user))
      fail("Your account cannot access ticket documents.", 403);
  };
  const requireAdmin = (user) => {
    if (!admin(user))
      fail("Owner or administrator document management required.", 403);
  };
  function resolveTarget(user, raw) {
    requireWriter(user);
    const t = parse(target, raw);
    if (t.jobId) {
      const job = db
        .prepare("SELECT technician_id FROM jobs WHERE id=?")
        .get(t.jobId);
      if (!job) fail("Job not found.", 404);
      if (
        !admin(user) &&
        (!job.technician_id ||
          identity.technician(user)?.technician_id !== job.technician_id)
      )
        fail(
          "Only the assigned technician can access this ticket document.",
          403,
        );
    }
    if (t.orderId || t.receiptId) requireAdmin(user);
    if (t.receiptId) {
      const row = db
        .prepare("SELECT order_id FROM _purch_receipts WHERE id=?")
        .get(t.receiptId);
      if (!row) fail("Purchase receipt not found.", 404);
      if (t.orderId && t.orderId !== row.order_id)
        fail("The receipt belongs to a different PO.");
      t.orderId = row.order_id;
    }
    if (
      t.orderId &&
      !db.prepare("SELECT 1 FROM _purch_orders WHERE id=?").get(t.orderId)
    )
      fail("Purchase order not found.", 404);
    return t;
  }
  const links = (id) =>
    db
      .prepare(
        "SELECT * FROM _document_links WHERE document_id=? ORDER BY created_at,id",
      )
      .all(id);
  const record = (id) => {
    const r = db
      .prepare(
        "SELECT d.*,b.sha256,b.size_bytes,b.media_type FROM _document_records d JOIN _document_blobs b ON b.id=d.blob_id WHERE d.id=?",
      )
      .get(id);
    if (!r) fail("Document not found.", 404);
    const { blob_id, tags_json, ...metadata } = r;
    return {
      ...metadata,
      tags: JSON.parse(tags_json),
      scanStatus: "not_scanned",
    };
  };
  function canRead(user, id) {
    requireWriter(user);
    if (admin(user)) return;
    if (
      !links(id).some((l) => {
        if (!l.job_id) return false;
        const job = db
          .prepare("SELECT technician_id FROM jobs WHERE id=?")
          .get(l.job_id);
        return (
          job?.technician_id &&
          job.technician_id === identity.technician(user)?.technician_id
        );
      })
    )
      fail("This document is not available to your account.", 403);
  }
  function output(user, id) {
    canRead(user, id);
    const r = record(id);
    return {
      ...r,
      canManage: admin(user),
      links: links(id).filter(
        (l) =>
          admin(user) ||
          (l.job_id &&
            db
              .prepare("SELECT technician_id FROM jobs WHERE id=?")
              .get(l.job_id)?.technician_id ===
              identity.technician(user)?.technician_id),
      ),
    };
  }
  const audit = (user, action, id, before, after, notes) =>
    db
      .prepare(
        "INSERT INTO _document_audit(actor_id,action,document_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
      )
      .run(
        user.id,
        action,
        id,
        JSON.stringify(before ?? null),
        JSON.stringify(after),
        notes,
      );
  function command(user, kind, d, extra, work) {
    requireWriter(user);
    const fingerprint = hash(
      JSON.stringify({ actor: user.id, kind, data: d, extra }),
    );
    return transaction(db, () => {
      const prior = db
        .prepare("SELECT * FROM _document_requests WHERE request_key=?")
        .get(d.requestKey);
      if (prior) {
        if (prior.actor_id !== user.id)
          fail("This document request belongs to another actor.", 403);
        if (prior.request_hash !== fingerprint)
          fail(
            "This request key was already used for different document data.",
            409,
          );
        const result = JSON.parse(prior.response_json);
        canRead(user, result.id);
        return { ...result, replayed: true };
      }
      const result = work();
      db.prepare(
        "INSERT INTO _document_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)",
      ).run(d.requestKey, user.id, fingerprint, JSON.stringify(result));
      return { ...result, replayed: false };
    });
  }
  function addLinks(user, id, t) {
    for (const [field, column] of [
      ["jobId", "job_id"],
      ["orderId", "order_id"],
      ["receiptId", "receipt_id"],
    ])
      if (t[field])
        db.prepare(
          `INSERT OR IGNORE INTO _document_links(id,document_id,${column},actor_id) VALUES(?,?,?,?)`,
        ).run(randomUUID(), id, t[field], user.id);
  }
  function upload(user, raw, bytes, originalName) {
    requireWriter(user);
    const d = parse(uploadInput, raw),
      mediaType = identifyFile(bytes),
      digest = hash(bytes);
    if (typeof originalName !== "string") fail("Choose a named file.");
    const name =
      originalName
        .replaceAll("\\", "/")
        .split("/")
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 200) || "document";
    // Recheck target authorization on replay as well as on first insertion.
    resolveTarget(user, d.target);
    return command(
      user,
      "upload",
      d,
      { digest, name, mediaType, size: bytes.length },
      () => {
        const t = resolveTarget(user, d.target),
          existing = db
            .prepare("SELECT id FROM _document_blobs WHERE sha256=?")
            .get(digest),
          blobId = existing?.id || randomUUID(),
          id = randomUUID();
        if (!existing)
          db.prepare(
            "INSERT INTO _document_blobs(id,sha256,size_bytes,media_type,bytes) VALUES(?,?,?,?,?)",
          ).run(blobId, digest, bytes.length, mediaType, Buffer.from(bytes));
        db.prepare(
          "INSERT INTO _document_records(id,blob_id,actor_id,title,original_name,tags_json) VALUES(?,?,?,?,?,?)",
        ).run(id, blobId, user.id, d.title, name, JSON.stringify(d.tags));
        addLinks(user, id, t);
        audit(
          user,
          "uploaded",
          id,
          null,
          { ...record(id), links: links(id) },
          "User uploaded supporting document",
        );
        return { id, version: 1 };
      },
    );
  }
  function list(
    user,
    raw,
    { page = 1, tag = "", includeArchived = false } = {},
  ) {
    return transaction(db, () => {
      const t = resolveTarget(user, raw);
      if (Object.keys(raw).length !== 1)
        fail("Filter documents by one job, PO or receipt.");
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > 100000 ||
        typeof tag !== "string" ||
        tag.length > 32
      )
        fail("Choose valid document filters.");
      if (includeArchived) requireAdmin(user);
      const column = raw.receiptId
          ? "receipt_id"
          : raw.orderId
            ? "order_id"
            : "job_id",
        id = raw.receiptId || raw.orderId || raw.jobId;
      const rows = db
        .prepare(
          `SELECT DISTINCT d.id,d.created_at,d.rowid FROM _document_links l JOIN _document_records d ON d.id=l.document_id WHERE l.${column}=? AND (?=1 OR d.archived=0) AND (?='' OR EXISTS(SELECT 1 FROM json_each(d.tags_json) WHERE value=?)) ORDER BY d.created_at DESC,d.rowid DESC LIMIT 51 OFFSET ?`,
        )
        .all(
          id,
          Number(includeArchived),
          tag.toLowerCase(),
          tag.toLowerCase(),
          (page - 1) * 50,
        );
      return {
        documents: rows.slice(0, 50).map((r) => output(user, r.id)),
        page,
        hasMore: rows.length > 50,
        canManage: admin(user),
      };
    });
  }
  function download(user, id) {
    return transaction(db, () => {
      canRead(user, id);
      const r = record(id);
      if (r.archived)
        fail("Restore this archived document before downloading.", 410);
      const row = db
          .prepare(
            "SELECT b.bytes FROM _document_records d JOIN _document_blobs b ON b.id=d.blob_id WHERE d.id=?",
          )
          .get(id),
        bytes = Buffer.from(row.bytes);
      if (hash(bytes) !== r.sha256)
        fail(
          "Document integrity check failed. Ask an administrator to restore the file.",
          500,
        );
      return { metadata: r, bytes };
    });
  }
  function edit(user, raw) {
    requireAdmin(user);
    const d = parse(editInput, raw);
    return command(user, "edit", d, null, () => {
      const before = record(d.id);
      if (before.version !== d.expectedVersion)
        fail("Document changed. Reload before editing.", 409);
      db.prepare(
        "UPDATE _document_records SET title=?,tags_json=?,archived=?,version=version+1 WHERE id=?",
      ).run(d.title, JSON.stringify(d.tags), Number(d.archived), d.id);
      audit(user, "metadata_updated", d.id, before, record(d.id), d.reason);
      return { id: d.id, version: before.version + 1 };
    });
  }
  function link(user, raw) {
    requireAdmin(user);
    const d = parse(linkInput, raw);
    resolveTarget(user, d.target);
    return command(user, "linked", d, null, () => {
      const before = output(user, d.id);
      if (before.version !== d.expectedVersion)
        fail("Document changed. Reload before importing.", 409);
      if (before.archived) fail("Restore the document before importing.", 409);
      const t = resolveTarget(user, d.target);
      addLinks(user, d.id, t);
      db.prepare(
        "UPDATE _document_records SET version=version+1 WHERE id=?",
      ).run(d.id);
      audit(user, "linked", d.id, before, output(user, d.id), d.reason);
      return { id: d.id, version: before.version + 1 };
    });
  }
  return { upload, list, download, edit, link };
}
