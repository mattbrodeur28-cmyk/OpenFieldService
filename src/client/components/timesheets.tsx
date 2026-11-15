import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-preact";
import "./timesheets.css";
import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { dayInZone, shiftDate } from "../dispatch-layout.mjs";
import { formatTimestamp, localInput } from "../time-format";
import { useApp } from "../context";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Card, Checkbox, Notice, EmptyState } from "./ui/surfaces";
interface Entry {
  id: string;
  job_id: string;
  job_identifier: string;
  start_at: string;
  end_at: string;
  worked_minutes: number;
  break_minutes: number;
  requested_billable_minutes: number;
  work_type: string;
  state: string;
  notes: string;
}
interface Submission {
  id: string;
  revision: number;
  entries: Entry[];
  source_token: string;
  delegation_reason: string;
  created_at: string;
  decision: string | null;
  review_notes: string | null;
}
interface Data {
  technicianId: string;
  weekStart: string;
  timeZone: string;
  sheet: {
    id: string;
    version: number;
    status: string;
    submission_id: string;
  } | null;
  entries: Entry[];
  submissions: Submission[];
  adjustments: {
    id: string;
    reason: string;
    created_at: string;
    previous_version: number;
  }[];
  blockers: string[];
  sourceToken: string;
  totals: {
    workedMinutes: number;
    breakMinutes: number;
    requestedBillableMinutes: number;
  };
  canReview: boolean;
}
interface Options {
  technicians: { id: string; name: string; active: number }[];
  canReview: boolean;
  timeZone: string;
}
const monday = (date: string) =>
  shiftDate(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
const hours = (minutes: number) => (minutes / 60).toFixed(2);
export function Timesheets() {
  const { navigate } = useApp(),
    { readOnly } = useConnectivity();
  const [options, setOptions] = useState<Options | null>(null),
    [technician, setTechnician] = useState(""),
    [week, setWeek] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [day, setDay] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let live = true;
    void accountRequest<Options>("/api/service/timesheets/options")
      .then((value) => {
        if (live) {
          setOptions(value);
          setTechnician(value.technicians[0]?.id || "");
          setWeek(monday(dayInZone(value.timeZone)));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setData(null);
    setConfirmed(false);
    setNotes("");
    setReason("");
    setDay("all");
    if (!technician || !week) return;
    setError("");
    void accountRequest<Data>(
      "/api/service/timesheets?" +
        new URLSearchParams({ technicianId: technician, weekStart: week }),
    )
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [technician, week, reload]);
  async function action(type: "submit" | "approved" | "rejected" | "reopen") {
    if (!data || busy || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const value = await accountRequest<Data>(
        "/api/service/timesheets/" +
          (type === "submit"
            ? "submit"
            : type === "reopen"
              ? "reopen"
              : "review"),
        "POST",
        {
          technicianId: technician,
          weekStart: week,
          expectedVersion: data.sheet?.version || 0,
          ...(type === "submit"
            ? { sourceToken: data.sourceToken, delegationReason: reason }
            : type === "reopen"
              ? { reason, acknowledgeExternalReview: true }
              : {
                  submissionId: data.sheet!.submission_id,
                  decision: type,
                  notes,
                }),
        },
      );
      setData(value);
      setConfirmed(false);
      setReason("");
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = data?.submissions.find(
      (s) => s.id === data.sheet?.submission_id,
    ),
    sourceChanged = !!current && current.source_token !== data?.sourceToken;
  const shown =
    data?.entries.filter(
      (entry) =>
        day === "all" ||
        localInput(entry.start_at, data.timeZone).slice(0, 10) === day,
    ) || [];
  return (
    <div class="page timesheets-page">
      <header class="dispatch-title">
        <div>
          <h1>Timesheets</h1>
          <p class="workspace-help">Recorded labor and weekly approvals</p>
        </div>
        <div class="timesheet-header-actions">
          {data && <div class="timesheet-period-status" role="status"><span>Week status</span><Badge tone={data.sheet?.status === "approved" ? "success" : data.sheet?.status === "rejected" ? "warning" : "info"}>{data.sheet?.status || "Not submitted"}</Badge></div>}
          <Button disabled={busy} onClick={() => setReload(reload + 1)}><RefreshCw size={15} aria-hidden="true" /> Refresh</Button>
        </div>
      </header>
      <p class="workspace-help">
        Review recorded technician labor by week or day. Worked hours, breaks
        and requested billable time stay separate. Approval does not calculate
        wages or post payments.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {options?.technicians.length === 0 && (
        <EmptyState title="No technician account linked">
          Ask an administrator to link your account to an active technician.
        </EmptyState>
      )}
      {!!options?.technicians.length && (
        <div class="timesheet-selection-bar">
          <Select
            label="Technician"
            value={technician}
            disabled={busy}
            options={options.technicians.map((t) => ({
              value: t.id,
              label: t.name + (t.active ? "" : " (inactive)"),
            }))}
            onValueChange={setTechnician}
          />
          <div class="timesheet-week-navigation" role="group" aria-label="Timesheet week">
            <Button size="icon" aria-label="Previous week" disabled={busy || !week} onClick={() => setWeek(shiftDate(week,-7))}><ChevronLeft size={16} aria-hidden="true"/></Button>
            <TextField label="Week beginning Monday" type="date" value={week} disabled={busy} onInput={e=>{if(e.currentTarget.value)setWeek(monday(e.currentTarget.value));}} />
            <Button size="icon" aria-label="Next week" disabled={busy || !week} onClick={() => setWeek(shiftDate(week,7))}><ChevronRight size={16} aria-hidden="true"/></Button>
            <Button disabled={busy || !options} onClick={()=>{if(options)setWeek(monday(dayInZone(options.timeZone)));}}>This week</Button>
          </div>
        </div>
      )}
      {technician && !data && !error && (
        <p role="status">Loading recorded labor…</p>
      )}
      {data && (
        <>
          <section class="timesheet-summary" aria-label="Full week totals">
            <Card>
              <strong>{hours(data.totals.workedMinutes)} h</strong>
              <span>Recorded worked time</span>
            </Card>
            <Card>
              <strong>{data.totals.breakMinutes} min</strong>
              <span>Recorded breaks</span>
            </Card>
            <Card>
              <strong>{hours(data.totals.requestedBillableMinutes)} h</strong>
              <span>Requested billable time</span>
            </Card>
          </section>
          <div class="timesheet-entry-toolbar">
            <div class="timesheet-entry-heading"><h2>Time entries</h2><p class="workspace-help">{shown.length} {shown.length===1?"entry":"entries"} · {day==='all'?'Whole week':new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</p></div>
            <Select
              label="View entries"
              value={day}
              options={[
                { value: "all", label: "Whole week" },
                ...Array.from({ length: 7 }, (_, i) => ({
                  value: shiftDate(week, i),
                  label: new Date(shiftDate(week,i)+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}),
                })),
              ]}
              onValueChange={setDay}
            />
          </div>
          <p class="workspace-help timesheet-grouping-note">Daily view groups entries by their start date; overnight entries show both timestamps. Totals and approval always cover the full week.</p>
          {data.blockers.map((message) => (
            <Notice key={message} tone="warning">
              {message}
            </Notice>
          ))}
          {sourceChanged && data.sheet?.status === "submitted" && (
            <Notice tone="warning">
              Source details changed after submission. Return the timesheet for
              correction before approving it.
            </Notice>
          )}
          <section
            class="ui-card timesheet-entries"
            aria-label="Recorded time entries"
          >
            {shown.length === 0 ? (
              <EmptyState title={day === "all" ? "No recorded labor this week" : "No entries for this day"}>
                {day === "all" ? "Complete the job report and supervisor report review to record time here." : "Choose another day or Whole week to see the other recorded entries."}
              </EmptyState>
            ) : (
              shown.map((entry) => (
                <article class="timesheet-entry" key={entry.id}>
                  <header>
                    <Button
                      variant="ghost"
                      onClick={() => navigate("/jobs/" + entry.job_id)}
                    >
                      {entry.job_identifier}
                    </Button>
                    <Badge
                      tone={entry.state === "approved" ? "success" : "info"}
                    >
                      {entry.state}
                    </Badge>
                    <span>{entry.work_type}</span>
                  </header>
                  <p>
                    {formatTimestamp(entry.start_at, data.timeZone)} →{" "}
                    {formatTimestamp(entry.end_at, data.timeZone)}
                  </p>
                  <p>
                    <strong>{hours(entry.worked_minutes)} h worked</strong> ·{" "}
                    {entry.break_minutes} min breaks ·{" "}
                    {hours(entry.requested_billable_minutes)} h requested
                    billable
                  </p>
                  {entry.notes && <p>{entry.notes}</p>}
                </article>
              ))
            )}
          </section>
          {(!data.sheet || data.sheet.status === "rejected") && (
            <section class="ui-card timesheet-action-panel">
              <h2>Submit weekly time</h2>
              {data.canReview && (
                <TextField
                  label="Submitting for technician: reason"
                  value={reason}
                  maxLength={1000}
                  disabled={busy || readOnly}
                  hint="Required when submitting on behalf of another technician; at least 10 characters."
                  onInput={(e) => setReason(e.currentTarget.value)}
                />
              )}
              <Checkbox
                label="I reviewed the full week’s recorded entries and breaks"
                checked={confirmed}
                disabled={busy || readOnly}
                onChange={(e) => setConfirmed(e.currentTarget.checked)}
              />
              <Button
                variant="primary"
                disabled={
                  busy || readOnly || !confirmed || !!data.blockers.length
                }
                onClick={() => void action("submit")}
              >
                Submit week for review
              </Button>
            </section>
          )}
          {data.sheet?.status === "submitted" && data.canReview && (
            <section class="ui-card timesheet-action-panel">
              <h2>Supervisor review</h2>
              <TextField
                label="Timesheet review notes"
                value={notes}
                minLength={10}
                maxLength={2000}
                disabled={busy || readOnly}
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
              <Checkbox
                label="I reviewed this weekly timesheet and its source entries"
                checked={confirmed}
                disabled={busy || readOnly}
                onChange={(e) => setConfirmed(e.currentTarget.checked)}
              />
              <div class="timesheet-review-actions">
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    readOnly ||
                    !confirmed ||
                    notes.trim().length < 10 ||
                    sourceChanged ||
                    !!data.blockers.length
                  }
                  onClick={() => void action("approved")}
                >
                  Approve and lock week
                </Button>
                <Button
                  disabled={
                    busy || readOnly || !confirmed || notes.trim().length < 10
                  }
                  onClick={() => void action("rejected")}
                >
                  Return for correction
                </Button>
              </div>
            </section>
          )}
          {data.sheet?.status === "approved" && (
            <>
              <Notice tone="success">
                Approved and locked. Prior submissions and approvals stay in
                history when a period is reopened for correction.
              </Notice>
              <a
                class="btn"
                download
                href={
                  "/api/service/timesheets/export?" +
                  new URLSearchParams({
                    technicianId: technician,
                    weekStart: week,
                  })
                }
              >
                Export approved source CSV
              </a>
              {data.canReview && (
                <details class="sales-details">
                  <summary>Reopen approved week for correction</summary>
                  <Notice tone="warning">
                    Reopening unlocks this period for additional labor and
                    requires a new submission and approval. It does not reverse
                    external payroll, invoices or accounting exports. Coordinate
                    those corrections separately.
                  </Notice>
                  <TextField
                    label="Reason for reopening approved week"
                    value={reason}
                    minLength={10}
                    maxLength={2000}
                    disabled={busy || readOnly}
                    onInput={(e) => setReason(e.currentTarget.value)}
                  />
                  <Checkbox
                    label="I reviewed the effect on payroll and accounting exports"
                    checked={confirmed}
                    disabled={busy || readOnly}
                    onChange={(e) => setConfirmed(e.currentTarget.checked)}
                  />
                  <Button
                    disabled={
                      busy ||
                      readOnly ||
                      !confirmed ||
                      reason.trim().length < 10
                    }
                    onClick={() => void action("reopen")}
                  >
                    Reopen week for correction
                  </Button>
                </details>
              )}
            </>
          )}
          {data.adjustments.length > 0 && (
            <details class="sales-details">
              <summary>Period correction history</summary>
              {data.adjustments.map((a) => (
                <article class="timesheet-entry" key={a.id}>
                  <p>
                    {formatTimestamp(a.created_at, data.timeZone)} · reopened
                    after version {a.previous_version}
                  </p>
                  <p>{a.reason}</p>
                </article>
              ))}
            </details>
          )}
          {data.submissions.length > 0 && (
            <details class="sales-details">
              <summary>Submission and review history</summary>
              {data.submissions.map((s) => (
                <article class="timesheet-entry" key={s.id}>
                  <h3>
                    Revision {s.revision} · {s.decision || "Awaiting review"}
                  </h3>
                  <p>
                    {formatTimestamp(s.created_at, data.timeZone)} ·{" "}
                    {s.entries.length} source entries ·{" "}
                    {hours(s.entries.reduce((n, e) => n + e.worked_minutes, 0))}{" "}
                    h worked
                  </p>
                  {s.delegation_reason && (
                    <p>
                      Submitted on behalf of technician: {s.delegation_reason}
                    </p>
                  )}
                  {s.review_notes && <p>Review: {s.review_notes}</p>}
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
