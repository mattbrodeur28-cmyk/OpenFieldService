import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ServiceIdentityError } from "../service/identity.mjs";
import { fail } from "../inventory/domain.mjs";
import { createDocuments, MAX_DOCUMENT_BYTES } from "./service.mjs";
export function createDocumentModule({ storage, identity, currentUser }) {
  const documents = createDocuments({ storage, identity }),
    app = new Hono();
  const check = (c) => {
    const u = currentUser(c);
    if (!u?.active) fail("Sign in to continue.", 401);
    if (u.mustChangePassword)
      fail("Change your temporary password first.", 403);
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("X-Requested-With") !== "OpenFieldService"
    )
      fail("Use the workspace application to change documents.", 403);
    return u;
  };
  app.use("*", async (c, next) => {
    check(c);
    c.header("Cache-Control", "private, no-store");
    return next();
  });
  const uploadLimit = bodyLimit({
      maxSize: MAX_DOCUMENT_BYTES + 65536,
      onError: (c) => c.json({ error: "Choose a file up to 10 MiB." }, 413),
    }),
    jsonLimit = bodyLimit({
      maxSize: 50000,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    });
  app.use("*", (c, next) =>
    (c.req.path.endsWith("/upload") ? uploadLimit : jsonLimit)(c, next),
  );
  app.onError((error, c) => {
    if (error instanceof ServiceIdentityError)
      return c.json({ error: error.message }, error.status);
    if (error?.name === "BodyLimitError")
      return c.json({ error: "Request too large." }, 413);
    console.error("Document operation failed:", error.name);
    return c.json(
      { error: "The document operation could not be completed." },
      500,
    );
  });
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch (e) {
      if (e?.name === "BodyLimitError") throw e;
      fail("Send valid JSON.");
    }
  };
  app.get("/records", (c) => {
    const t = {};
    for (const field of ["jobId", "orderId", "receiptId"])
      if (c.req.query(field)) t[field] = c.req.query(field);
    return c.json(
      documents.list(check(c), t, {
        page: Number(c.req.query("page") || 1),
        tag: c.req.query("tag") || "",
        includeArchived: c.req.query("includeArchived") === "true",
      }),
    );
  });
  app.post("/upload", async (c) => {
    let form;
    try {
      form = await c.req.raw.formData();
    } catch (e) {
      if (e?.name === "BodyLimitError") throw e;
      fail("Send a multipart file upload.");
    }
    if (
      [...form.keys()].some((key) => !["file", "metadata"].includes(key)) ||
      form.getAll("file").length !== 1 ||
      form.getAll("metadata").length !== 1
    )
      fail("Upload one file with document metadata.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_DOCUMENT_BYTES)
      fail("Choose one supported file up to 10 MiB.", 413);
    let metadata;
    try {
      metadata = JSON.parse(String(form.get("metadata")));
    } catch {
      fail("Send valid document metadata.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return c.json(documents.upload(check(c), metadata, bytes, file.name));
  });
  app.post("/edit", async (c) => {
    const d = await body(c);
    return c.json(documents.edit(check(c), d));
  });
  app.post("/link", async (c) => {
    const d = await body(c);
    return c.json(documents.link(check(c), d));
  });
  app.get("/records/:id/download", (c) => {
    const { metadata, bytes } = documents.download(check(c), c.req.param("id"));
    const suffix = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    }[metadata.media_type];
    const safeName =
      metadata.original_name.replace(/\.[^.]*$/, "") + "." + suffix;
    const name = encodeURIComponent(safeName).replace(
      /[!'()*]/g,
      (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": metadata.media_type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="document.${suffix}"; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
  return { ...documents, app };
}
