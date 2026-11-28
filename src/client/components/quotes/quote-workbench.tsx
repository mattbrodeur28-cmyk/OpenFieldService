import {QuoteConversionPanel} from "./quote-conversion";
import {CostingSheet} from "./costing-sheet";
import {Dialog,DialogTitle} from "../ui/dialog";
import { commandFailureIsDefinite } from "../../command-recovery.mjs";
import { TemplateCommandDialog } from "./template-command";
import { QuoteDocumentPreview } from "./document-preview";
import { useEffect, useRef, useState } from "preact/hooks";
import { accountRequest, AccountRequestError, useAccount, isAdministrator } from "../../auth";
import { useApp } from "../../context";
import { useConnectivity } from "../../hooks/use-connectivity";
import { FileText, ChevronDown } from "lucide-preact";
import { useCompanyTimeZone } from "../../hooks/use-company-timezone";
import { dayInZone, shiftDate } from "../../dispatch-layout.mjs";
import { formatTimestamp } from "../../time-format";
import { quoteMoney as salesMoney } from "../../quote-input.mjs";
import type { SalesDetail } from "../../sales-types";
import type { BillingProfile } from "../../estimating-types";
import type {
  DraftLine,
  TemplateReference,
  TemplateSummary,
  InstantiatedTemplate,
  EstimateInput,
  EstimateResult,
  MaterialCost,
  Quote,
  QuoteCommand,
  QuoteDetail,
  QuoteDocument,
  QuoteOpportunity,
} from "../../quote-types";
import { lineInput, editLine, templateInput } from "../../quote-input.mjs";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import {
  Textarea,
  Badge,
  Card,
  LoadingState,
  Notice,
  EmptyState,
} from "../ui/surfaces";
import { SearchPicker } from "./search-picker";
import { QuoteLineEditor } from "./line-editor";
import { MarkdownField } from "./markdown-field";

function freshLine(): DraftLine {
  return {
    id: crypto.randomUUID(),
    kind: "technician",
    description: "Technician labor",
    quantity: "1.000",
    headcount: "1",
    unitCost: "0.00",
    unitSell: "0.00",
    discount: "0.00",
    materialId: null,
    costOverrideReason: "",
    travelGroup: "",
    includesFuel: false,
  };
}

function QuoteSection({ title, class: className = "", defaultOpen = true, children }: { title: string; class?: string; defaultOpen?: boolean; children: preact.ComponentChildren }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section class={"record-section " + className + (open ? " is-open" : "")}>
      <button type="button" class="record-section-heading" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={16} class={"record-section-chevron" + (open ? "" : " is-closed")} />
        <span class="record-section-title">{title}</span>
      </button>
      {open && <div class="record-section-body">{children}</div>}
    </section>
  );
}

