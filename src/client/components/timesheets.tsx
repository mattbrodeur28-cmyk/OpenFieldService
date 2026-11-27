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
interface WeeklyCell {
    date: string;
    workedMinutes: number;
    breakMinutes: number;
    requestedBillableMinutes: number;
    entryIds: string[];
    needsDailyAllocation: boolean;
}
interface WeeklyJob {
    jobId: string;
    jobIdentifier: string;
    days: WeeklyCell[];
    workedMinutes: number;
    requestedBillableMinutes: number;
    breakMinutes: number;
    entryIds: string[];
    unallocatedEntryIds: string[];
    crossesWeek: boolean;
}
interface Data {
    weekly?: {
        weekStart: string;
        weekEnd: string;
        days: string[];
        jobs: WeeklyJob[];
        dayTotals: {
            date: string;
            workedMinutes: number;
            needsDailyAllocation: boolean;
        }[];
        hasUnallocatedDays: boolean;
    };
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
    technicians: {
        id: string;
        name: string;
        active: number;
    }[];
    canReview: boolean;
    timeZone: string;
}
const monday = (date: string) => shiftDate(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
const hours = (minutes: number) => (minutes / 60).toFixed(2);
export function Timesheets({ initialTechnician = "" }: { initialTechnician?: string } = {}) {
    const { navigate } = useApp(), { readOnly } = useConnectivity();
    const [options, setOptions] = useState<Options | null>(null), [technician, setTechnician] = useState(initialTechnician), [technicianSearch, setTechnicianSearch] = useState(""), [week, setWeek] = useState(""), [data, setData] = useState<Data | null>(null), [day, setDay] = useState("all"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0), [reason, setReason] = useState(""), [notes, setNotes] = useState(""), [confirmed, setConfirmed] = useState(false);
    useEffect(() => {
        let live = true;
        void accountRequest<Options>("/api/service/timesheets/options")
            .then((value) => {
            if (live) {
                setOptions(value);
                setTechnician(current => value.technicians.some(t => t.id === current) ? current : "");
                setWeek(current => current || monday(dayInZone(value.timeZone)));
            }
        })
            .catch((e) => {
            if (live)
                setError(e.message);
        });
        return () => {
            live = false;
        };
    }, [reload]);
    useEffect(() => {
        let live = true;
        setData(null);
        setConfirmed(false);
        setNotes("");
        setReason("");
        setDay("all");
        if (!technician || !week)
            return;
        setError("");
        void accountRequest<Data>("/api/service/timesheets?" +
            new URLSearchParams({ technicianId: technician, weekStart: week }))
            .then((value) => {
            if (live)
                setData(value);
        })
            .catch((e) => {
            if (live)
                setError(e.message);
        });
        return () => {
            live = false;
        };
    }, [technician, week, reload]);
    async function action(type: "submit" | "approved" | "rejected" | "reopen") {
        if (!data || busy || readOnly)
            return;
        setBusy(true);
        setError("");
        try {
            const value = await accountRequest<Data>("/api/service/timesheets/" +
                (type === "submit"
                    ? "submit"
                    : type === "reopen"
                        ? "reopen"
                        : "review"), "POST", {
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
            });
            setData(value);
            setConfirmed(false);
            setReason("");
            setNotes("");
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    const current = data?.submissions.find((s) => s.id === data.sheet?.submission_id), sourceChanged = !!current && current.source_token !== data?.sourceToken;
    const shown = data?.entries.filter((entry) => day === "all" ||
        localInput(entry.start_at, data.timeZone).slice(0, 10) === day) || [];
    const selectedTechnician = options?.technicians.find(t => t.id === technician);
    const roster = options?.technicians.filter(t => t.name.toLocaleLowerCase().includes(technicianSearch.trim().toLocaleLowerCase())) ?? [];
    function openTimecard(id: string) { setError(""); setData(null); setTechnician(id); }
    return (<div class="page timesheets-page">
      <header class="dispatch-title">
        <div>
          <h1>{technician ? `${selectedTechnician?.name ?? "Technician"} · weekly timecard` : options?.canReview ? "All technicians" : "Technician timecards"}</h1>
          <p class="workspace-help">{technician ? "One week · all Job / Work Order numbers" : "Choose a technician to view their weekly work orders and timecard."}</p>
        </div>
        <div class="timesheet-header-actions">
          {data && <div class="timesheet-period-status" role="status"><span>Week status</span><Badge tone={data.sheet?.status === "approved" ? "success" : data.sheet?.status === "rejected" ? "warning" : "info"}>{data.sheet?.status || "Not submitted"}</Badge></div>}
          <Button disabled={busy} onClick={() => setReload(reload + 1)}><RefreshCw size={15} aria-hidden="true"/> Refresh</Button>
        </div>
      </header>
      {technician && <p class="workspace-help">Submit and approve one Monday–Sunday timesheet covering every Job / Work Order. Worked hours, breaks and requested billable time stay separate. Approval does not calculate wages or post payments.</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      {options?.technicians.length === 0 && (<EmptyState title={options.canReview ? "No technicians yet" : "No technician account linked"}>
          {options.canReview ? "Add technicians in Field Service to make their weekly timecards available here." : "Ask an administrator to link your account to an active technician."}
        </EmptyState>)}
      {!!options?.technicians.length && !technician && <section class="timesheet-roster" aria-label={options.canReview ? "All technicians" : "Available technician timecards"}>
        <div class="timesheet-roster-heading"><TextField label="Find a technician" type="search" value={technicianSearch} maxLength={200} onInput={e => setTechnicianSearch(e.currentTarget.value)}/><span>{roster.length} {roster.length === 1 ? "technician" : "technicians"}</span></div>
        {roster.length ? <div class="timesheet-roster-grid">{roster.map(t => <button key={t.id} type="button" class="ui-card timesheet-technician-card" onClick={() => openTimecard(t.id)}><span class="timesheet-technician-avatar" aria-hidden="true">{t.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span><span class="timesheet-technician-label"><strong>{t.name}</strong><span>Weekly work orders and timecard</span></span><Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge><ChevronRight size={18} aria-hidden="true"/></button>)}</div> : <EmptyState title="No matching technicians">Try a different name.</EmptyState>}
      </section>}
      {!options && !error && <p role="status">Loading technicians…</p>}
      {!!options?.technicians.length && !!technician && (<div class="timesheet-selection-bar">
          <Button disabled={busy} onClick={() => openTimecard("")}><ChevronLeft size={16} aria-hidden="true"/>{options.canReview ? "All technicians" : "Technician timecards"}</Button>
          <div class="timesheet-week-navigation" role="group" aria-label="Timesheet week">
            <Button size="icon" aria-label="Previous week" disabled={busy || !week} onClick={() => setWeek(shiftDate(week, -7))}><ChevronLeft size={16} aria-hidden="true"/></Button>
            <TextField label="Week beginning Monday" type="date" value={week} disabled={busy} onInput={e => { if (e.currentTarget.value)
            setWeek(monday(e.currentTarget.value)); }}/>
            <Button size="icon" aria-label="Next week" disabled={busy || !week} onClick={() => setWeek(shiftDate(week, 7))}><ChevronRight size={16} aria-hidden="true"/></Button>
            <Button disabled={busy || !options} onClick={() => { if (options)
            setWeek(monday(dayInZone(options.timeZone))); }}>This week</Button>
          </div>
        </div>)}
      {technician && !data && !error && (<p role="status">Loading recorded labor…</p>)}
      {data && (<>
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
          {data.weekly && <section class="ui-card timesheet-week-sheet" aria-label="Weekly Job and Work Order timesheet">
            <header><div><h2>Week of {week} – {data.weekly.weekEnd}</h2><p class="workspace-help">Worked hours by Job / Work Order. Submit and approve this entire week together.</p></div><Badge>{data.weekly.jobs.length} {data.weekly.jobs.length === 1 ? 'Job / Work Order' : 'Jobs / Work Orders'}</Badge></header>
            {!data.weekly.jobs.length ? <EmptyState title="No labor recorded for this week">Time recorded against each job is collected here into one weekly timesheet.</EmptyState> : <div class="timesheet-week-scroll"><table class="timesheet-week-grid"><thead><tr><th scope="col">Job / Work Order #</th>{data.weekly.days.map(date => <th key={date} scope="col"><span>{new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span><small>{new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></th>)}<th scope="col">Week hours</th><th scope="col">Requested billable</th></tr></thead><tbody>{data.weekly.jobs.map(row => <tr key={row.jobId}><th scope="row"><Button variant="ghost" onClick={() => navigate('/jobs/' + row.jobId)}>{row.jobIdentifier}</Button><small>{row.entryIds.length} time {row.entryIds.length === 1 ? 'record' : 'records'}</small></th>{row.days.map(cell => <td key={cell.date}>{cell.needsDailyAllocation ? <span class="timesheet-allocation-note" title="An overnight entry needs explicit break/day allocation. Open source details; hours are not divided automatically.">Review overnight</span> : cell.entryIds.length ? <strong title={`${cell.breakMinutes} min breaks · ${hours(cell.requestedBillableMinutes)} h requested billable`}>{hours(cell.workedMinutes)}</strong> : <span class="text-muted">—</span>}</td>)}<td><strong>{row.crossesWeek ? 'Review boundary' : hours(row.workedMinutes)}</strong></td><td>{row.crossesWeek ? 'Review boundary' : hours(row.requestedBillableMinutes)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Daily worked hours</th>{data.weekly.dayTotals.map(total => <td key={total.date}>{total.needsDailyAllocation ? 'Review overnight' : hours(total.workedMinutes)}</td>)}<td>{data.weekly.jobs.some(row => row.crossesWeek) ? 'Review boundary' : hours(data.totals.workedMinutes)}</td><td>{data.weekly.jobs.some(row => row.crossesWeek) ? 'Review boundary' : hours(data.totals.requestedBillableMinutes)}</td></tr></tfoot></table></div>}
            {data.weekly.hasUnallocatedDays && <Notice tone="warning">Overnight records retain their full worked time. Daily cells stay unresolved because break time cannot be split between days automatically. Entries crossing the weekly boundary must be corrected before submission.</Notice>}
          </section>}
          <details class="timesheet-source-details"><summary>Source time records by job and day</summary>
          <div class="timesheet-entry-toolbar">
            <div class="timesheet-entry-heading"><h2>Time entries</h2><p class="workspace-help">{shown.length} {shown.length === 1 ? "entry" : "entries"} · {day === 'all' ? 'Whole week' : new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p></div>
            <Select label="View entries" value={day} options={[
                { value: "all", label: "Whole week" },
                ...Array.from({ length: 7 }, (_, i) => ({
                    value: shiftDate(week, i),
                    label: new Date(shiftDate(week, i) + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
                })),
            ]} onValueChange={setDay}/>
          </div>
          <p class="workspace-help timesheet-grouping-note">Daily view groups entries by their start date; overnight entries show both timestamps. Totals and approval always cover the full week.</p>
          {data.blockers.map((message) => (<Notice key={message} tone="warning">
              {message}
            </Notice>))}
          {sourceChanged && data.sheet?.status === "submitted" && (<Notice tone="warning">
              Source details changed after submission. Return the timesheet for
              correction before approving it.
            </Notice>)}
          <section class="ui-card timesheet-entries" aria-label="Recorded time entries">
            {shown.length === 0 ? (<EmptyState title={day === "all" ? "No recorded labor this week" : "No entries for this day"}>
                {day === "all" ? "Complete the job report and supervisor report review to record time here." : "Choose another day or Whole week to see the other recorded entries."}
              </EmptyState>) : (shown.map((entry) => (<article class="timesheet-entry" key={entry.id}>
                  <header>
                    <Button variant="ghost" onClick={() => navigate("/jobs/" + entry.job_id)}>
                      {entry.job_identifier}
                    </Button>
                    <Badge tone={entry.state === "approved" ? "success" : "info"}>
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
                </article>)))}
          </section>
          </details>
          {(!data.sheet || data.sheet.status === "rejected") && (<section class="ui-card timesheet-action-panel">
              <h2>Submit weekly time</h2>
              {data.canReview && (<TextField label="Submitting for technician: reason" value={reason} maxLength={1000} disabled={busy || readOnly} hint="Required when submitting on behalf of another technician; at least 10 characters." onInput={(e) => setReason(e.currentTarget.value)}/>)}
              <Checkbox label="I reviewed the full week’s recorded entries and breaks" checked={confirmed} disabled={busy || readOnly} onChange={(e) => setConfirmed(e.currentTarget.checked)}/>
              <Button variant="primary" disabled={busy || readOnly || !confirmed || !!data.blockers.length} onClick={() => void action("submit")}>
                Submit week for review
              </Button>
            </section>)}
          {data.sheet?.status === "submitted" && data.canReview && (<section class="ui-card timesheet-action-panel">
              <h2>Supervisor review</h2>
              <TextField label="Timesheet review notes" value={notes} minLength={10} maxLength={2000} disabled={busy || readOnly} onInput={(e) => setNotes(e.currentTarget.value)}/>
              <Checkbox label="I reviewed this weekly timesheet and its source entries" checked={confirmed} disabled={busy || readOnly} onChange={(e) => setConfirmed(e.currentTarget.checked)}/>
              <div class="timesheet-review-actions">
                <Button variant="primary" disabled={busy ||
                    readOnly ||
                    !confirmed ||
                    notes.trim().length < 10 ||
                    sourceChanged ||
                    !!data.blockers.length} onClick={() => void action("approved")}>
                  Approve and lock week
                </Button>
                <Button disabled={busy || readOnly || !confirmed || notes.trim().length < 10} onClick={() => void action("rejected")}>
                  Return for correction
                </Button>
              </div>
            </section>)}
          {data.sheet?.status === "approved" && (<>
              <Notice tone="success">
                Approved and locked. Prior submissions and approvals stay in
                history when a period is reopened for correction.
              </Notice>
              <a class="btn" download href={"/api/service/timesheets/export?" +
                    new URLSearchParams({
                        technicianId: technician,
                        weekStart: week,
                    })}>
                Export approved source CSV
              </a>
              {data.canReview && (<details class="sales-details">
                  <summary>Reopen approved week for correction</summary>
                  <Notice tone="warning">
                    Reopening unlocks this period for additional labor and
                    requires a new submission and approval. It does not reverse
                    external payroll, invoices or accounting exports. Coordinate
                    those corrections separately.
                  </Notice>
                  <TextField label="Reason for reopening approved week" value={reason} minLength={10} maxLength={2000} disabled={busy || readOnly} onInput={(e) => setReason(e.currentTarget.value)}/>
                  <Checkbox label="I reviewed the effect on payroll and accounting exports" checked={confirmed} disabled={busy || readOnly} onChange={(e) => setConfirmed(e.currentTarget.checked)}/>
                  <Button disabled={busy ||
                        readOnly ||
                        !confirmed ||
                        reason.trim().length < 10} onClick={() => void action("reopen")}>
                    Reopen week for correction
                  </Button>
                </details>)}
            </>)}
          {data.adjustments.length > 0 && (<details class="sales-details">
              <summary>Period correction history</summary>
              {data.adjustments.map((a) => (<article class="timesheet-entry" key={a.id}>
                  <p>
                    {formatTimestamp(a.created_at, data.timeZone)} · reopened
                    after version {a.previous_version}
                  </p>
                  <p>{a.reason}</p>
                </article>))}
            </details>)}
          {data.submissions.length > 0 && (<details class="sales-details">
              <summary>Submission and review history</summary>
              {data.submissions.map((s) => (<article class="timesheet-entry" key={s.id}>
                  <h3>
                    Revision {s.revision} · {s.decision || "Awaiting review"}
                  </h3>
                  <p>
                    {formatTimestamp(s.created_at, data.timeZone)} ·{" "}
                    {s.entries.length} source entries ·{" "}
                    {hours(s.entries.reduce((n, e) => n + e.worked_minutes, 0))}{" "}
                    h worked
                  </p>
                  {s.delegation_reason && (<p>
                      Submitted on behalf of technician: {s.delegation_reason}
                    </p>)}
                  {s.review_notes && <p>Review: {s.review_notes}</p>}
                </article>))}
            </details>)}
        </>)}
    </div>);
}
