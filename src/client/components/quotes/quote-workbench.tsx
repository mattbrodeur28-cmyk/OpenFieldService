import {QuoteConversionPanel} from "./quote-conversion";
import {CostingSheet} from "./costing-sheet";
import {Dialog,DialogTitle} from "../ui/dialog";
import {QuoteLifecyclePanel} from "./quote-lifecycle";
import { BidReviewPanel } from "./bid-review";
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

export function QuoteWorkbench({ quoteId }: { quoteId: string }) {
  const { user } = useAccount();
  const { navigate } = useApp(),
    { readOnly } = useConnectivity(),
    company = useCompanyTimeZone();
  const [saved, setSaved] = useState<Quote | null>(null),
    [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [opportunity, setOpportunity] = useState<QuoteOpportunity | null>(null),
    [profile, setProfile] = useState<BillingProfile | null>(null),
    [latestProfile, setLatestProfile] = useState<BillingProfile | null>(null);
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
  function build(): EstimateInput {
    if (!opportunity) throw new Error("Choose an opportunity.");
    if (!profile) throw new Error("Choose a reviewed billing profile.");
    if (!lines.length) throw new Error("Add at least one estimate line.");
    return {
      opportunityId: opportunity.id,
      expectedOpportunityVersion: opportunity.version,
      profileId: profile.id,
      expectedProfileVersion: profile.version,
      pricingDate,
      lines: lines.map(lineInput),
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
      const input = build();
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
    try {
      if (uncertain && pending.current) command = pending.current;
      else {
        if (!preview || preview.persisted)
          throw new Error(
            "Calculate and review prices before saving this draft.",
          );
        if (!document.title.trim() || !document.scope.trim())
          throw new Error("Enter a quote title and scope before saving.");
        if (!document.validUntil || document.validUntil < pricingDate)
          throw new Error(
            "Choose a validity date on or after the pricing date.",
          );
        const input = build();
        if (JSON.stringify(input) !== JSON.stringify(previewInput.current))
          throw new Error(
            "Estimate inputs changed. Calculate and review prices again.",
          );
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
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
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
      const definite = commandFailureIsDefinite(
        e instanceof AccountRequestError ? e.status : undefined, recovering,
      );
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
              <span>{saved?.status && saved.status !== "draft" ? saved.status : "Internal draft"}</span>
              <span>{saved ? `Revision ${saved.revision} of ${saved.version}` : "Not saved"}</span>
              {dirty && <span>Unsaved changes</span>}
            </div>
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
          <Button disabled={disabled || !opportunity || !profile} onClick={() => void calculate()}>Calculate prices</Button>
          <Button
            variant="primary"
            disabled={busy || resourceBusy || loading || readOnly || historical || lockedQuote || ((!preview || preview.persisted) && !uncertain)}
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
          {!historical && !lockedQuote && <QuoteSection title="Start from a template" class="quote-template-apply">
            
            {opportunity ? <SearchPicker<TemplateSummary> key={`${opportunity.segment}:${templateRefresh}`} label="Reusable quote template" endpoint={`/api/sales/quote-templates?segment=${opportunity.segment}`} selected={template?{id:template.id,label:`${template.name??"Template"} · v${template.version}`}:null} disabled={disabled} format={row=>`${row.name} · v${row.version}`} change={row=>void applyTemplate(row)}/> : <p class="workspace-help">Choose an opportunity to see templates for its work segment.</p>}
            {template&&<Button disabled={disabled} onClick={()=>{changed();setTemplate(null);}}>Detach template reference</Button>}
          </QuoteSection>}
          <div class="quote-layout">
            <section class="quote-form" aria-label="Quote estimate editor">
              <QuoteSection title="Opportunity and billing">
                
                {saved ? (
                  <div class="quote-linked-opportunity">
                    <strong>{opportunity?.title ?? saved.opportunityId}</strong>
                    <p>
                      {opportunity?.customerName} · {opportunity?.segment}
                    </p>
                    <Button
                      disabled={busy || uncertain}
                      onClick={() => navigate("/sales/" + saved.opportunityId)}
                    >
                      Open opportunity
                    </Button>
                  </div>
                ) : (
                  <SearchPicker<QuoteOpportunity>
                    label="Opportunity"
                    endpoint="/api/sales/quotes/options?kind=opportunities"
                    selected={
                      opportunity
                        ? {
                            id: opportunity.id,
                            label:
                              opportunity.title +
                              " · " +
                              opportunity.customerName,
                          }
                        : null
                    }
                    disabled={disabled}
                    format={(row) => row.title + " · " + row.customerName}
                    change={(row) => {
                      changed();
                      setOpportunity(row);
                      if (profile && profile.config.segment !== row.segment) {
                        setProfile(null);
                        setLatestProfile(null);
                      }
                      if (!document.title)
                        setDocument((current) => ({
                          ...current,
                          title: row.title + " estimate",
                        }));
                    }}
                  />
                )}
                {opportunity && (
                  <SearchPicker<BillingProfile>
                    key={opportunity.segment}
                    label="Billing profile"
                    endpoint={
                      "/api/sales/billing-profiles?segment=" +
                      opportunity.segment
                    }
                    selected={
                      profile
                        ? {
                            id: profile.id,
                            label: `${profile.config.name} · ${profile.config.state} · v${profile.version}`,
                          }
                        : null
                    }
                    disabled={disabled}
                    blocked={(row) => row.requiresReview || !row.config.active}
                    format={(row) =>
                      `${row.config.name} · ${row.config.state} · v${row.version}${row.requiresReview ? " · Needs review" : !row.config.active ? " · Inactive" : ""}`
                    }
                    change={(row) => {
                      changed();
                      setProfile(row);
                      setLatestProfile(row);
                    }}
                  />
                )}
                {profileChanged && (
                  <Notice tone="warning">
                    Billing rules changed from v{profile!.version} to v
                    {latestProfile!.version}. Earlier saved prices are retained.{" "}
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        changed();
                        setProfile(latestProfile);
                      }}
                    >
                      Use current billing rules
                    </Button>
                  </Notice>
                )}
                {profile && (
                  <p class="workspace-help">
                    {profile.config.jurisdiction} · {profile.config.segment} ·
                    Effective {profile.config.effectiveFrom} to{" "}
                    {profile.config.effectiveTo || "no end date"}
                  </p>
                )}
                <Button
                  disabled={disabled || !opportunity}
                  onClick={() => void refreshSources()}
                >
                  Refresh linked records
                </Button>
                <div class="quote-date-fields">
                  <TextField
                    label="Pricing date"
                    type="date"
                    value={pricingDate}
                    required
                    disabled={disabled}
                    onInput={(e) => {
                      changed();
                      setPricingDate(e.currentTarget.value);
                    }}
                  />
                  <TextField
                    label="Valid until"
                    type="date"
                    value={document.validUntil}
                    required
                    disabled={disabled}
                    onInput={(e) =>
                      patchDocument({ validUntil: e.currentTarget.value })
                    }
                  />
                </div>
              </QuoteSection>
              <QuoteSection title="Scope and terms">
                
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
                <label class="ui-field">
                  Scope
                  <Textarea
                    value={document.scope}
                    required
                    maxLength={12000}
                    disabled={disabled}
                    onInput={(e) =>
                      patchDocument({ scope: e.currentTarget.value })
                    }
                  />
                </label>
                <label class="ui-field">
                  Exclusions
                  <Textarea
                    value={document.exclusions}
                    maxLength={10000}
                    disabled={disabled}
                    onInput={(e) =>
                      patchDocument({ exclusions: e.currentTarget.value })
                    }
                  />
                </label>
              </QuoteSection>
              <QuoteSection title="Job costing">
                <CostingSheet lines={lines} preview={preview} disabled={disabled} replace={next=>{changed();setLines(next);}} details={setLineDetails} onSave={() => void save()} saving={busy} canSave={!disabled}/>
                {lineDetails&&lines.some(l=>l.id===lineDetails)&&<Dialog class="bid-review-dialog" close={()=>setLineDetails(null)}><DialogTitle>Costing row details</DialogTitle>{lines.filter(l=>l.id===lineDetails).map(line=><QuoteLineEditor key={line.id} line={line} index={lines.findIndex(l=>l.id===line.id)} opportunityId={opportunity?.id??""} material={line.materialId?materials[line.materialId]:undefined} disabled={disabled} onRefreshing={active=>setRefreshingLines(current=>active?[...new Set([...current,line.id])]:current.filter(id=>id!==line.id))} rememberMaterial={row=>{changed();setMaterials(current=>({...current,[row.id]:row}));}} patch={patch=>patchLine(line.id,patch)} remove={()=>{changed();setLines(current=>current.filter(l=>l.id!==line.id));setLineDetails(null);}}/>)}<Button disabled={resourceBusy} onClick={()=>setLineDetails(null)}>Done</Button></Dialog>}
              </QuoteSection>
            </section>
            <aside class="quote-summary" aria-label="Quote pricing summary">
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
              {detail && (
                <Card>
                  <h2>Revision history</h2>
                  <p class="workspace-help">
                    Each save retains its pricing and terms.
                  </p>
                  {detail.history.map((row) => (
                    <Button
                      key={row.version}
                      disabled={
                        busy ||
                        resourceBusy ||
                        loading ||
                        dirty ||
                        uncertain ||
                        row.version === saved?.revision
                      }
                      onClick={() => void load(row.version, detail.historyPage)}
                    >
                      Revision {row.version} ·{" "}
                      {company.timeZone
                        ? formatTimestamp(row.savedAt, company.timeZone)
                        : row.savedAt}
                    </Button>
                  ))}
                  <div class="quote-picker-pages">
                    <Button
                      disabled={
                        busy ||
                        resourceBusy ||
                        loading ||
                        dirty ||
                        uncertain ||
                        detail.historyPage === 1
                      }
                      onClick={() =>
                        void load(saved?.revision, detail.historyPage - 1)
                      }
                    >
                      Newer
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        resourceBusy ||
                        loading ||
                        dirty ||
                        uncertain ||
                        !detail.hasMoreHistory
                      }
                      onClick={() =>
                        void load(saved?.revision, detail.historyPage + 1)
                      }
                    >
                      Older
                    </Button>
                  </div>
                </Card>
              )}
              {saved && <QuoteLifecyclePanel key={`lifecycle:${saved.id}:${saved.revision}`} id={saved.id} revision={saved.revision} disabled={dirty||busy||resourceBusy||loading||uncertain} refreshKey={reviewRefresh} reloaded={()=>void load()}/>}
              {saved && <QuoteConversionPanel key={`conversion:${saved.id}:${saved.revision}`} refreshKey={`${saved.status}:${saved.updatedAt}`} id={saved.id} revision={saved.revision} disabled={dirty||busy||resourceBusy||loading||uncertain} reloaded={()=>void load()}/>}
              {saved && <BidReviewPanel key={`${saved.id}:${saved.revision}`} id={saved.id} revision={saved.revision} disabled={dirty||busy||resourceBusy||loading||uncertain} onChanged={()=>setReviewRefresh(value=>value+1)}/>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
