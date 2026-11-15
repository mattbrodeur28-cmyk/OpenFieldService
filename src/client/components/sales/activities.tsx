import { useCompanyTimeZone } from "../../hooks/use-company-timezone";
import { localInput, resolveLocal, formatTimestamp } from "../../time-format";
import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import { accountRequest, useAccount } from "../../auth";
import type {
  Opportunity,
  SalesActivity,
  SalesActivityList,
  SalesMutation,
  SalesOptions,
} from "../../sales-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { DialogTitle } from "../ui/dialog";
import { Notice, Sheet, Textarea, Badge } from "../ui/surfaces";
const kinds = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "site_survey", label: "Site survey" },
  { value: "task", label: "Task" },
];
export function ActivityPanel({
  row,
  options,
  admin,
  disabled,
  error,
  mutate,
}: {
  row: Opportunity;
  options: SalesOptions;
  admin: boolean;
  disabled: boolean;
  error: string;
  mutate: SalesMutation;
}) {
  const { user } = useAccount();
  const company = useCompanyTimeZone();
  const when = (value: string) =>
    formatTimestamp(value, company.timeZone || "UTC");
  const [data, setData] = useState<SalesActivityList | null>(null),
    [failure, setFailure] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<SalesActivity | "new" | null>(null);
  useEffect(() => {
    let live = true;
    setFailure("");
    void accountRequest<SalesActivityList>(
      "/api/sales/activities?" +
        new URLSearchParams({
          opportunityId: row.id,
          status: "all",
          assignee: "all",
          page: String(page),
        }),
    )
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live) setFailure(e.message);
      });
    return () => {
      live = false;
    };
  }, [row.id, row.version, page]);
  const named = (id: string) =>
    options.owners.find((p) => p.id === id)?.name || "Former team member";
  return (
    <section class="sales-details">
      <header class="sales-sheet-header">
        <div>
          <h3>Follow-ups</h3>
          <p class="workspace-help">
            Calls, site surveys and tasks share this opportunity’s history.
          </p>
        </div>
        <Button
          disabled={
            disabled ||
            !company.timeZone ||
            (!admin && row.owner_id !== user.id)
          }
          onClick={() => setEditing("new")}
        >
          Add activity
        </Button>
      </header>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {!data && !failure && <p role="status">Loading activities…</p>}
      {data?.total === 0 && (
        <p class="workspace-help">
          No follow-ups yet. Add the next step for this opportunity.
        </p>
      )}
      {data?.activities.map((activity) => (
        <article class="sales-activity" key={activity.id}>
          <header class="sales-sheet-header">
            <strong>{activity.title}</strong>
            <Badge tone={activity.status === "open" ? "info" : "neutral"}>
              {activity.status}
            </Badge>
          </header>
          <p>
            {kinds.find((k) => k.value === activity.kind)?.label} ·{" "}
            {named(activity.assignee_id)} · Due {when(activity.due_at)}
          </p>
          <small>
            Added by {named(activity.created_by)} · Reminder{" "}
            {when(activity.reminder_at)}
          </small>
          {activity.details && <p>{activity.details}</p>}
          {activity.outcome && <p>Outcome: {activity.outcome}</p>}
          {activity.completed_by && (
            <small>
              Completed by {named(activity.completed_by)} ·{" "}
              {when(activity.completed_at!)}
            </small>
          )}
          {activity.team_id && (
            <p>
              <a
                href={
                  "/team/" +
                  activity.team_id +
                  "#message-" +
                  activity.message_id
                }
              >
                Open linked team conversation
              </a>{" "}
              · Team permissions apply
            </p>
          )}
          <Button
            disabled={
              disabled ||
              (!admin &&
                row.owner_id !== user.id &&
                activity.assignee_id !== user.id)
            }
            onClick={() => setEditing(activity)}
          >
            Edit activity
          </Button>
        </article>
      ))}
      {data && data.total > 50 && (
        <div class="sales-sheet-header">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous activities
          </Button>
          <span>
            Page {page} · {data.total} activities
          </span>
          <Button
            disabled={page * 50 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            Next activities
          </Button>
        </div>
      )}
      {editing && company.timeZone && (
        <ActivityEditor
          row={row}
          activity={editing === "new" ? null : editing}
          options={options}
          admin={admin}
          disabled={disabled}
          error={error}
          timeZone={company.timeZone}
          close={() => setEditing(null)}
          mutate={mutate}
        />
      )}
    </section>
  );
}
function ActivityEditor({
  row,
  activity,
  options,
  admin,
  disabled,
  error,
  close,
  timeZone,
  mutate,
}: {
  row: Opportunity;
  activity: SalesActivity | null;
  options: SalesOptions;
  admin: boolean;
  disabled: boolean;
  error: string;
  timeZone: string;
  close(): void;
  mutate: SalesMutation;
}) {
  const { user, teams } = useAccount();
  const [title, setTitle] = useState(activity?.title || ""),
    [kind, setKind] = useState(activity?.kind || "task"),
    [details, setDetails] = useState(activity?.details || ""),
    [assignee, setAssignee] = useState(activity?.assignee_id || user.id),
    [due, setDue] = useState(
      localInput(
        activity?.due_at || new Date(Date.now() + 86400000).toISOString(),
        timeZone,
      ),
    ),
    [reminder, setReminder] = useState(
      localInput(
        activity?.reminder_at || new Date(Date.now() + 86400000).toISOString(),
        timeZone,
      ),
    ),
    [status, setStatus] = useState(activity?.status || "open"),
    [outcome, setOutcome] = useState(activity?.outcome || ""),
    [message, setMessage] = useState(activity?.message_id || "none"),
    [team, setTeam] = useState(activity?.team_id || "none"),
    [messages, setMessages] = useState<{ id: string; content: string }[]>([]),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    let live = true;
    setMessages([]);
    if (team !== "none")
      void accountRequest<{
        messages: { id: string; content: string }[];
        canReadMessages: boolean;
      }>("/api/auth/teams/" + team)
        .then((result) => {
          if (live) setMessages(result.canReadMessages ? result.messages : []);
        })
        .catch((e) => {
          if (live) setFailure(e.message);
        });
    return () => {
      live = false;
    };
  }, [team]);
  return (
    <Sheet close={close}>
      <header class="sales-sheet-header">
        <DialogTitle>
          {activity ? "Edit activity" : "Plan a follow-up"}
        </DialogTitle>
        <Button size="icon" aria-label="Close activity" onClick={close}>
          <X size={18} />
        </Button>
      </header>
      {(error || failure) && <Notice tone="danger">{failure || error}</Notice>}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          setFailure("");
          let dueAt, reminderAt;
          try {
            dueAt = resolveLocal(due, activity?.due_at || "", timeZone);
            reminderAt = resolveLocal(
              reminder,
              activity?.reminder_at || "",
              timeZone,
            );
            if (reminderAt > dueAt)
              throw new Error("Reminder must be at or before the due time.");
          } catch (e) {
            setFailure((e as Error).message);
            return;
          }
          setBusy(true);
          void mutate(
            "/api/sales/opportunities/" +
              row.id +
              "/activities" +
              (activity ? "/" + activity.id : ""),
            activity ? "PUT" : "POST",
            {
              title,
              kind,
              details,
              assigneeId: assignee,
              dueAt,
              reminderAt,
              status,
              outcome,
              messageId: message === "none" ? null : message,
              ...(activity
                ? { expectedVersion: activity.version }
                : { expectedOpportunityVersion: row.version }),
            },
            "Sales activity saved.",
          )
            .then((ok) => {
              if (ok) close();
            })
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label="Activity title"
          value={title}
          maxLength={200}
          required
          disabled={busy || disabled}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <Select
          label="Activity type"
          value={kind}
          options={kinds}
          disabled={busy || disabled}
          onValueChange={(v) => setKind(v as SalesActivity["kind"])}
        />
        <Select
          label="Assigned to"
          value={assignee}
          options={options.owners.map((p) => ({
            value: p.id,
            label: p.name,
            disabled:
              !admin && p.id !== user.id && p.id !== activity?.assignee_id,
          }))}
          disabled={busy || disabled}
          onValueChange={setAssignee}
        />
        <div class="sales-form-grid">
          <TextField
            id={"sales-followup-due-" + (activity?.id || row.id)}
            label="Due date and time"
            type="datetime-local"
            value={due}
            required
            disabled={busy || disabled}
            onInput={(e) => setDue(e.currentTarget.value)}
          />
          <TextField
            id={"sales-followup-reminder-" + (activity?.id || row.id)}
            label="Reminder date and time"
            type="datetime-local"
            value={reminder}
            required
            disabled={busy || disabled}
            onInput={(e) => setReminder(e.currentTarget.value)}
          />
        </div>
        <p class="workspace-help">
          Reminders appear in Sales while the workspace is open; email and push
          delivery are not enabled. Repeated daylight-saving times require a
          different, unambiguous time.
        </p>
        <label class="ui-field">
          Activity details
          <Textarea
            aria-label="Activity details"
            value={details}
            maxLength={8000}
            disabled={busy || disabled}
            onInput={(e) => setDetails(e.currentTarget.value)}
          />
        </label>
        <Select
          label="Activity status"
          value={status}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          disabled={busy || disabled}
          onValueChange={(v) => setStatus(v as SalesActivity["status"])}
        />
        <label class="ui-field">
          Outcome or cancellation reason
          <Textarea
            aria-label="Outcome or cancellation reason"
            value={outcome}
            maxLength={4000}
            minLength={status === "open" ? undefined : 3}
            required={status !== "open"}
            disabled={busy || disabled}
            onInput={(e) => setOutcome(e.currentTarget.value)}
          />
        </label>
        <details class="sales-details">
          <summary>Link a team conversation</summary>
          <p class="workspace-help">
            Choose a message you can read. Sales stores its reference, without
            copying private message content.
          </p>
          <Select
            label="Conversation team"
            value={team}
            options={[
              { value: "none", label: "No conversation" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
              ...(team !== "none" && !teams.some((t) => t.id === team)
                ? [{ value: team, label: "Linked team" }]
                : []),
            ]}
            disabled={busy || disabled}
            onValueChange={(v) => {
              setTeam(v);
              setMessage("none");
            }}
          />
          <Select
            label="Linked message"
            value={message}
            options={[
              { value: "none", label: "No linked message" },
              ...messages.map((m) => ({
                value: m.id,
                label: m.content.slice(0, 120) || "Message",
              })),
              ...(message !== "none" && !messages.some((m) => m.id === message)
                ? [{ value: message, label: "Existing linked message" }]
                : []),
            ]}
            disabled={busy || disabled || team === "none"}
            onValueChange={setMessage}
          />
          <small>
            Choose from the most recent 100 messages available to your account.
          </small>
        </details>
        <Button variant="primary" type="submit" disabled={busy || disabled}>
          {busy ? "Saving…" : "Save activity"}
        </Button>
      </form>
    </Sheet>
  );
}
export function FollowUpInbox({ open }: { open(id: string): void }) {
  const company = useCompanyTimeZone();
  const when = (value: string) =>
    formatTimestamp(value, company.timeZone || "UTC");
  const [data, setData] = useState<SalesActivityList | null>(null),
    [failure, setFailure] = useState(""),
    [assignee, setAssignee] = useState("me"),
    [status, setStatus] = useState("open"),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    const load = () =>
      void accountRequest<SalesActivityList>(
        "/api/sales/activities?" +
          new URLSearchParams({ assignee, status, page: String(page) }),
      )
        .then((value) => {
          if (live) {
            setData(value);
            setFailure("");
          }
        })
        .catch((e) => {
          if (live) setFailure(e.message);
        });
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [assignee, status, page]);
  return (
    <section class="sales-details">
      <h2>Sales follow-ups</h2>
      <p class="workspace-help">
        Independent of pipeline filters above. Open an opportunity to update its
        activities.
      </p>
      <div class="sales-form-grid">
        <Select
          label="Follow-up assignee"
          value={assignee}
          options={[
            { value: "me", label: "Assigned to me" },
            { value: "all", label: "Everyone" },
          ]}
          onValueChange={(v) => {
            setAssignee(v);
            setPage(1);
          }}
        />
        <Select
          label="Follow-up status"
          value={status}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "all", label: "All statuses" },
          ]}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {!data && !failure && <p role="status">Loading follow-ups…</p>}
      {data?.total === 0 && <p>No matching follow-ups.</p>}
      {data?.activities.map((a) => (
        <article class="sales-activity" key={a.id}>
          <Badge tone="info">{a.status}</Badge>
          <h3>{a.title}</h3>
          <p>
            {a.opportunity_title} · Due {when(a.due_at)}
          </p>
          {a.status === "open" && a.reminder_at <= data.now && (
            <p role="status">
              {a.due_at < data.now ? "Overdue" : "Reminder due"}
            </p>
          )}
          <Button onClick={() => open(a.opportunity_id)}>
            Open opportunity
          </Button>
        </article>
      ))}
      {data && (
        <div class="sales-sheet-header">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous follow-ups
          </Button>
          <span>
            {data.total} follow-ups · Page {page}
          </span>
          <Button
            disabled={page * 50 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            Next follow-ups
          </Button>
        </div>
      )}
    </section>
  );
}

export function ReminderSummary({
  reload,
  open,
}: {
  reload: string;
  open(): void;
}) {
  const [count, setCount] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      void accountRequest<{ total: number }>("/api/sales/activities/reminders")
        .then((value) => {
          if (live) {
            setCount(value.total);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [reload]);
  return error ? (
    <Notice tone="warning">
      Follow-up reminders could not refresh: {error}
    </Notice>
  ) : count ? (
    <Notice tone="info">
      {count} of your open follow-ups need attention.{" "}
      <Button onClick={open}>View follow-ups</Button>
    </Notice>
  ) : null;
}