function QuoteStage({ status, reviewStatus }: { status?: string; reviewStatus?: string }) {
  const stages = [
    { key: "draft", label: "Draft", tone: "neutral" },
    { key: "review", label: "Bid review", tone: "info" },
    { key: "offered", label: "Offered", tone: "warning" },
    { key: "accepted", label: "Accepted", tone: "success" },
  ];
  let current = 0;
  if (status === "accepted") current = 3;
  else if (status === "offered") current = 2;
  else if (reviewStatus) current = 1;
  return (
    <div class="quote-stage" role="list" aria-label="Quote pipeline status">
      {stages.map((stage, index) => (
        <div key={stage.key} role="listitem" class={"quote-stage-step" + (index < current ? " is-done" : index === current ? " is-current tone-" + stage.tone : "")}>
          <span class="quote-stage-dot">{index < current ? "✓" : index + 1}</span>
          <span class="quote-stage-label">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

export function QuoteWorkbench({ quoteId }: { quoteId: string }) {
  const { user } = useAccount();
  const { navigate, customers } = useApp(),
    { readOnly } = useConnectivity(),
    company = useCompanyTimeZone();
  const [saved, setSaved] = useState<Quote | null>(null),
    [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [opportunity, setOpportunity] = useState<QuoteOpportunity | null>(null),
    [opportunityList, setOpportunityList] = useState<QuoteOpportunity[]>([]),
    [selectedCustomerId, setSelectedCustomerId] = useState<string>(""),
    [profile, setProfile] = useState<BillingProfile | null>(null),
    [latestProfile, setLatestProfile] = useState<BillingProfile | null>(null);
  useEffect(() => {
    if (quoteId !== "new") return;
    let live = true;
    accountRequest<{ rows?: QuoteOpportunity[] }>("/api/sales/quotes/options?kind=opportunities&page=1")
      .then((r) => {
        if (!live) return;
        const rows = r.rows ?? [];
        setOpportunityList(rows);
        if (rows[0]) setOpportunity((cur) => cur || rows[0]);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [quoteId]);
  // If no opportunity yet but a customer is selected, load an active billing profile for that customer's segment
  useEffect(() => {
    if (profile || opportunity || !selectedCustomerId) return;
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const seg = (cust as any)?.customer_type === "commercial" ? "commercial" : "residential";
    let live = true;
    accountRequest<{ profiles: BillingProfile[] }>(`/api/sales/billing-profiles?segment=${seg}`)
      .then((r) => {
        const p = (r.profiles ?? []).find((x) => x.config.active && !x.requiresReview);
        if (live && p) { setProfile(p); setLatestProfile(p); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [selectedCustomerId, opportunity, profile, customers]);
  const [oppContact, setOppContact] = useState<string | null>(null);
  useEffect(() => {
    const id = saved?.opportunityId;
    if (!id) { setOppContact(null); return; }
    let live = true;
    accountRequest<{ opportunity: { contact_name?: string } }>(`/api/sales/opportunities/${id}`)
      .then((r) => { if (live) setOppContact(r.opportunity?.contact_name || null); })
      .catch(() => { if (live) setOppContact(null); });
    return () => { live = false; };
  }, [saved?.opportunityId]);
  useEffect(() => {
    if (profile || !opportunity) return;
    let live = true;
    accountRequest<{ profiles: BillingProfile[] }>(`/api/sales/billing-profiles?segment=${opportunity.segment}`)
      .then((r) => { const p = (r.profiles ?? []).find((x) => x.config.active && !x.requiresReview); if (live && p) { setProfile(p); setLatestProfile(p); } })
      .catch(() => {});
    return () => { live = false; };
  }, [opportunity, profile]);
  const [document, setDocument] = useState<QuoteDocument>({
    title: "",
    scope: "",
    exclusions: "",
    validUntil: "",
  });
  const [pricingDate, setPricingDate] = useState(""),
    [lines, setLines] = useState<DraftLine[]>([freshLine()]);
  const [materials, setMaterials] = useState<Record<string, MaterialCost>>({}),
    [preview, setPreview] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(quoteId !== "new"),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [refreshingLines, setRefreshingLines] = useState<string[]>([]);
  const [documentOpen, setDocumentOpen] = useState(false),
    [publishingTemplate,setPublishingTemplate] = useState(false),
    [templateRefresh,setTemplateRefresh] = useState(0),
    [lineDetails,setLineDetails] = useState<string|null>(null),
    [reviewRefresh,setReviewRefresh] = useState(0),
    [template,setTemplate] = useState<TemplateReference|null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef<QuoteCommand | null>(null),
    alive = useRef(true),
    skipGuard = useRef(false),
    loadSequence = useRef(0),
    editEpoch = useRef(0),
    previewInput = useRef<EstimateInput | null>(null);
  const resourceBusy = refreshingLines.length > 0;
  const guard = useRef({ dirty, busy, uncertain });
  guard.current = { dirty, busy: busy || resourceBusy, uncertain };
  const historical = !!saved && saved.revision !== saved.version;
  const lockedQuote = !!saved && saved.status !== "draft";
  const disabled =
    busy ||
    resourceBusy ||
    loading ||
    readOnly ||
    uncertain ||
    historical ||
    lockedQuote;
  useEffect(() => {
    alive.current = true;
    const beforeNavigate = (event: Event) => {
      if (skipGuard.current) {
        skipGuard.current = false;
        return;
      }
      const current = guard.current;
      if (current.busy || current.uncertain) {
        event.preventDefault();
        setError(
          current.uncertain
            ? "Resolve the pending save before leaving this quote."
            : "Wait for the current quote operation before leaving.",
        );
      } else if (
        current.dirty &&
        !window.confirm("Discard unsaved quote changes?")
      )
        event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        guard.current.dirty ||
        guard.current.busy ||
        guard.current.uncertain
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("ofs:before-navigation", beforeNavigate);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      alive.current = false;
      loadSequence.current++;
      window.removeEventListener("ofs:before-navigation", beforeNavigate);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    if (company.timeZone && quoteId === "new") {
      const today = dayInZone(company.timeZone);
      setPricingDate((current) => current || today);
      setDocument((current) => ({
        ...current,
        validUntil: current.validUntil || shiftDate(today, 30),
      }));
    }
  }, [company.timeZone]);
  async function load(revision?: number, historyPage = 1) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        historyPage: String(historyPage),
        ...(revision ? { revision: String(revision) } : {}),
      });
      const result = await accountRequest<QuoteDetail>(
        "/api/sales/quotes/" + quoteId + "?" + query,
      );
      const row = result.quote;
      const context = await Promise.allSettled([
        accountRequest<SalesDetail>(
          "/api/sales/opportunities/" + row.opportunityId,
        ),
        accountRequest<{ profile: BillingProfile }>(
          "/api/sales/billing-profiles/" + row.estimate.profileId,
        ),
      ]);
      if (!alive.current || sequence !== loadSequence.current) return;
      setSaved(row);
      setDetail(result);
      setDocument(row.document);
      setTemplate(row.template??null);
      setPricingDate(row.estimate.pricingDate);
      setLines(row.estimate.lines.map(editLine));
      setPreview(row.estimate);
      previewInput.current = null;
      setMaterials(
        Object.fromEntries(
          row.estimate.materialSnapshots.map((item) => [item.id, item]),
        ),
      );
      setProfile({
        id: row.estimate.profileId,
        version: row.estimate.profileVersion,
        config: row.estimate.profile,
        requiresReview: false,
        updatedAt: row.savedAt,
      });
      if (context[0].status === "fulfilled") {
        const current = context[0].value.opportunity;
        setOpportunity({
          id: current.id,
          title: current.title,
          version: current.version,
          segment: current.segment,
          customerName: current.customer_name || current.prospect_name,
        });
      } else {
        setOpportunity(null);
        setError(
          "Saved revision loaded; current opportunity could not be loaded. Refresh before editing.",
        );
      }
      setLatestProfile(
        context[1].status === "fulfilled" ? context[1].value.profile : null,
      );
      setDirty(false);
      setUncertain(false);
      pending.current = null;
    } catch (e) {
      if (alive.current && sequence === loadSequence.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (quoteId !== "new") void load();
  }, [quoteId]);
  function changed() {
    editEpoch.current++;
    previewInput.current = null;
    setDirty(true);
    setPreview(null);
    setNotice("");
  }
  function patchDocument(patch: Partial<QuoteDocument>) {
    changed();
    setDocument((current) => ({ ...current, ...patch }));
  }
  function patchLine(id: string, patch: Partial<DraftLine>) {
    changed();
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }
  async function ensureOpportunityAndProfile(): Promise<{ opp: QuoteOpportunity; prof: BillingProfile }> {
    let opp = opportunity;
    if (!opp) {
      if (!selectedCustomerId) {
        throw new Error("Select a customer (or an existing opportunity) before saving.");
      }
      const cust = customers.find((c) => c.id === selectedCustomerId);
      const seg: "commercial" | "residential" =
        (cust as any)?.customer_type === "commercial" ? "commercial" : "residential";
      const pipes = await accountRequest<{ pipelines: { id: string; stages: { id: string; kind: string; probability: number }[] }[] }>("/api/sales/pipelines");
      const pipe = pipes.pipelines?.[0];
      const openStage = pipe?.stages?.find((s) => s.kind === "open");
      if (!pipe || !openStage) {
        throw new Error("Configure a Sales pipeline with an open stage before creating a quote.");
      }
      const created = await accountRequest<{ opportunity: { id: string; title: string; version: number; segment: "commercial" | "residential"; customer_name?: string; prospect_name?: string } }>(
        "/api/sales/opportunities",
        "POST",
        {
          title: document.title.trim() || `${cust?.name || "Customer"} Quote`,
          pipelineId: pipe.id,
          stageId: openStage.id,
          ownerId: user.id,
          prospectName: cust?.name || "",
          contactName: "",
          contactEmail: cust?.email || "",
          contactPhone: cust?.phone || "",
          segment: seg,
          source: "Direct Quote",
          expectedValue: 0,
          probability: openStage.probability ?? 10,
          expectedCloseDate: "",
          nextAction: "",
          nextActionDate: "",
          customerId: selectedCustomerId,
          siteId: null,
          assetId: null,
          notes: "",
        },
      );
      opp = {
        id: created.opportunity.id,
        title: created.opportunity.title,
        version: created.opportunity.version,
        segment: created.opportunity.segment,
        customerName: created.opportunity.customer_name || cust?.name || "",
      };
      setOpportunity(opp);
    }

    let prof = profile;
    if (!prof) {
      const r = await accountRequest<{ profiles: BillingProfile[] }>(`/api/sales/billing-profiles?segment=${opp.segment}`);
      prof = (r.profiles ?? []).find((x) => x.config.active && !x.requiresReview) || null;
      if (!prof) {
        const all = await accountRequest<{ profiles: BillingProfile[] }>("/api/sales/billing-profiles?page=1");
        prof = (all.profiles ?? []).find((x) => x.config.active && !x.requiresReview) || null;
      }
      if (!prof) {
        throw new Error("Configure an active Billing Profile in Settings → Billing Profiles before saving.");
      }
      setProfile(prof);
      setLatestProfile(prof);
    }
    return { opp, prof };
  }
  function normalizeMoney(raw: string | undefined, allowBlank = false): string {
    const cleaned = String(raw ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
    if (!cleaned) return allowBlank ? "" : "0.00";
    return cleaned;
  }
  function build(overrideOpp?: QuoteOpportunity, overrideProf?: BillingProfile): EstimateInput {
    const opp = overrideOpp || opportunity;
    const prof = overrideProf || profile;
    if (!opp) throw new Error("Choose a customer or opportunity before saving.");
    if (!prof) throw new Error("Choose a reviewed billing profile in Settings → Billing Profiles before saving.");
    const effectiveLines = (lines.length ? lines : [freshLine()]).map((l) => ({
      ...l,
      description: l.description.trim() || document.title.trim() || "Line item",
      quantity: String(l.quantity ?? "").trim().replace(/,/g, "") || "1.000",
      headcount: String(l.headcount ?? "").trim() || "1",
      unitCost: normalizeMoney(l.unitCost, Boolean(l.pricingPending)),
      unitSell: normalizeMoney(l.unitSell, Boolean(l.pricingPending)),
      discount: normalizeMoney(l.discount, false),
      ...(l.materialMultiplier !== undefined ? { materialMultiplier: normalizeMoney(l.materialMultiplier, false) } : {}),
      ...(l.materialMisc !== undefined ? { materialMisc: normalizeMoney(l.materialMisc, false) } : {}),
    }));
    return {
      opportunityId: opp.id,
      expectedOpportunityVersion: opp.version,
      profileId: prof.id,
      expectedProfileVersion: prof.version,
      pricingDate,
      lines: effectiveLines.map(lineInput),
    };
  }
  async function refreshSources() {
    if (disabled || !opportunity) return;
    setBusy(true);
    setError("");
    try {
      const current = await accountRequest<SalesDetail>(
        "/api/sales/opportunities/" + opportunity.id,
      );
      const rules = profile
        ? await accountRequest<{ profile: BillingProfile }>(
            "/api/sales/billing-profiles/" + profile.id,
          )
        : null;
      if (!alive.current) return;
      const row = current.opportunity;
      changed();
      setOpportunity({
        id: row.id,
        title: row.title,
        version: row.version,
        segment: row.segment,
        customerName: row.customer_name || row.prospect_name,
      });
      setLatestProfile(rules?.profile ?? null);
      setNotice(
        "Linked records refreshed. Review changed billing rules and calculate prices again. Material costs can be refreshed on each line.",
      );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function calculate() {
    if (disabled) return;
    setError("");
    setBusy(true);
    try {
      const { opp, prof } = await ensureOpportunityAndProfile();
      const input = build(opp, prof);
      const epoch = editEpoch.current;
      const result = await accountRequest<EstimateResult>(
        "/api/sales/estimates/preview",
        "POST",
        input,
      );
      if (alive.current && epoch === editEpoch.current) {
        previewInput.current = input;
        setPreview(result);
        setMaterials(
          Object.fromEntries(
            result.materialSnapshots.map((item) => [item.id, item]),
          ),
        );
        setNotice("Calculated with the current server pricing evidence.");
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (busy || resourceBusy || readOnly || historical || lockedQuote) return;
    const recovering = uncertain && pending.current !== null;
    setError("");
    let command: QuoteCommand;
    setBusy(true);
    try {
      if (uncertain && pending.current) {
        command = pending.current;
      } else {
        if (!document.title.trim() || !document.scope.trim())
          throw new Error("Enter a quote title and scope before saving.");
        if (!document.validUntil || document.validUntil < pricingDate)
          throw new Error(
            "Choose a validity date on or after the pricing date.",
          );
        const { opp, prof } = await ensureOpportunityAndProfile();
        const input = build(opp, prof);
        // Automatically calculate prices if not yet calculated or inputs changed
        if (
          !preview ||
          preview.persisted ||
          JSON.stringify(input) !== JSON.stringify(previewInput.current)
        ) {
          const calc = await accountRequest<EstimateResult>(
            "/api/sales/estimates/preview",
            "POST",
            input,
          );
          if (!alive.current) return;
          previewInput.current = input;
          setPreview(calc);
          setMaterials(
            Object.fromEntries(
              calc.materialSnapshots.map((item) => [item.id, item]),
            ),
          );
        }
        command = {
          id: saved?.id ?? crypto.randomUUID(),
          requestKey: crypto.randomUUID(),
          expectedVersion: saved?.version ?? 0,
          document,
          estimate: input,
          template: templateInput(template),
        };
        pending.current = command;
      }
      const result = await accountRequest<{ quote: Quote }>(
        "/api/sales/quotes",
        "POST",
        command,
      );
      if (!alive.current) return;
      pending.current = null;
      setUncertain(false);
      setDirty(false);
      setSaved(result.quote);
      setPreview(result.quote.estimate);
      setNotice(
        `Saved ${result.quote.identifier} revision ${result.quote.revision}.`,
      );
      if (quoteId === "new") {
        skipGuard.current = true;
        navigate("/sales/quotes/" + result.quote.id);
      } else await load();
    } catch (e) {
      if (!alive.current) return;
      const definite =
        !(e instanceof AccountRequestError) ||
        commandFailureIsDefinite(e.status, recovering);
      setUncertain(!definite);
      if (definite) pending.current = null;
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function applyTemplate(row:TemplateSummary) {
    if(disabled||!opportunity)return;
    if(!window.confirm("Replace scope, exclusions and estimate lines with this template? Existing line edits will be replaced; billing rules and validity stay selected."))return;
    const epoch=editEpoch.current;
    setBusy(true);setError("");
    try{
      const result=await accountRequest<InstantiatedTemplate>(`/api/sales/quote-templates/${row.id}/instantiate`,"POST",{expectedTemplateVersion:row.version,opportunityId:opportunity.id,expectedOpportunityVersion:opportunity.version});
      if(!alive.current)return;
      if(editEpoch.current!==epoch)throw new Error("Quote inputs changed while loading the template. Apply it again after reviewing edits.");
      changed();setTemplate(result.template);
      setDocument(current=>({...current,...result.document}));
      setLines(result.lines.map(line=>{
        const draft=editLine({...line,unitCostCents:line.unitCostCents??0});
        return {...draft,unitCost:line.unitCostCents===null?"":draft.unitCost};
      }));
      setMaterials(Object.fromEntries(result.materialSnapshots.map(item=>[item.id,item])));
      setNotice(result.warnings.join(" "));
    }catch(e){if(alive.current)setError((e as Error).message);}
    finally{if(alive.current)setBusy(false);}
  }
  const profileChanged =
    !!profile &&
    !!latestProfile &&
    profile.id === latestProfile.id &&
    profile.version !== latestProfile.version;
  const savedEvidence = preview?.persisted;
  return (
    <div class="page quote-workbench">
      <div class="record-header account-record-header">
        <div class="record-header-main">
          <button class="btn btn-back" disabled={busy || uncertain} onClick={() => navigate("/sales/quotes")}>Back</button>
          <span class="account-icon" aria-hidden="true"><FileText size={20} /></span>
          <div>
            <span class="account-eyebrow">Quote</span>
            <h1 class="record-header-title">{saved?.identifier ?? "New quote"}</h1>
            <div class="record-header-subtitle">
              <span>{opportunity?.customerName || "No account"}</span>
              {oppContact && <span>{oppContact}</span>}
              <span>{saved ? `Revision ${saved.revision} of ${saved.version}` : "Not saved"}</span>
              {dirty && <span>Unsaved changes</span>}
            </div>
            <QuoteStage status={saved?.status} />
          </div>
        </div>
        <div class="page-header-right">
          {saved && (
            <Button disabled={busy||resourceBusy||loading||readOnly||uncertain||dirty} onClick={() => void load()}>
              Refresh
            </Button>
          )}
          {saved && isAdministrator(user) && <Button disabled={busy||resourceBusy||loading||dirty||uncertain||readOnly||saved.estimate.pricingComplete===false} onClick={()=>setPublishingTemplate(true)}>Save as template</Button>}
          {saved && <Button disabled={busy || resourceBusy || loading || dirty || uncertain || readOnly || saved.estimate.pricingComplete===false} onClick={() => setDocumentOpen(true)}>Draft document review</Button>}
          {saved && (
            <Button
              disabled={busy || resourceBusy || loading || dirty || uncertain || saved.estimate.pricingComplete === false}
              onClick={() => window.open(`/api/sales/quotes/${saved.id}/customer-proposal.html?revision=${saved.revision}&print=1`, "_blank", "noopener,noreferrer")}
            >
              Customer PDF
            </Button>
          )}
          <Button disabled={disabled || (!opportunity && !selectedCustomerId)} onClick={() => void calculate()}>Calculate prices</Button>
          <Button
            variant="primary"
            disabled={busy || resourceBusy || loading || readOnly || historical || lockedQuote || (!dirty && !uncertain && quoteId !== "new")}
            onClick={() => void save()}
          >
            {uncertain ? "Retry exact save" : busy ? "Working…" : "Save draft"}
          </Button>
        </div>
      </div>
      {publishingTemplate && saved && <TemplateCommandDialog source={{quoteId:saved.id,revision:saved.revision}} close={()=>setPublishingTemplate(false)} saved={item=>{setPublishingTemplate(false);setTemplateRefresh(value=>value+1);setNotice(`Saved template ${item.config.name} v${item.version}.`);}}/>}
      {documentOpen && saved && <QuoteDocumentPreview id={saved.id} revision={saved.revision} close={() => setDocumentOpen(false)}/>}
      <p class="workspace-help">
        Prepare and review pricing, freeze an offer, and record external delivery and customer-response evidence. Job conversion and accepted-material purchasing remain separate steps.
      </p>
      {(error || company.error) && (
        <Notice tone="danger">{error || company.error}</Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      {uncertain && (
        <Notice tone="warning">
          The save outcome is uncertain. Editing is locked; retry the same save
          to recover its original result. Keep this page open until resolved.
        </Notice>
      )}
      {loading ? (
        <LoadingState label="Loading quote revision…" />
      ) : (
        <>
          {lockedQuote && (
            <Notice>
              This quote is {saved?.status}; draft editing is locked.
            </Notice>
          )}
          {historical && (
            <Notice>
              Viewing an immutable earlier revision.{" "}
              <Button onClick={() => void load()}>
                Return to current draft
              </Button>
            </Notice>
          )}
          
          <div class="quote-scope-full">
            <QuoteSection title="Scope & terms">
              {quoteId === "new" && (
                <div class="sales-form-grid">
                  <Select
                    label="Customer"
                    value={selectedCustomerId || (opportunity ? "__opp__" : "")}
                    disabled={disabled}
                    options={[
                      { value: "", label: "Select a customer…" },
                      ...(opportunity ? [{ value: "__opp__", label: `From opportunity: ${opportunity.customerName || opportunity.title}` }] : []),
                      ...customers.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${(c as any).customer_type === "commercial" ? "Commercial" : "Residential"})`,
                      })),
                    ]}
                    onValueChange={(id) => {
                      if (id === "__opp__") return;
                      setSelectedCustomerId(id);
                      setOpportunity(null);
                      setProfile(null);
                      changed();
                    }}
                  />
                  {opportunityList.length > 0 && (
                    <Select
                      label="Or link existing opportunity"
                      value={opportunity?.id || "none"}
                      disabled={disabled}
                      options={[
                        { value: "none", label: "Auto-create opportunity for selected customer" },
                        ...opportunityList.map((o) => ({
                          value: o.id,
                          label: `${o.title} — ${o.customerName || "Prospect"} (${o.segment})`,
                        })),
                      ]}
                      onValueChange={(id) => {
                        if (id === "none") {
                          setOpportunity(null);
                        } else {
                          const found = opportunityList.find((o) => o.id === id) || null;
                          setOpportunity(found);
                          setSelectedCustomerId("");
                        }
                        setProfile(null);
                        changed();
                      }}
                    />
                  )}
                </div>
              )}
              <TextField
                label="Quote title"
                value={document.title}
                required
                maxLength={200}
                disabled={disabled}
                onInput={(e) =>
                  patchDocument({ title: e.currentTarget.value })
                }
              />
              <MarkdownField
                label="Scope"
                className="quote-scope-textarea"
                rows={8}
                value={document.scope}
                required
                maxLength={12000}
                disabled={disabled}
                placeholder="Describe the work scope using headings, bullets, checkboxes, or callout boxes…"
                onChange={(scope) => patchDocument({ scope })}
              />
              <MarkdownField
                label="Exclusions"
                className="quote-exclusions-textarea"
                rows={6}
                value={document.exclusions}
                maxLength={10000}
                disabled={disabled}
                placeholder="List exclusions, owner responsibilities, or special notes…"
                onChange={(exclusions) => patchDocument({ exclusions })}
              />
            </QuoteSection>
          </div>

          <QuoteSection title="Job costing">
            <CostingSheet lines={lines} preview={preview} disabled={disabled} replace={next=>{changed();setLines(next);}} details={setLineDetails} onSave={() => void save()} saving={busy} canSave={!disabled}/>
            {lineDetails&&lines.some(l=>l.id===lineDetails)&&<Dialog class="bid-review-dialog" close={()=>setLineDetails(null)}><DialogTitle>Costing row details</DialogTitle>{lines.filter(l=>l.id===lineDetails).map(line=><QuoteLineEditor key={line.id} line={line} index={lines.findIndex(l=>l.id===line.id)} opportunityId={opportunity?.id??""} material={line.materialId?materials[line.materialId]:undefined} disabled={disabled} onRefreshing={active=>setRefreshingLines(current=>active?[...new Set([...current,line.id])]:current.filter(id=>id!==line.id))} rememberMaterial={row=>{changed();setMaterials(current=>({...current,[row.id]:row}));}} patch={patch=>patchLine(line.id,patch)} remove={()=>{changed();setLines(current=>current.filter(l=>l.id!==line.id));setLineDetails(null);}}/>)}<Button disabled={resourceBusy} onClick={()=>setLineDetails(null)}>Done</Button></Dialog>}
          </QuoteSection>

          <aside class="quote-summary quote-price-review-bottom" aria-label="Quote pricing summary">
            <Card>
              <h2>
                {savedEvidence ? "Saved revision prices" : "Price review"}
              </h2>
              {preview ? (
                <>
                  <Badge tone={preview.pricingComplete === false ? "warning" : "info"}>
                    {preview.pricingComplete === false ? "Supplier pricing pending" : savedEvidence
                      ? "Frozen saved evidence"
                      : "Server preview"}
                  </Badge>
                  {preview.pricingComplete === false && <Notice tone="warning">Internal working draft: {preview.pendingLineIds?.length} material line(s) await supplier pricing or catalog links. Totals with missing inputs stay pending. Known line amounts are not a final bid.</Notice>}
                  <dl>
                    {[
                      ["Estimated cost", preview.costCents],
                      ["Selling price before discount", preview.grossCents],
                      ["Discount", preview.discountCents],
                      ["Net before tax", preview.netCents],
                      ["Tax", preview.taxCents],
                      ["Total", preview.totalCents],
                      ["Gross profit", preview.profitCents],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd>{salesMoney(value as number | null)}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Gross margin</dt>
                      <dd>
                        {preview.marginBasisPoints === null
                          ? "—"
                          : (preview.marginBasisPoints / 100).toFixed(2) +
                            "%"}
                      </dd>
                    </div>
                  </dl>
                  {preview.pricingComplete === false && preview.knownTotals && <details><summary>Known line amounts only — not final totals</summary><dl>{[["Known costs",preview.knownTotals.costCents],["Known selling value before tax",preview.knownTotals.netCents],["Known line totals",preview.knownTotals.totalCents]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{salesMoney(value as number)}</dd></div>)}</dl></details>}
                  <p class="workspace-help">
                    Profile v{preview.profileVersion} ·{" "}
                    {preview.profile.state} · {preview.profile.segment}. Costs
                    and margins are internal.
                  </p>
                  <details>
                    <summary>Line totals and tax</summary>
                    {preview.lines.map((line, index) => (
                      <div class="quote-summary-line" key={line.id}>
                        <strong>
                          {index + 1}. {line.description}
                        </strong>
                        <span>
                          {salesMoney(line.totalCents)} · Tax{" "}
                          {salesMoney(line.taxCents)}
                        </span>
                      </div>
                    ))}
                  </details>
                </>
              ) : (
                <p class="workspace-help">
                  Calculate prices after edits to review current costs, tax,
                  and margin.
                </p>
              )}
            </Card>
          </aside>

          <div class="quote-extras">
              {saved && <QuoteConversionPanel key={`conversion:${saved.id}:${saved.revision}`} refreshKey={`${saved.status}:${saved.updatedAt}`} id={saved.id} revision={saved.revision} disabled={dirty||busy||resourceBusy||loading||uncertain} reloaded={()=>void load()}/>}
          </div>
        </>
      )}
    </div>
  );
}
