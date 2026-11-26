import {CustomRecordFields} from "../custom-record-fields";
import {ProspectConversion,ProspectConversionRecord} from "./prospect-conversion";
import { useState, useEffect } from "preact/hooks";
import { X, ArrowRight } from "lucide-preact";
import { accountRequest } from "../../auth";
import type {
  Opportunity,
  SalesPipeline,
  SalesOptions,
  SalesDetail,
} from "../../sales-types";
import { salesMinor } from "../../sales-types";
import { dateLabel } from "../../sales-format";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { DialogTitle } from "../ui/dialog";
import { Badge, Notice, Sheet, Textarea } from "../ui/surfaces";
import { ActivityPanel } from "./activities";
import type { SalesMutation } from "../../sales-types";
import { MoveForm } from "./move-form";
export function OpportunityEditor({
  row,
  pipeline,
  options,
  userId,
  admin,
  disabled,
  error,
  close,
  save,
  move,
  addNote,
  mutate,
  converted,
}: {
  row: Opportunity | null;
  pipeline: SalesPipeline;
  options: SalesOptions;
  userId: string;
  admin: boolean;
  disabled: boolean;
  error: string;
  close(): void;
  save(id: string | null, data: unknown): Promise<boolean>;
  move(row: Opportunity, stage: string, reason: string): Promise<boolean>;
  mutate: SalesMutation;
  converted(row: Opportunity): void;
  addNote(row: Opportunity, content: string): Promise<boolean>;
}) {
  const [converting,setConverting]=useState(false);
  const [title, setTitle] = useState(row?.title || ""),
    [prospect, setProspect] = useState(row?.prospect_name || ""),
    [owner, setOwner] = useState(row?.owner_id || userId),
    [customer, setCustomer] = useState(row?.customer_id || "none"),
    [site, setSite] = useState(row?.site_id || "none"),
    [asset, setAsset] = useState(row?.asset_id || "none"),
    [stage, setStage] = useState(
      row?.stage_id || pipeline.stages.find((s) => s.kind === "open")!.id,
    ),
    [segment, setSegment] = useState(row?.segment || "commercial"),
    [value, setValue] = useState(((row?.expected_value || 0) / 100).toFixed(2)),
    [probability, setProbability] = useState(
      row?.probability ??
        pipeline.stages.find((s) => s.id === stage)?.probability ??
        10,
    ),
    [closeDate, setCloseDate] = useState(row?.expected_close_date || ""),
    [nextAction, setNextAction] = useState(row?.next_action || ""),
    [nextDate, setNextDate] = useState(row?.next_action_date || ""),
    [contact, setContact] = useState(row?.contact_name || ""),
    [email, setEmail] = useState(row?.contact_email || ""),
    [phone, setPhone] = useState(row?.contact_phone || ""),
    [source, setSource] = useState(row?.source || ""),
    [notes, setNotes] = useState(row?.notes || ""),
    [lookup, setLookup] = useState(options),
    [customerSearch, setCustomerSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState(""),
    [detail, setDetail] = useState<SalesDetail | null>(null),
    [note, setNote] = useState("");
  useEffect(() => {
    let alive = true;
    void accountRequest<SalesOptions>(
      "/api/sales/options?" +
        new URLSearchParams({
          search: customerSearch,
          ...(customer !== "none" ? { customerId: customer } : {}),
        }),
    )
      .then((value) => {
        if (alive) setLookup(value);
      })
      .catch((e) => {
        if (alive) setLocalError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [customer, customerSearch]);
  useEffect(() => {
    if (!row) return;
    let alive = true;
    void accountRequest<SalesDetail>("/api/sales/opportunities/" + row.id)
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch((e) => {
        if (alive) setLocalError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [row?.id, row?.version]);
  useEffect(() => {
    if (row) {
      setStage(row.stage_id);
      setProbability(row.probability);
    }
  }, [row?.stage_id]);
  const readOnly =
      disabled ||
      busy ||
      Boolean(row && row.stage_kind !== "open") ||
      Boolean(row && !admin && row.owner_id !== userId),
    customerChoices = [
      { value: "none", label: "Prospect · not linked yet" },
      ...lookup.customers.map((c) => ({ value: c.id, label: c.name })),
    ];
  if (
    row?.customer_id &&
    !customerChoices.some((c) => c.value === row.customer_id)
  )
    customerChoices.push({
      value: row.customer_id,
      label: row.customer_name || "Linked customer",
    });
  const hasDraftEdits = !!row && JSON.stringify([title,prospect,owner,customer,site,asset,stage,segment,value,probability,closeDate,nextAction,nextDate,contact,email,phone,source,notes]) !== JSON.stringify([row.title,row.prospect_name,row.owner_id,row.customer_id||'none',row.site_id||'none',row.asset_id||'none',row.stage_id,row.segment,(row.expected_value/100).toFixed(2),row.probability,row.expected_close_date,row.next_action,row.next_action_date,row.contact_name,row.contact_email,row.contact_phone,row.source,row.notes]);
  const hasUnsavedConversionInput = hasDraftEdits || !!note.trim();
  const named = (id: string) =>
    options.owners.find((owner) => owner.id === id)?.name ||
    (id === "system" ? "System" : "Former team member");
  return (
    <Sheet close={close}>
      <header class="sales-sheet-header">
        <div>
          <Badge tone="info">{row ? row.stage_name : "New opportunity"}</Badge>
          <DialogTitle>{row ? row.title : "Create opportunity"}</DialogTitle>
        </div>
        <Button size="icon" aria-label="Close opportunity" onClick={close}>
          <X size={18} />
        </Button>
      </header>
      {(error || localError) && (
        <Notice tone="danger">
          {localError || error}
          <small>
            Close and reopen if another session changed this record.
          </small>
        </Notice>
      )}
      {row && (
        <p class="workspace-help">
          Owned by {named(row.owner_id)} · Created {dateLabel(row.created_at)}
        </p>
      )}
      {row && row.stage_kind==='open' && !row.customer_id && (admin || row.owner_id===userId) && <section class="sales-details"><Button disabled={readOnly||hasUnsavedConversionInput} onClick={()=>setConverting(true)}>Convert prospect to customer</Button><p class="workspace-help">{hasUnsavedConversionInput ? 'Save or discard your opportunity edits before reviewing conversion.' : 'Reuse a native customer or create a reviewed account with service locations and a contact.'}</p></section>}
      {row && row.customer_id && (admin || row.owner_id===userId) && <ProspectConversionRecord row={row} actorName={named}/>}
      {converting && row && <ProspectConversion row={row} disabled={disabled} close={()=>setConverting(false)} saved={next=>{setConverting(false);converted(next);}}/>}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError("");
          let expectedValue;
          try {
            expectedValue = salesMinor(value);
          } catch (e) {
            setLocalError((e as Error).message);
            return;
          }
          setBusy(true);
          void save(row?.id || null, {
            title,
            pipelineId: pipeline.id,
            stageId: stage,
            ownerId: owner,
            prospectName: prospect,
            contactName: contact,
            contactEmail: email,
            contactPhone: phone,
            segment,
            source,
            expectedValue,
            probability,
            expectedCloseDate: closeDate,
            nextAction,
            nextActionDate: nextDate,
            customerId: customer === "none" ? null : customer,
            siteId: site === "none" ? null : site,
            assetId: asset === "none" ? null : asset,
            notes,
            ...(row ? { expectedVersion: row.version } : {}),
          })
            .then((ok) => {
              if (ok) close();
            })
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label="Opportunity title"
          value={title}
          required
          maxLength={200}
          disabled={readOnly}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <div class="sales-form-grid">
          <TextField
            label="Prospect / company name"
            value={prospect}
            maxLength={200}
            required={customer === "none"}
            disabled={readOnly}
            onInput={(e) => setProspect(e.currentTarget.value)}
          />
          <Select
            label="Market"
            value={segment}
            onValueChange={(v) => setSegment(v as "commercial" | "residential")}
            disabled={readOnly}
            options={[
              { value: "commercial", label: "Commercial" },
              { value: "residential", label: "Residential" },
            ]}
          />
        </div>
        <Select
          label="Sales owner"
          value={owner}
          onValueChange={setOwner}
          disabled={readOnly || !admin}
          options={[
            ...options.owners.map((o) => ({ value: o.id, label: o.name })),
            ...(!options.owners.some((o) => o.id === owner)
              ? [{ value: owner, label: "Former team member", disabled: true }]
              : []),
          ]}
        />
        {!row && (
          <Select
            label="Starting stage"
            value={stage}
            onValueChange={(id) => {
              setStage(id);
              setProbability(
                pipeline.stages.find((s) => s.id === id)!.probability,
              );
            }}
            disabled={readOnly}
            options={pipeline.stages
              .filter((s) => s.kind === "open")
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        <div class="sales-form-grid">
          <TextField
            label="Expected value (USD)"
            hint="Forecast only; not recognized revenue."
            type="text"
            inputMode="decimal"
            value={value}
            required
            disabled={readOnly}
            onInput={(e) => setValue(e.currentTarget.value)}
          />
          <TextField
            label="Probability (%)"
            type="number"
            min={0}
            max={100}
            value={probability}
            required
            disabled={readOnly}
            onInput={(e) => setProbability(Number(e.currentTarget.value))}
          />
          <TextField
            label="Expected close date"
            type="date"
            value={closeDate}
            disabled={readOnly}
            onInput={(e) => setCloseDate(e.currentTarget.value)}
          />
          <TextField
            label="Next action date"
            type="date"
            value={nextDate}
            disabled={readOnly}
            onInput={(e) => setNextDate(e.currentTarget.value)}
          />
        </div>
        <TextField
          label="Next action"
          value={nextAction}
          maxLength={1000}
          disabled={readOnly}
          onInput={(e) => setNextAction(e.currentTarget.value)}
        />
        <details class="sales-details">
          <summary>Customer, site and equipment</summary>
          <TextField
            label="Search existing customers"
            hint="Shows up to 100 matching customers."
            value={customerSearch}
            disabled={readOnly}
            onInput={(e) => setCustomerSearch(e.currentTarget.value)}
          />
          <Select
            label="Linked customer"
            value={customer}
            options={customerChoices}
            disabled={readOnly}
            onValueChange={(id) => {
              setCustomer(id);
              setSite("none");
              setAsset("none");
            }}
          />
          <Select
            label="Site"
            value={site}
            disabled={readOnly || customer === "none"}
            options={[
              { value: "none", label: "No site" },
              ...lookup.sites.map((s) => ({ value: s.id, label: s.name })),
              ...(site !== "none" && !lookup.sites.some((s) => s.id === site)
                ? [{ value: site, label: "Linked site" }]
                : []),
            ]}
            onValueChange={(id) => {
              setSite(id);
              setAsset("none");
            }}
          />
          <Select
            label="Equipment"
            value={asset}
            disabled={readOnly || customer === "none"}
            options={[
              { value: "none", label: "No equipment" },
              ...lookup.assets
                .filter((a) => site === "none" || a.site_id === site)
                .map((a) => ({ value: a.id, label: a.name })),
              ...(asset !== "none" && !lookup.assets.some((a) => a.id === asset)
                ? [{ value: asset, label: "Linked equipment" }]
                : []),
            ]}
            onValueChange={setAsset}
          />
          {row?.customer_id && (
            <a href={"/customers/" + row.customer_id}>
              Open customer <ArrowRight size={13} />
            </a>
          )}
        </details>
        <details class="sales-details">
          <summary>Contact and internal scope</summary>
          <TextField
            label="Contact name"
            value={contact}
            maxLength={200}
            disabled={readOnly}
            onInput={(e) => setContact(e.currentTarget.value)}
          />
          <TextField
            label="Contact email"
            type="email"
            value={email}
            maxLength={254}
            disabled={readOnly}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          <TextField
            label="Contact phone"
            value={phone}
            maxLength={80}
            disabled={readOnly}
            onInput={(e) => setPhone(e.currentTarget.value)}
          />
          <TextField
            label="Lead source"
            value={source}
            maxLength={100}
            disabled={readOnly}
            onInput={(e) => setSource(e.currentTarget.value)}
          />
          <label class="ui-field">
            Internal scope notes
            <Textarea
              aria-label="Internal scope notes"
              value={notes}
              maxLength={8000}
              disabled={readOnly}
              onInput={(e) => setNotes(e.currentTarget.value)}
            />
          </label>
        </details>
        <Button type="submit" variant="primary" disabled={readOnly}>
          {busy ? "Saving…" : row ? "Save changes" : "Create opportunity"}
        </Button>
      </form>
      {row && (
        <>
          <section class="sales-details">
            <h3>Stage</h3>
            <MoveForm
              opportunity={row}
              pipeline={pipeline}
              disabled={disabled || busy || (!admin && row.owner_id !== userId)}
              move={move}
            />
          </section>
          <ActivityPanel
            row={row}
            options={options}
            admin={admin}
            disabled={disabled || busy}
            error={error}
            mutate={mutate}
          />
          <section class="sales-details">
            <h3>History and notes</h3>
            <p class="workspace-help">
              Internal notes stay in your workspace. No customer message is
              sent.
            </p>
            <form
              class="sales-form"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                void addNote(row, note)
                  .then((ok) => {
                    if (ok) setNote("");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <label class="ui-field">
                Add internal note
                <Textarea
                  aria-label="Add internal note"
                  value={note}
                  maxLength={8000}
                  disabled={
                    disabled || busy || (!admin && row.owner_id !== userId)
                  }
                  onInput={(e) => setNote(e.currentTarget.value)}
                />
              </label>
              <Button
                type="submit"
                disabled={
                  !note.trim() ||
                  disabled ||
                  busy ||
                  (!admin && row.owner_id !== userId)
                }
              >
                Add note
              </Button>
            </form>
            {detail?.notes.map((n) => (
              <article class="sales-activity" key={n.id}>
                <strong>{named(n.actor_id)}</strong>
                <time>{dateLabel(n.created_at)}</time>
                <p>{n.content}</p>
              </article>
            ))}
            {detail?.activity
              .filter((item) => item.action !== "note")
              .map((item) => {
                const before = JSON.parse(item.before_json),
                  after = JSON.parse(item.after_json);
                return (
                  <article class="sales-activity" key={item.id}>
                    <strong>
                      {item.action === "move" || item.action === "reopen"
                        ? `${before.stage_name} → ${after.stage_name}`
                        : item.action === "prospect_conversion"
                          ? "Prospect linked to native customer"
                        : item.action === "create"
                          ? "Opportunity created"
                          : item.action === "activity"
                            ? `Follow-up ${after.action}: ${after.title} (${after.status})`
                            : "Opportunity updated"}
                    </strong>
                    <small>
                      {named(item.actor_id)} · {dateLabel(item.created_at)}
                    </small>
                    {item.reason && <p>{item.reason}</p>}
                  </article>
                );
              })}
          </section>
        </>
      )}
      {row && <CustomRecordFields key={row.id} objectKey="sales.opportunity" recordId={row.id}/>}
    </Sheet>
  );
}
