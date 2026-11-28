import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { useGuardedCommand } from "../hooks/use-guarded-command";
import type { Issuer, IssuerConfig, IssuerPage } from "../quote-lifecycle-types";
import { Dialog, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Textarea, Notice } from "./ui/surfaces";

function resizeLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read logo file."));
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read logo image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unsupported image format. Use PNG, JPG, WebP, or SVG."));
      img.onload = () => {
        const maxW = 600;
        const maxH = 260;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxW || h > maxH) {
          const scale = Math.min(maxW / w, maxH / h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result || ""));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const png = canvas.toDataURL("image/png");
        resolve(png.length > 650000 ? canvas.toDataURL("image/jpeg", 0.85) : png);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function IssuerDialog({
  issuer,
  close,
  saved,
}: {
  issuer: Issuer | null;
  close(): void;
  saved(): void;
}) {
  const { readOnly } = useConnectivity();
  const [config, setConfig] = useState<IssuerConfig>(
    issuer?.config ?? {
      schemaVersion: 1,
      legalName: "",
      address: "",
      email: "",
      phone: "",
      terms: "",
      reviewNote: "Updated via Quote Issuer settings",
      logoDataUrl: "",
    },
  );
  const [companyInfo, setCompanyInfo] = useState<{
    name: string;
    phone: string;
    email: string;
    address: string;
  } | null>(null);
  const [logoError, setLogoError] = useState("");
  const command = useGuardedCommand<
    { requestKey: string; expectedVersion: number; config: IssuerConfig },
    { issuer: Issuer }
  >("/api/sales/quote-issuer", saved);
  const disabled = command.busy || command.uncertain || readOnly;
  const patch = (value: Partial<IssuerConfig>) => {
    command.changed();
    setConfig((current) => ({ ...current, ...value }));
  };

  // Load Business Name, Phone, Email, Address from Business Setup
  useEffect(() => {
    let live = true;
    void accountRequest<{ values?: Record<string, string> }>("/api/workspace/configuration")
      .then((res) => {
        if (!live) return;
        const v = res.values || {};
        const info = {
          name: (v.COMPANY_NAME || "").trim(),
          phone: (v.COMPANY_PHONE || "").trim(),
          email: (v.COMPANY_EMAIL || "").trim(),
          address: (v.COMPANY_ADDRESS || "").trim(),
        };
        setCompanyInfo(info);
        // Auto-populate any blank fields from Business Setup
        setConfig((cur) => ({
          ...cur,
          legalName: cur.legalName || info.name,
          phone: cur.phone || info.phone,
          email: cur.email || info.email,
          address: cur.address || info.address,
        }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function onLogoPick(e: Event) {
    setLogoError("");
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeLogoFile(file);
      patch({ logoDataUrl: dataUrl });
    } catch (err) {
      setLogoError((err as Error).message || "Could not process logo image.");
    }
  }

  const attemptClose = () => {
    if (command.canClose()) close();
  };

  return (
    <Dialog class="quote-document-dialog" close={attemptClose}>
      <DialogTitle>Quote issuer and terms</DialogTitle>
      <p class="workspace-help">
        Business details, company logo, and contract terms shown on customer quotes and PDFs.
        {companyInfo?.name ? ` Synced with Business Setup (${companyInfo.name}).` : ""}
      </p>
      {command.error && <Notice tone="danger">{command.error}</Notice>}
      {logoError && <Notice tone="danger">{logoError}</Notice>}
      {command.uncertain && (
        <Notice tone="warning">
          Save outcome uncertain. Retry the exact command before closing.
        </Notice>
      )}

      <div class="ui-field" style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
          Company logo (shown on Customer PDF quotes)
        </label>
        {config.logoDataUrl && (
          <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              src={config.logoDataUrl}
              alt="Company logo preview"
              style={{
                maxHeight: "64px",
                maxWidth: "240px",
                objectFit: "contain",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "6px",
                background: "#fff",
              }}
            />
            <Button disabled={disabled} onClick={() => patch({ logoDataUrl: "" })}>
              Remove logo
            </Button>
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={disabled}
          onChange={(e) => void onLogoPick(e)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
        <TextField
          label="Business name"
          value={config.legalName}
          maxLength={200}
          disabled={disabled}
          onInput={(e) => patch({ legalName: e.currentTarget.value })}
        />
        <TextField
          label="Business phone"
          value={config.phone}
          maxLength={80}
          disabled={disabled}
          onInput={(e) => patch({ phone: e.currentTarget.value })}
        />
        <TextField
          label="Business email"
          type="email"
          value={config.email}
          maxLength={254}
          disabled={disabled}
          onInput={(e) => patch({ email: e.currentTarget.value })}
        />
      </div>

      <label class="ui-field" style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
        Business address
        <Textarea
          rows={3}
          value={config.address}
          maxLength={1000}
          disabled={disabled}
          onInput={(e) => patch({ address: e.currentTarget.value })}
        />
      </label>

      <label class="ui-field" style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
        Quote terms &amp; conditions
        <Textarea
          rows={14}
          style={{ minHeight: "260px", width: "100%", resize: "vertical" }}
          value={config.terms}
          maxLength={50000}
          disabled={disabled}
          onInput={(e) => patch({ terms: e.currentTarget.value })}
        />
      </label>

      <div class="integration-actions" style={{ marginTop: "16px", justifyContent: "space-between" }}>
        <div>
          {companyInfo && (companyInfo.name || companyInfo.phone || companyInfo.email) && (
            <Button
              disabled={disabled}
              onClick={() =>
                patch({
                  legalName: companyInfo.name || config.legalName,
                  phone: companyInfo.phone || config.phone,
                  email: companyInfo.email || config.email,
                  address: companyInfo.address || config.address,
                })
              }
            >
              Pull from Business Setup
            </Button>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button disabled={command.busy || command.uncertain} onClick={attemptClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={command.busy || readOnly}
            onClick={() =>
              void command.run({
                requestKey: crypto.randomUUID(),
                expectedVersion: issuer?.version ?? 0,
                config: {
                  ...config,
                  reviewNote: config.reviewNote?.trim() || "Updated via Quote Issuer settings",
                },
              })
            }
          >
            {command.uncertain ? "Retry exact save" : "Save issuer & terms"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function QuoteIssuerSettings() {
  const { readOnly } = useConnectivity();
  const [data, setData] = useState<IssuerPage | null>(null),
    [editing, setEditing] = useState(false),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    void accountRequest<IssuerPage>("/api/sales/quote-issuer?page=" + page)
      .then((data) => {
        if (live) setData(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [page, refresh]);
  return (
    <section class="settings-card">
      <h3>Quote issuer and business terms</h3>
      <p>
        Company logo, business details, and quote terms used in customer quotes and PDFs.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {data &&
        (data.issuer ? (
          <p>
            {data.issuer.config.legalName} · Version {data.issuer.version}
            {data.issuer.config.logoDataUrl ? " · Logo uploaded" : ""}
          </p>
        ) : (
          <Notice tone="warning">
            Configure your quote issuer and logo to brand customer quotes.
          </Notice>
        ))}
      <div class="integration-actions">
        <Button disabled={!data || readOnly} onClick={() => setEditing(true)}>
          Configure quote issuer
        </Button>
        <Button onClick={() => setRefresh((v) => v + 1)}>Refresh</Button>
      </div>
      {data && (
        <details>
          <summary>Issuer history</summary>
          {data.history.map((row) => (
            <div key={row.version}>
              <p>
                Version {row.version} · {row.config.legalName}
              </p>
            </div>
          ))}
          <div class="integration-actions">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Newer
            </Button>
            <Button disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
              Older
            </Button>
          </div>
        </details>
      )}
      {editing && data && (
        <IssuerDialog
          issuer={data.issuer}
          close={() => setEditing(false)}
          saved={() => {
            window.dispatchEvent(new Event("ofs:sales-config-changed"));
            setEditing(false);
            setRefresh((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}
