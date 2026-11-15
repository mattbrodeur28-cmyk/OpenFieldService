import { useEffect, useState } from "preact/hooks";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { useCompanyTimeZone } from "../hooks/use-company-timezone";
import { formatTimestamp } from "../time-format";
import {
  documentQuery,
  type DocumentTarget,
  type TicketDocument,
  type DocumentList,
} from "../document-types";
import type { PurchaseOrder } from "../purchasing-types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import {
  Badge,
  Checkbox,
  EmptyState,
  Notice,
  Sheet,
  Table,
} from "./ui/surfaces";
const splitTags = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export function TicketDocuments({ target }: { target: DocumentTarget }) {
  const { user } = useAccount(),
    { readOnly } = useConnectivity(),
    company = useCompanyTimeZone();
  const [data, setData] = useState<DocumentList | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState(1),
    [tag, setTag] = useState(""),
    [archived, setArchived] = useState(false),
    [revision, setRevision] = useState(0);
  const [upload, setUpload] = useState(false),
    [edit, setEdit] = useState<TicketDocument | null>(null),
    [importing, setImport] = useState(false),
    query = documentQuery(target);
  useEffect(() => {
    let live = true;
    setError("");
    if (user.role !== "viewer")
      void accountRequest<DocumentList>(
        "/api/documents/records?" +
          query +
          "&page=" +
          page +
          "&tag=" +
          encodeURIComponent(tag) +
          "&includeArchived=" +
          archived,
      )
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            setData(null);
          }
        });
    return () => {
      live = false;
    };
  }, [query, page, tag, archived, revision, user.role]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("ofs:documents-changed", refresh);
    return () => window.removeEventListener("ofs:documents-changed", refresh);
  }, []);
  const saved = () => {
    setUpload(false);
    setEdit(null);
    setImport(false);
    setNotice("Document change saved.");
    window.dispatchEvent(new Event("ofs:documents-changed"));
  };
  if (user.role === "viewer") return null;
  return (
    <section class="detail-section ticket-documents">
      <header class="dispatch-title">
        <h3>Documents</h3>
        <div class="inventory-toolbar">
          <Button onClick={() => setRevision((v) => v + 1)}>
            Refresh documents
          </Button>
          {data && (
            <Button disabled={readOnly} onClick={() => setUpload(true)}>
              Upload packing slip / receipt
            </Button>
          )}
          {target.jobId && data?.canManage && (
            <Button disabled={readOnly} onClick={() => setImport(true)}>
              Import from purchase order
            </Button>
          )}
        </div>
      </header>
      <p class="workspace-help">
        Tagged supporting files stay linked to native tickets and purchasing
        records. New documents supplement the ticket; they do not change an
        approved service report.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      <div class="inventory-toolbar">
        <TextField
          label="Filter documents by tag"
          value={tag}
          maxLength={32}
          placeholder="packing slip, receipt…"
          onInput={(e) => {
            setTag(e.currentTarget.value);
            setPage(1);
          }}
        />
        {isAdministrator(user) && (
          <Checkbox
            label="Include archived documents"
            checked={archived}
            onChange={(e) => {
              setArchived(e.currentTarget.checked);
              setPage(1);
            }}
          />
        )}
      </div>
      {data && !data.documents.length && (
        <EmptyState title="No matching documents">
          {target.jobId
            ? "Upload a PDF or supported receipt/photo file, or import a purchase document onto this ticket."
            : "Upload a PDF or supported receipt/photo file for this purchase record."}
        </EmptyState>
      )}
      {!!data?.documents.length && (
        <Table label="Tagged documents">
          <thead>
            <tr>
              <th>Document</th>
              <th>Tags</th>
              <th>Recorded</th>
              <th>File</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <strong>{doc.title}</strong>
                  {doc.archived > 0 && <Badge>Archived</Badge>}
                </td>
                <td>
                  <div class="inventory-toolbar">
                    {doc.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </td>
                <td>
                  {formatTimestamp(
                    doc.created_at,
                    company.timeZone || undefined,
                  )}
                </td>
                <td>
                  {doc.original_name}
                  <small class="workspace-help">
                    {" "}
                    · {(doc.size_bytes / 1024).toFixed(1)} KiB
                  </small>
                  <small
                    class="workspace-help"
                    title="Stored without a malware scanning service"
                  >
                    {" "}
                    · Not scanned
                  </small>
                </td>
                <td>
                  <div class="inventory-toolbar">
                    {!doc.archived && (
                      <a
                        class="btn ui-button"
                        href={"/api/documents/records/" + doc.id + "/download"}
                        download
                      >
                        Download original
                      </a>
                    )}
                    {doc.canManage && (
                      <Button disabled={readOnly} onClick={() => setEdit(doc)}>
                        Edit tags / archive
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && (
        <div class="inventory-toolbar">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous documents
          </Button>
          <span>Page {page}</span>
          <Button disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
            Next documents
          </Button>
        </div>
      )}
      {upload && (
        <UploadDocument
          target={target}
          disabled={readOnly}
          close={() => setUpload(false)}
          saved={saved}
        />
      )}
      {edit && (
        <EditDocument
          document={edit}
          disabled={readOnly}
          close={() => setEdit(null)}
          saved={saved}
        />
      )}
      {importing && target.jobId && (
        <ImportDocument
          jobId={target.jobId}
          disabled={readOnly}
          close={() => setImport(false)}
          saved={saved}
        />
      )}
    </section>
  );
}
interface Props {
  disabled: boolean;
  close(): void;
  saved(): void;
}
function UploadDocument({
  target,
  disabled,
  close,
  saved,
}: Props & { target: DocumentTarget }) {
  const [title, setTitle] = useState(""),
    [tags, setTags] = useState(target.jobId ? "receipt" : "packing slip"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<{ file: File; metadata: object } | null>(
      null,
    ),
    [key, setKey] = useState(() => crypto.randomUUID());
  const locked = disabled || busy || attempt !== null;
  return (
    <Sheet close={close}>
      <DialogTitle>Upload tagged document</DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (disabled || busy || !file) return;
          setBusy(true);
          setError("");
          try {
            if (file.size === 0 || file.size > 10 * 1024 * 1024)
              throw Error("Choose a nonempty file up to 10 MiB.");
            const request = attempt || {
              file,
              metadata: {
                requestKey: key,
                title,
                tags: splitTags(tags),
                target,
              },
            };
            setAttempt(request);
            const body = new FormData();
            body.append("file", request.file);
            body.append("metadata", JSON.stringify(request.metadata));
            const response = await fetch("/api/documents/upload", {
              method: "POST",
              credentials: "same-origin",
              headers: { "X-Requested-With": "OpenFieldService" },
              body,
            });
            if (response.status === 401)
              window.dispatchEvent(new Event("ofs:auth-required"));
            const data = await response.json();
            if (!response.ok) {
              if ([400, 413, 415].includes(response.status)) {
                setAttempt(null);
                setKey(crypto.randomUUID());
              }
              throw Error(data.error || "Document upload failed.");
            }
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Document file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          disabled={locked}
          onChange={(e) => {
            const chosen = e.currentTarget.files?.[0] || null;
            setFile(chosen);
            if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
          }}
        />
        <TextField
          label="Document title"
          required
          maxLength={160}
          value={title}
          disabled={locked}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <TextField
          label="Tags (comma separated)"
          required
          value={tags}
          disabled={locked}
          maxLength={395}
          hint="For example: packing slip, receipt, invoice, photo, service report. Up to 12 tags."
          onInput={(e) => setTags(e.currentTarget.value)}
        />
        <p class="workspace-help">
          PDF, PNG, JPEG or WebP · up to 10 MiB. Stored privately as the
          original file; downloads require current record access. Files are not
          scanned by this pilot.
        </p>
        {attempt && (
          <Notice>
            Retry preserves the same file and request. Before uploading again
            after an uncertain result, close and refresh the document list.
          </Notice>
        )}
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || busy || !file}
          >
            {attempt ? "Retry same upload" : "Upload document"}
          </Button>
          <Button disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function EditDocument({
  document: d,
  disabled,
  close,
  saved,
}: Props & { document: TicketDocument }) {
  const [title, setTitle] = useState(d.title),
    [tags, setTags] = useState(d.tags.join(", ")),
    [archived, setArchived] = useState(!!d.archived),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState<unknown | null>(null),
    [key] = useState(() => crypto.randomUUID());
  const locked = disabled || busy || attempt !== null;
  return (
    <Sheet close={close}>
      <DialogTitle>Edit document tags / archive</DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            const body = attempt || {
              requestKey: key,
              id: d.id,
              expectedVersion: d.version,
              title,
              tags: splitTags(tags),
              archived,
              reason,
            };
            setAttempt(body);
            await accountRequest("/api/documents/edit", "POST", body);
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Document title"
          required
          maxLength={160}
          value={title}
          disabled={locked}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <TextField
          label="Tags (comma separated)"
          required
          maxLength={395}
          value={tags}
          disabled={locked}
          onInput={(e) => setTags(e.currentTarget.value)}
        />
        <Checkbox
          label="Archived (hide file from all linked records)"
          checked={archived}
          disabled={locked}
          onChange={(e) => setArchived(e.currentTarget.checked)}
        />
        <TextField
          label="Document change reason"
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          disabled={locked}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <p class="workspace-help">
          Archiving is reversible. Original bytes and link/audit history stay
          retained; archived documents must be restored before download.
        </p>
        <div class="inventory-toolbar">
          <Button type="submit" variant="primary" disabled={disabled || busy}>
            {attempt ? "Retry same change" : "Save document changes"}
          </Button>
          <Button disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function ImportDocument({
  jobId,
  disabled,
  close,
  saved,
}: Props & { jobId: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]),
    [search, setSearch] = useState(""),
    [orderPage, setOrderPage] = useState(1),
    [moreOrders, setMoreOrders] = useState(false),
    [filePage, setFilePage] = useState(1),
    [moreFiles, setMoreFiles] = useState(false),
    [order, setOrder] = useState("none"),
    [files, setFiles] = useState<TicketDocument[]>([]),
    [selected, setSelected] = useState("none"),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState<unknown | null>(null),
    [key] = useState(() => crypto.randomUUID());
  const locked = disabled || busy || attempt !== null;
  useEffect(() => {
    let live = true;
    void accountRequest<{ orders: PurchaseOrder[]; hasMore: boolean }>(
      "/api/service/purchasing/orders?page=" +
        orderPage +
        "&search=" +
        encodeURIComponent(search),
    )
      .then((d) => {
        if (live) {
          setOrders(d.orders);
          setMoreOrders(d.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [search, orderPage]);
  useEffect(() => {
    let live = true;
    setFiles([]);
    setSelected("none");
    if (order !== "none")
      void accountRequest<DocumentList>(
        "/api/documents/records?orderId=" + order + "&page=" + filePage,
      )
        .then((d) => {
          if (live) {
            setFiles(d.documents);
            setMoreFiles(d.hasMore);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [order, filePage]);
  const doc = files.find((f) => f.id === selected);
  return (
    <Sheet close={close}>
      <DialogTitle>Import purchase document to ticket</DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!doc || disabled || busy) return;
          setBusy(true);
          setError("");
          try {
            const body = attempt || {
              requestKey: key,
              id: doc.id,
              expectedVersion: doc.version,
              target: { jobId },
              reason,
            };
            setAttempt(body);
            await accountRequest("/api/documents/link", "POST", body);
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Find source PO"
          value={search}
          maxLength={120}
          disabled={locked}
          placeholder="PO number or supplier"
          onInput={(e) => {
            setSearch(e.currentTarget.value);
            setOrderPage(1);
            setOrder("none");
          }}
        />
        <Select
          label="Source purchase order"
          value={order}
          disabled={locked}
          options={[
            { value: "none", label: "Choose PO from this page" },
            ...orders.map((p) => ({
              value: p.id,
              label: p.number + " · " + p.supplier_name,
            })),
          ]}
          onValueChange={(value) => {
            setOrder(value);
            setFilePage(1);
          }}
        />
        <div class="inventory-toolbar">
          <Button
            disabled={locked || orderPage === 1}
            onClick={() => {
              setOrderPage(orderPage - 1);
              setOrder("none");
            }}
          >
            Previous source POs
          </Button>
          <span>PO page {orderPage}</span>
          <Button
            disabled={locked || !moreOrders}
            onClick={() => {
              setOrderPage(orderPage + 1);
              setOrder("none");
            }}
          >
            Next source POs
          </Button>
        </div>
        <Select
          label="Source document"
          value={selected}
          disabled={locked || !files.length}
          options={[
            { value: "none", label: "Choose uploaded document from this page" },
            ...files.map((f) => ({
              value: f.id,
              label: f.title + " · " + f.tags.join(", "),
            })),
          ]}
          onValueChange={setSelected}
        />
        {order !== "none" && (
          <div class="inventory-toolbar">
            <Button
              disabled={locked || filePage === 1}
              onClick={() => setFilePage(filePage - 1)}
            >
              Previous source files
            </Button>
            <span>File page {filePage}</span>
            <Button
              disabled={locked || !moreFiles}
              onClick={() => setFilePage(filePage + 1)}
            >
              Next source files
            </Button>
          </div>
        )}
        {order !== "none" && !files.length && (
          <p class="workspace-help">
            No uploaded documents on this PO. Upload a packing slip or receipt
            from Purchasing first.
          </p>
        )}
        <TextField
          label="Import / ticket association reason"
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          disabled={locked}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <p class="workspace-help">
          Links the original document to this ticket. No duplicate file or
          material usage is created. The file becomes available to the assigned
          technician.
        </p>
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || busy || !doc}
          >
            {attempt ? "Retry same import" : "Import to ticket"}
          </Button>
          <Button disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
