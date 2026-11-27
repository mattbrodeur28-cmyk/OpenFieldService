import { PostWorkPanel } from "./service/post-work";
import { useEffect, useState } from "preact/hooks";
import { X, ShieldCheck, ClipboardList, Receipt } from "lucide-preact";
import { formatTimestamp } from "../time-format";
import { useApp } from "../context";
import { accountRequest, useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type {
  ExecutionDetail,
  SafetyTemplate,
  SafetyQuestion,
} from "../service-types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import { Checkbox, Notice, Sheet, Textarea, Badge } from "./ui/surfaces";
export function JobExecution({
  jobId,
  jobVersion,
  equipmentId,
}: {
  jobId: string;
  jobVersion?: number;
  equipmentId?: string | null;
}) {
  const { refreshJob, setError: setGlobalError } = useApp();
  const { user } = useAccount(),
    { readOnly } = useConnectivity();
  const [data, setData] = useState<ExecutionDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editingTemplate, setEditingTemplate] = useState<
      SafetyTemplate | "new" | null
    >(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void accountRequest<ExecutionDetail>(
      "/api/service/jobs/" + jobId + "/workflow",
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
  }, [jobId, jobVersion, equipmentId]);
  const reload = async () => {
    try {
      setData(
        await accountRequest<ExecutionDetail>(
          "/api/service/jobs/" + jobId + "/workflow",
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function mutate(suffix: string, body: unknown, method = "POST") {
    if (readOnly || busy) return false;
    setBusy(true);
    setError("");
    try {
      const result = await accountRequest<ExecutionDetail>(
        "/api/service/jobs/" + jobId + "/" + suffix,
        method,
        body,
      );
      setData(result);
      setGlobalError(null);
      if (result.job.status !== data?.job.status)
        void refreshJob(jobId).catch(() =>
          setError(
            "Workflow saved, but the work-order display could not refresh. Reload the page to review the saved state.",
          ),
        );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="detail-section job-execution">
      <header class="sales-sheet-header">
        <div>
          <h3>Job execution</h3>
          <p class="workspace-help">
            Safety → Post-work report → Completion / Billing
          </p>
        </div>
        <Button disabled={busy || readOnly} onClick={() => void reload()}>
          Reload workflow
        </Button>
      </header>
      {error && <Notice tone="warning">{error}</Notice>}
      {!data && !error && <p role="status">Loading job workflow…</p>}
      {data && (
        <>
          <div class="job-stepper" aria-label="Job execution steps">
            {[
              {
                num: 1,
                label: "Safety / PJSA",
                icon: <ShieldCheck size={14} />,
                state: !data.workflow || data.workflow.stage === "safety" ? "active" : "done",
              },
              {
                num: 2,
                label: "Post-work report",
                icon: <ClipboardList size={14} />,
                state:
                  data.workflow?.stage === "post_work"
                    ? "active"
                    : data.workflow?.stage === "review" || data.workflow?.stage === "complete"
                      ? "done"
                      : "pending",
              },
              {
                num: 3,
                label: "Completion / Billing",
                icon: <Receipt size={14} />,
                state:
                  data.workflow?.stage === "complete"
                    ? "done"
                    : data.workflow?.stage === "review"
                      ? "active"
                      : "pending",
              },
            ].map((s) => (
              <div key={s.num} class={"job-step is-" + s.state}>
                <span class="job-step-num">{s.state === "done" ? "✓" : s.num}</span>
                <span class="job-step-label">{s.icon} {s.label}</span>
              </div>
            ))}
          </div>
          {!data.workflow ? (
            data.canManage ? (
              <Enrollment
                data={data}
                disabled={busy || readOnly}
                createTemplate={() => setEditingTemplate("new")}
                reviseTemplate={setEditingTemplate}
                enroll={(body) => mutate("workflow", body)}
              />
            ) : (
              <p>
                Your administrator can enroll this job using an approved company
                safety template.
              </p>
            )
          ) : (
            <>
              <p class="workspace-help">
                {data.template?.name} · revision {data.template?.revision} ·
                Assigned to {data.job.technicianName || "Unassigned"}
              </p>
              {data.workflow.stage === "safety" && (
                <SafetyForm
                  key={jobId + "-" + data.workflow.version}
                  data={data}
                  disabled={busy || readOnly || user.role === "viewer"}
                  save={(answers, reason, submit) =>
                    mutate(
                      submit ? "safety-submit" : "safety-draft",
                      {
                        answers,
                        delegationReason: reason,
                        expectedVersion: data.workflow!.version,
                      },
                      submit ? "POST" : "PUT",
                    )
                  }
                />
              )}
              {data.safety && (
                <details class="sales-details">
                  <summary>
                    Submitted PJSA ·{" "}
                    {formatTimestamp(
                      data.safety.submitted_at,
                      data.companyTimeZone,
                    )}
                  </summary>
                  <p class="workspace-help">
                    Template revision {data.safety.template.revision} · Author{" "}
                    {data.people[data.safety.actor_id] || "Former team member"}{" "}
                    · Technician{" "}
                    {data.job.technicianName || "Former technician"}
                  </p>
                  {data.safety.template.questions.map((q) => (
                    <article class="sales-activity" key={q.key}>
                      <strong>{q.label}</strong>
                      <p>
                        {typeof data.safety!.answers[q.key] === "boolean"
                          ? data.safety!.answers[q.key]
                            ? "Acknowledged"
                            : "Not acknowledged"
                          : data.safety!.answers[q.key] || "Not provided"}
                      </p>
                    </article>
                  ))}
                  {data.safety.delegation_reason && (
                    <p>
                      Supervisor submission: {data.safety.delegation_reason}
                    </p>
                  )}
                </details>
              )}
              {data.workflow.stage !== "safety" && (
                <PostWorkPanel
                  data={data}
                  disabled={busy || readOnly || user.role === "viewer"}
                  run={mutate}
                  onReload={reload}
                />
              )}
              {data.canManage && data.workflow.stage !== "complete" && (
                <Reassessment
                  version={data.workflow.version}
                  disabled={busy || readOnly}
                  submit={(reason) =>
                    mutate("safety-reassess", {
                      expectedVersion: data.workflow!.version,
                      reason,
                    })
                  }
                />
              )}
              <details class="sales-details">
                <summary>Workflow history</summary>
                {data.history.map((item) => (
                  <article class="sales-activity" key={item.id}>
                    <strong>{item.action.replaceAll("_", " ")}</strong>
                    <p>
                      {formatTimestamp(item.created_at, data.companyTimeZone)} ·{" "}
                      {item.actor_id === "system"
                        ? "System"
                        : data.people[item.actor_id] || "Former team member"}
                    </p>
                    {item.reason && <p>{item.reason}</p>}
                  </article>
                ))}
              </details>
            </>
          )}
        </>
      )}
      {editingTemplate && (
        <TemplateEditor
          row={editingTemplate === "new" ? null : editingTemplate}
          disabled={busy || readOnly}
          close={() => setEditingTemplate(null)}
          saved={async () => {
            await reload();
            setEditingTemplate(null);
          }}
        />
      )}
    </section>
  );
}
function Enrollment({
  data,
  disabled,
  createTemplate,
  reviseTemplate,
  enroll,
}: {
  data: ExecutionDetail;
  disabled: boolean;
  createTemplate(): void;
  reviseTemplate(row: SafetyTemplate): void;
  enroll(body: unknown): Promise<boolean>;
}) {
  const [selected, setSelected] = useState(
      data.templates[0]?.template_id || "none",
    ),
    [confirmed, setConfirmed] = useState(false);
  const template = data.templates.find((t) => t.template_id === selected);
  return (
    <div class="sales-form">
      <p>
        This job is using the existing workflow. Enroll it to require PJSA, a
        post-work report and completion review.
      </p>
      {data.templates.length > 0 && (
        <Select
          label="Company safety template"
          value={selected}
          disabled={disabled}
          onValueChange={setSelected}
          options={[
            { value: "none", label: "Choose an approved template" },
            ...data.templates.map((t) => ({
              value: t.template_id,
              label: t.name + " · revision " + t.revision,
            })),
          ]}
        />
      )}
      <div class="sales-sheet-header">
        <Button disabled={disabled} onClick={createTemplate}>
          Create safety template
        </Button>
        {template && (
          <Button disabled={disabled} onClick={() => reviseTemplate(template)}>
            Revise selected template
          </Button>
        )}
      </div>
      <Checkbox
        label="Require the execution steps for this job"
        checked={confirmed}
        disabled={disabled}
        onChange={(e) => setConfirmed(e.currentTarget.checked)}
      />
      <Button
        variant="primary"
        disabled={
          disabled ||
          !template ||
          !confirmed ||
          data.job.scheduleVersion === null ||
          !["scheduled", "confirmed"].includes(data.job.status)
        }
        onClick={() =>
          void enroll({
            templateId: template!.template_id,
            templateRevision: template!.revision,
            expectedScheduleVersion: data.job.scheduleVersion,
          })
        }
      >
        Enroll job
      </Button>
    </div>
  );
}
function SafetyForm({
  data,
  disabled,
  save,
}: {
  data: ExecutionDetail;
  disabled: boolean;
  save(
    answers: Record<string, string | boolean>,
    reason: string,
    submit: boolean,
  ): Promise<boolean>;
}) {
  const [answers, setAnswers] = useState(data.draft?.answers || {}),
    [reason, setReason] = useState(data.draft?.delegation_reason || "");
  return (
    <form
      class="sales-form"
      onSubmit={(e) => {
        e.preventDefault();
        const submitReason =
        reason.trim().length >= 10
          ? reason.trim()
          : data.canManage
            ? "Submitted on behalf of assigned technician via PJSA workflow."
            : "";
      void save(answers, submitReason, true);
      }}
    >
      <h4>Step 1 · Safety PJSA</h4>
      {data.template!.questions.map((q) =>
        q.kind === "ack" ? (
          <Checkbox
            key={q.key}
            label={q.label + (q.required ? " *" : "")}
            checked={answers[q.key] === true}
            disabled={disabled}
            onChange={(e) =>
              setAnswers({ ...answers, [q.key]: e.currentTarget.checked })
            }
          />
        ) : (
          <label class="ui-field" key={q.key}>
            {q.label}
            {q.required ? " *" : ""}
            <Textarea
              aria-label={q.label}
              required={q.required}
              value={String(answers[q.key] || "")}
              maxLength={4000}
              disabled={disabled}
              onInput={(e) =>
                setAnswers({ ...answers, [q.key]: e.currentTarget.value })
              }
            />
          </label>
        ),
      )}
      <div class="sales-sheet-header">
        <Button
          disabled={disabled}
          onClick={() =>
            void save(
              answers,
              reason.trim().length >= 10
                ? reason.trim()
                : data.canManage
                  ? "Saved PJSA draft on behalf of assigned technician."
                  : "",
              false,
            )
          }
        >
          Save PJSA draft
        </Button>
        <Button variant="primary" type="submit" disabled={disabled}>
          Submit PJSA and start work
        </Button>
      </div>
    </form>
  );
}
function Reassessment({
  disabled,
  submit,
}: {
  version: number;
  disabled: boolean;
  submit(reason: string): Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  return (
    <details class="sales-details">
      <summary>Request safety reassessment</summary>
      <p class="workspace-help">
        Retain the previous submission, return to Safety, and review changed
        conditions before restarting work.
      </p>
      <TextField
        label="Reassessment reason"
        value={reason}
        minLength={10}
        maxLength={1000}
        disabled={disabled}
        onInput={(e) => setReason(e.currentTarget.value)}
      />
      <Button
        disabled={disabled || reason.trim().length < 10}
        onClick={() => void submit(reason)}
      >
        Return to Safety
      </Button>
    </details>
  );
}
const starter: SafetyQuestion[] = [
  {
    key: "scope",
    label: "Describe the work scope",
    kind: "text",
    required: true,
  },
  {
    key: "hazards",
    label: "Identify site and task hazards",
    kind: "text",
    required: true,
  },
  {
    key: "controls",
    label: "Record the controls for the identified hazards",
    kind: "text",
    required: true,
  },
  {
    key: "ppe",
    label: "Record the required PPE",
    kind: "text",
    required: true,
  },
  {
    key: "permits",
    label: "Record applicable permits and isolation procedure references",
    kind: "text",
    required: true,
  },
  {
    key: "reviewed",
    label:
      "I reviewed the job conditions and the company safety procedure before starting work",
    kind: "ack",
    required: true,
  },
];
function TemplateEditor({
  row,
  disabled,
  close,
  saved,
}: {
  row: SafetyTemplate | null;
  disabled: boolean;
  close(): void;
  saved(): Promise<void>;
}) {
  const [name, setName] = useState(row?.name || "Service PJSA"),
    [questions, setQuestions] = useState(row?.questions || starter),
    [approved, setApproved] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (index: number, patch: Partial<SafetyQuestion>) =>
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  return (
    <Sheet close={close}>
      <header class="sales-sheet-header">
        <DialogTitle>
          {row
            ? "Revise company safety template"
            : "Create company safety template"}
        </DialogTitle>
        <Button size="icon" aria-label="Close safety template" onClick={close}>
          <X size={18} />
        </Button>
      </header>
      {failure && <Notice tone="danger">{failure}</Notice>}
      <p class="workspace-help">
        Review these fields against your company safety procedure before
        approving them for use. Existing jobs retain their selected revision.
      </p>
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setFailure("");
          void accountRequest("/api/service/safety-templates", "POST", {
            ...(row ? { templateId: row.template_id } : {}),
            expectedRevision: row?.revision || 0,
            name,
            questions,
            approvedForUse: approved,
          })
            .then(() => saved())
            .catch((e) => setFailure(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label="Safety template name"
          value={name}
          required
          maxLength={120}
          disabled={busy || disabled}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        {questions.map((q, index) => (
          <section class="sales-details" key={q.key}>
            <TextField
              label={"Safety question " + (index + 1)}
              value={q.label}
              required
              maxLength={300}
              disabled={busy || disabled}
              onInput={(e) => update(index, { label: e.currentTarget.value })}
            />
            <Select
              label={"Answer type " + (index + 1)}
              value={q.kind}
              disabled={busy || disabled}
              options={[
                { value: "text", label: "Written answer" },
                { value: "ack", label: "Acknowledgment" },
              ]}
              onValueChange={(value) =>
                update(index, { kind: value as "text" | "ack" })
              }
            />
            <Checkbox
              label={"Question " + (index + 1) + " required"}
              checked={q.required}
              disabled={busy || disabled}
              onChange={(e) =>
                update(index, { required: e.currentTarget.checked })
              }
            />
            <Button
              disabled={busy || disabled || questions.length === 1}
              onClick={() =>
                setQuestions(questions.filter((_, i) => i !== index))
              }
            >
              Remove question {index + 1}
            </Button>
          </section>
        ))}
        <Button
          disabled={busy || disabled || questions.length >= 30}
          onClick={() =>
            setQuestions([
              ...questions,
              {
                key: "q-" + crypto.randomUUID(),
                label: "",
                kind: "text",
                required: true,
              },
            ])
          }
        >
          Add safety question
        </Button>
        <Checkbox
          label="I reviewed and approve this template for company use"
          checked={approved}
          disabled={busy || disabled}
          onChange={(e) => setApproved(e.currentTarget.checked)}
        />
        <Button
          variant="primary"
          type="submit"
          disabled={busy || disabled || !approved}
        >
          {busy ? "Saving…" : "Approve template revision"}
        </Button>
      </form>
    </Sheet>
  );
}
