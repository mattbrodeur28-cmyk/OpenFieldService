import { JobStock } from "./job-stock";
import { BillingPreparation } from "./billing-preparation";
import { useState } from "preact/hooks";
import { api } from "../../api";
import { useApp } from "../../context";
import type { Asset, Site } from "../../types";
import type {
  ExecutionDetail,
  PostWorkReport,
  LaborInput,
  ReportRevision,
} from "../../service-types";
import {
  formatTimestamp,
  localInput,
  localCandidates,
  resolveLocal,
} from "../../time-format";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Checkbox, Notice, Textarea, Badge } from "../ui/surfaces";
type Run = (suffix: string, body: unknown, method?: string) => Promise<boolean>;

function QuickLinkEquipment({
  jobId,
  disabled,
  onLinked,
}: {
  jobId: string;
  disabled: boolean;
  onLinked?: () => Promise<void>;
}) {
  const { updateJob } = useApp();
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [mfg, setMfg] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim() || !serial.trim()) {
      setErr("Enter both equipment name and serial number.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const freshJob = await api<{ job: { customer_id: string; address?: string; schedule_version?: number } }>("GET", `/api/jobs/${jobId}`);
      const customerId = freshJob?.job?.customer_id;
      if (!customerId) throw new Error("Could not resolve customer for this job.");
      const siteRes = await api<{ sites: Site[] }>("GET", `/api/customers/${customerId}/sites`);
      let siteId = siteRes.sites?.[0]?.id;
      if (!siteId) {
        const s = await api<Site>("POST", `/api/customers/${customerId}/sites`, {
          name: "Primary Site",
          address: freshJob?.job?.address || "",
        });
        siteId = s.id;
      }
      const asset = await api<Asset>("POST", `/api/customers/${customerId}/assets`, {
        site_id: siteId,
        name: name.trim(),
        serial_number: serial.trim(),
        manufacturer: mfg.trim(),
        model: model.trim(),
      });
      await updateJob(jobId, {
        asset_id: asset.id,
        ...(freshJob?.job?.schedule_version !== undefined
          ? { expected_version: freshJob.job.schedule_version }
          : {}),
      } as any);
      await onLinked?.();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      class="card"
      style={{ padding: "12px", marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-sunken)" }}
      onSubmit={submit}
    >
      <strong style={{ fontSize: "13px" }}>Link or Register Equipment to Continue Step 2</strong>
      <p class="workspace-help" style={{ margin: 0 }}>
        Add the unit you are servicing below (or link an existing unit in the Equipment / Unit tab) to unlock the post-work report.
      </p>
      {err && <Notice tone="danger">{err}</Notice>}
      <div class="sales-form-grid">
        <TextField label="Equipment name *" required placeholder="e.g., RTU-2" value={name} disabled={busy || disabled} onInput={(e) => setName(e.currentTarget.value)} />
        <TextField label="Serial number *" required placeholder="e.g., SN-12345" value={serial} disabled={busy || disabled} onInput={(e) => setSerial(e.currentTarget.value)} />
      </div>
      <div class="sales-form-grid">
        <TextField label="Manufacturer" placeholder="Carrier, Trane…" value={mfg} disabled={busy || disabled} onInput={(e) => setMfg(e.currentTarget.value)} />
        <TextField label="Model" placeholder="Model #" value={model} disabled={busy || disabled} onInput={(e) => setModel(e.currentTarget.value)} />
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={busy || disabled || !name.trim() || !serial.trim()}>
          {busy ? "Linking…" : "Register & Link Equipment"}
        </Button>
      </div>
    </form>
  );
}

export function PostWorkPanel({
  data,
  disabled,
  run,
  onReload,
}: {
  data: ExecutionDetail;
  disabled: boolean;
  run: Run;
  onReload?: () => Promise<void>;
}) {
  const [stockRevision, setStockRevision] = useState(0);
  const current = data.reports?.find(
    (report) => report.id === data.workflow?.current_report_id,
  );
  return (
    <section class="sales-details">
      <h4>Step 2 · Post-work report and actual time</h4>
      {data.workflow?.stage === "post_work" && !data.job.equipment && (
        <QuickLinkEquipment
          jobId={data.job.id}
          disabled={disabled}
          onLinked={onReload}
        />
      )}
      {data.job.equipment && (
        <p>
          <strong>Equipment:</strong> {data.job.equipment.name} · Serial{" "}
          {data.job.equipment.serial_number} · {data.job.equipment.site_name}
        </p>
      )}
      <JobStock
        jobId={data.job.id}
        canUse={
          data.workflow?.stage === "post_work" &&
          data.job.status === "in_progress"
        }
        canManage={data.canManage}
        disabled={disabled}
        onSaved={() => setStockRevision((n) => n + 1)}
      />
      {data.workflow?.stage === "post_work" && data.job.equipment && (
        <ReportForm
          key={data.job.id + "-" + data.workflow.version}
          data={data}
          disabled={disabled}
          run={run}
        />
      )}
      {data.workflow?.stage === "review" &&
        !data.workflow.service_completed && (
          <Notice tone="info">
            Report submitted. Service completion requires supervisor review.
          </Notice>
        )}
      {current && <ReportEvidence revision={current} data={data} />}
      {data.workflow?.stage === "review" &&
        !data.workflow.service_completed &&
        data.canManage &&
        current && (
          <ReviewForm
            disabled={disabled}
            submit={(decision, notes) =>
              run("report-review", {
                expectedVersion: data.workflow!.version,
                reportId: current.id,
                decision,
                notes,
              })
            }
          />
        )}
      {data.workflow?.service_completed === 1 && (
        <Notice tone="success">
          Service completed with an approved report. Billing remains pending its
          separate review; report approval does not post an invoice or payment.
        </Notice>
      )}
      {data.workflow?.service_completed === 1 && data.canManage && (
        <BillingPreparation
          key={data.job.id + "-" + stockRevision}
          jobId={data.job.id}
          disabled={disabled}
        />
      )}
      {data.timeEntries && data.timeEntries.length > 0 && (
        <section class="sales-details">
          <h4>Recorded labor</h4>
          {data.timeEntries.map((entry) => (
            <article class="sales-activity" key={entry.id}>
              <Badge
                tone={
                  entry.state === "approved"
                    ? "success"
                    : entry.state === "rejected"
                      ? "warning"
                      : "info"
                }
              >
                {entry.state}
              </Badge>
              <p>
                {formatTimestamp(entry.start_at, data.companyTimeZone)} →{" "}
                {formatTimestamp(entry.end_at, data.companyTimeZone)}
              </p>
              <p>
                {(entry.worked_minutes / 60).toFixed(2)} worked hours ·{" "}
                {entry.break_minutes} break minutes ·{" "}
                {entry.requested_billable_minutes} requested billable minutes ·{" "}
                {entry.work_type}
              </p>
              {entry.notes && <p>{entry.notes}</p>}
            </article>
          ))}
        </section>
      )}
      {(data.reports?.filter((report) => report.id !== current?.id).length ||
        0) > 0 && (
        <details class="sales-details">
          <summary>Prior report revisions</summary>
          {data
            .reports!.filter((report) => report.id !== current?.id)
            .map((report) => (
              <ReportEvidence key={report.id} revision={report} data={data} />
            ))}
        </details>
      )}
    </section>
  );
}
interface LocalTime {
  value: string;
  choice: string;
}
const fromIso = (iso: string, timeZone: string): LocalTime => ({
  value: localInput(iso, timeZone),
  choice: iso,
});
function TimeInput({
  label,
  value,
  disabled,
  change,
  timeZone,
}: {
  label: string;
  timeZone: string;
  value: LocalTime;
  disabled: boolean;
  change(value: LocalTime): void;
}) {
  const candidates = localCandidates(value.value, timeZone);
  return (
    <div class="ui-field">
      <TextField
        label={label}
        type="datetime-local"
        value={value.value}
        disabled={disabled}
        onInput={(e) => change({ value: e.currentTarget.value, choice: "" })}
      />
      {candidates.length > 1 && (
        <Select
          label={label + " exact occurrence"}
          value={value.choice || "none"}
          disabled={disabled}
          onValueChange={(choice) => change({ ...value, choice })}
          options={[
            { value: "none", label: "Choose the exact occurrence" },
            ...candidates.map((iso) => ({
              value: iso,
              label:
                iso +
                " · " +
                new Date(iso).toLocaleTimeString(undefined, {
                  timeZone,
                  timeZoneName: "short",
                }),
            })),
          ]}
        />
      )}
    </div>
  );
}
function ReportForm({
  data,
  disabled,
  run,
}: {
  data: ExecutionDetail;
  disabled: boolean;
  run: Run;
}) {
  const saved = data.reportDraft?.report;
  const timeZone = saved?.timeZone || data.companyTimeZone;
  const [customerIssue, setCustomerIssue] = useState(""),
    [workPerformed, setWork] = useState(saved?.workPerformed || ""),
    [findings, setFindings] = useState(saved?.findings || ""),
    [deficiencies, setDeficiencies] = useState(saved?.deficiencies || ""),
    [needsQuote, setNeedsQuote] = useState<"no" | "yes">(saved?.followUp ? "yes" : "no"),
    [followUp, setFollowUp] = useState(saved?.followUp || ""),
    [equipmentWorking, setEquipmentWorking] = useState<"yes" | "partial" | "no">("yes"),
    [visitStart, setVisitStart] = useState(
      fromIso(saved?.visitStartAt || "", timeZone),
    ),
    [visitEnd, setVisitEnd] = useState(
      fromIso(saved?.visitEndAt || "", timeZone),
    ),
    [entries, setEntries] = useState(
      (
        saved?.entries || [
          {
            technicianId: data.job.technicianId!,
            startAt: "",
            endAt: "",
            breakMinutes: 0,
            requestedBillableMinutes: 0,
            workType: "work" as const,
            notes: "",
          },
        ]
      ).map((entry) => ({
        ...entry,
        start: fromIso(entry.startAt, timeZone),
        end: fromIso(entry.endAt, timeZone),
      })),
    ),
    [reason, setReason] = useState(data.reportDraft?.delegation_reason || ""),
    [lateReason, setLateReason] = useState(
      data.reportDraft?.late_entry_reason || "",
    ),
    [failure, setFailure] = useState("");
  const update = (index: number, patch: Partial<(typeof entries)[number]>) =>
    setEntries(
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  async function save(submit: boolean) {
    setFailure("");
    let report: PostWorkReport;
    const composedFindings = [
      customerIssue.trim() ? `Customer Reported Issue: ${customerIssue.trim()}` : "",
      findings.trim() ? `Issue Found: ${findings.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const workingLine =
      equipmentWorking === "yes"
        ? "Equipment working when leaving: Yes (Operational)"
        : equipmentWorking === "partial"
          ? "Equipment working when leaving: Partially working"
          : "Equipment working when leaving: No (Down / Needs repair)";
    const composedDeficiencies = [workingLine, deficiencies.trim()].filter(Boolean).join("\n");
    const composedFollowUp =
      needsQuote === "yes"
        ? `Quote needed: Yes${followUp.trim() ? " — " + followUp.trim() : ""}`
        : followUp.trim() || "Quote needed: No";
    const effectiveReason =
      reason.trim().length >= 10
        ? reason.trim()
        : data.canManage
          ? "Submitted post-work report on behalf of assigned technician."
          : "";
    try {
      report = {
        timeZone,
        workPerformed,
        findings: composedFindings,
        deficiencies: composedDeficiencies,
        followUp: composedFollowUp,
        visitStartAt: resolveLocal(
          visitStart.value,
          visitStart.choice,
          timeZone,
        ),
        visitEndAt: resolveLocal(visitEnd.value, visitEnd.choice, timeZone),
        entries: entries.map(({ start, end, ...entry }) => ({
          ...entry,
          startAt: resolveLocal(start.value, start.choice, timeZone),
          endAt: resolveLocal(end.value, end.choice, timeZone),
        })),
      };
    } catch (e) {
      setFailure((e as Error).message);
      return;
    }
    await run(
      submit ? "report-submit" : "report-draft",
      {
        expectedVersion: data.workflow!.version,
        delegationReason: effectiveReason,
        lateEntryReason: lateReason,
        report,
      },
      submit ? "POST" : "PUT",
    );
  }
  const text = (
    label: string,
    value: string,
    set: (v: string) => void,
    max: number,
    required = false,
  ) => (
    <label class="ui-field">
      {label}
      <Textarea
        aria-label={label}
        value={value}
        required={required}
        disabled={disabled}
        maxLength={max}
        onInput={(e) => set(e.currentTarget.value)}
      />
    </label>
  );
  return (
    <form
      class="sales-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      {failure && <Notice tone="danger">{failure}</Notice>}
      {text("Issue customer had", customerIssue, setCustomerIssue, 4000)}
      {text("Issue found", findings, setFindings, 8000)}
      {text("Actions the tech performed *", workPerformed, setWork, 12000, true)}
      <div class="sales-form-grid">
        <Select
          label="Is there anything that needs to be quoted?"
          value={needsQuote}
          disabled={disabled}
          options={[
            { value: "no", label: "No — nothing to quote" },
            { value: "yes", label: "Yes — quote needed" },
          ]}
          onValueChange={(v) => setNeedsQuote(v as "no" | "yes")}
        />
        <Select
          label="Is the equipment working when leaving?"
          value={equipmentWorking}
          disabled={disabled}
          options={[
            { value: "yes", label: "Yes — Working / Operational" },
            { value: "partial", label: "Partially working" },
            { value: "no", label: "No — Down / Needs repair" },
          ]}
          onValueChange={(v) => setEquipmentWorking(v as "yes" | "partial" | "no")}
        />
      </div>
      {needsQuote === "yes" &&
        text("What needs to be quoted? (Follow-up details)", followUp, setFollowUp, 8000)}
      {text("Additional deficiencies / notes (optional)", deficiencies, setDeficiencies, 8000)}
      {timeZone !== data.companyTimeZone && (
        <Notice tone="warning">
          This saved draft uses the previous company timezone ({timeZone}).
          Review its times before submitting.
        </Notice>
      )}
      <h4>Actual visit interval</h4>
      <p class="workspace-help">
        Record actual events to the minute. Repeated daylight-saving times
        require an explicit occurrence.
      </p>
      <div class="sales-form-grid">
        <TimeInput
          timeZone={timeZone}
          label="Actual visit start"
          value={visitStart}
          disabled={disabled}
          change={setVisitStart}
        />
        <TimeInput
          timeZone={timeZone}
          label="Actual visit finish"
          value={visitEnd}
          disabled={disabled}
          change={setVisitEnd}
        />
      </div>
      <h4>Technician labor · {data.job.technicianName}</h4>
      <p class="workspace-help">
        Elapsed visit time, worked labor and requested billable minutes are
        separate. Billing and timesheet approvals happen separately.
      </p>
      {entries.map((entry, index) => (
        <section class="sales-details" key={index}>
          <h4>Labor entry {index + 1}</h4>
          <div class="sales-form-grid">
            <TimeInput
              timeZone={timeZone}
              label={"Labor " + (index + 1) + " start"}
              value={entry.start}
              disabled={disabled}
              change={(start) => update(index, { start })}
            />
            <TimeInput
              timeZone={timeZone}
              label={"Labor " + (index + 1) + " finish"}
              value={entry.end}
              disabled={disabled}
              change={(end) => update(index, { end })}
            />
            <TextField
              label={"Labor " + (index + 1) + " break minutes"}
              type="number"
              value={entry.breakMinutes}
              min={0}
              max={1440}
              disabled={disabled}
              onInput={(e) =>
                update(index, { breakMinutes: Number(e.currentTarget.value) })
              }
            />
            <TextField
              label={"Labor " + (index + 1) + " requested billable minutes"}
              type="number"
              value={entry.requestedBillableMinutes}
              min={0}
              max={1440}
              disabled={disabled}
              onInput={(e) =>
                update(index, {
                  requestedBillableMinutes: Number(e.currentTarget.value),
                })
              }
            />
          </div>
          <Select
            label={"Labor " + (index + 1) + " type"}
            value={entry.workType}
            disabled={disabled}
            options={[
              { value: "work", label: "Work" },
              { value: "travel", label: "Travel" },
              { value: "nonbillable", label: "Nonbillable" },
            ]}
            onValueChange={(v) =>
              update(index, {
                workType: v as LaborInput["workType"],
                ...(v === "nonbillable" ? { requestedBillableMinutes: 0 } : {}),
              })
            }
          />
          <TextField
            label={"Labor " + (index + 1) + " notes"}
            value={entry.notes}
            maxLength={1000}
            disabled={disabled}
            onInput={(e) => update(index, { notes: e.currentTarget.value })}
          />
          <Button
            disabled={disabled || entries.length === 1}
            onClick={() => setEntries(entries.filter((_, i) => i !== index))}
          >
            Remove labor entry {index + 1}
          </Button>
        </section>
      ))}
      <Button
        disabled={disabled || entries.length >= 20}
        onClick={() =>
          setEntries([
            ...entries,
            {
              technicianId: data.job.technicianId!,
              startAt: "",
              endAt: "",
              breakMinutes: 0,
              requestedBillableMinutes: 0,
              workType: "work",
              notes: "",
              start: fromIso("", timeZone),
              end: fromIso("", timeZone),
            },
          ])
        }
      >
        Add labor entry
      </Button>
      {data.canManage && (
        <TextField
          label="Report submitted on behalf of technician: reason"
          value={reason}
          hint="Required when you are not the mapped assigned technician; at least 10 characters."
          disabled={disabled}
          maxLength={1000}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
      )}
      {data.canManage && (
        <TextField
          label="Late-entry review reason"
          hint="Required if actual work predates the recorded PJSA. This retains the late-entry explanation without backdating the safety submission."
          value={lateReason}
          maxLength={1000}
          disabled={disabled}
          onInput={(e) => setLateReason(e.currentTarget.value)}
        />
      )}
      <div class="sales-sheet-header">
        <Button disabled={disabled} onClick={() => void save(false)}>
          Save report draft
        </Button>
        <Button variant="primary" type="submit" disabled={disabled}>
          Submit report for review
        </Button>
      </div>
    </form>
  );
}
function ReportEvidence({
  revision,
  data,
}: {
  revision: ReportRevision;
  data: ExecutionDetail;
}) {
  const report = revision.report;
  return (
    <details class="sales-details">
      <summary>
        Report revision {revision.revision} ·{" "}
        {revision.decision || "Awaiting review"}
      </summary>
      <p class="workspace-help">
        Submitted by {data.people[revision.actor_id] || "Former team member"} ·{" "}
        {formatTimestamp(revision.submitted_at)}
      </p>
      {revision.equipment ? (
        <p>
          <strong>Recorded equipment:</strong> {revision.equipment.name} ·
          Serial {revision.equipment.serial_number} ·{" "}
          {revision.equipment.site_name}
        </p>
      ) : (
        <Notice tone="warning">
          Historical report: equipment was not captured when this revision was
          submitted.
        </Notice>
      )}
      <p>
        <strong>Work performed:</strong> {report.workPerformed}
      </p>
      {report.findings && (
        <p>
          <strong>Findings:</strong> {report.findings}
        </p>
      )}
      {report.deficiencies && (
        <p>
          <strong>Deficiencies:</strong> {report.deficiencies}
        </p>
      )}
      {report.followUp && (
        <p>
          <strong>Follow-up:</strong> {report.followUp}
        </p>
      )}
      <p>
        Actual visit: {formatTimestamp(report.visitStartAt, report.timeZone)} →{" "}
        {formatTimestamp(report.visitEndAt, report.timeZone)}
      </p>
      {revision.delegation_reason && (
        <p>Submitted on behalf: {revision.delegation_reason}</p>
      )}
      {revision.late_entry_reason && (
        <p>Late-entry review: {revision.late_entry_reason}</p>
      )}
      {revision.review_notes && (
        <p>
          Review: {revision.review_notes} ·{" "}
          {revision.reviewer_id
            ? data.people[revision.reviewer_id] || "Former team member"
            : ""}
        </p>
      )}
    </details>
  );
}
function ReviewForm({
  disabled,
  submit,
}: {
  disabled: boolean;
  submit(decision: string, notes: string): Promise<boolean>;
}) {
  const [decision, setDecision] = useState("approved"),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <form
      class="sales-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(decision, notes);
      }}
    >
      <h4>Step 3 · Completion review</h4>
      <Select
        label="Report review decision"
        value={decision}
        disabled={disabled}
        options={[
          { value: "approved", label: "Approve report and complete service" },
          { value: "rejected", label: "Return report for correction" },
        ]}
        onValueChange={setDecision}
      />
      <label class="ui-field">
        Review notes
        <Textarea
          aria-label="Review notes"
          value={notes}
          minLength={3}
          maxLength={4000}
          required
          disabled={disabled}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
      </label>
      <Checkbox
        label="I reviewed the report and recorded labor"
        checked={confirmed}
        disabled={disabled}
        onChange={(e) => setConfirmed(e.currentTarget.checked)}
      />
      <Button type="submit" variant="primary" disabled={disabled || !confirmed}>
        Save completion review
      </Button>
    </form>
  );
}
