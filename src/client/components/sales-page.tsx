import { lazy, Suspense } from "preact/compat";
const QuotesPage = lazy(() => import("./quotes/quotes-page"));
import { businessModules } from '../business-modules';
import { ModuleOverview } from './module-overview';
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  Plus,
  RefreshCw,
  Settings2,
  X,
  GripVertical,
  Search,
  ArrowRight,
} from "lucide-preact";
import { accountRequest, useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type {
  SalesPipeline,
  Opportunity,
  SalesOptions,
  SalesBoard,
} from "../sales-types";
import { salesMoney, salesMinor } from "../sales-types";
import { dateLabel, stageAge } from "../sales-format";
import { PipelineEditor } from "./sales/pipeline-editor";
import { FollowUpInbox, ReminderSummary } from "./sales/activities";
import { OpportunityEditor } from "./sales/opportunity-editor";
import { MoveForm } from "./sales/move-form";
import { Button } from "./ui/button";
import { Input, TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import {
  Badge,
  Notice,
  Sheet,
  EmptyState,
  LoadingState,
  Table,
} from "./ui/surfaces";
const emptyOptions: SalesOptions = {
  owners: [],
  customers: [],
  sites: [],
  assets: [],
};
function SalesWorkspace({ opportunityId }: { opportunityId: string | null }) {
  const { user } = useAccount(),
    connectivity = useConnectivity(),
    admin = isAdministrator(user);
  const [pipelines, setPipelines] = useState<SalesPipeline[]>([]),
    [pipelineId, setPipelineId] = useState(""),
    [board, setBoard] = useState<SalesBoard | null>(null),
    [options, setOptions] = useState<SalesOptions>(emptyOptions),
    [ownerFilter, setOwnerFilter] = useState("all"),
    [status, setStatus] = useState("open"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [minValue, setMinValue] = useState(""),
    [maxValue, setMaxValue] = useState(""),
    [view, setView] = useState("board"),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [editor, setEditor] = useState<Opportunity | "new" | null>(null),
    [pipelineEditor, setPipelineEditor] = useState<
      SalesPipeline | "new" | null
    >(null),
    [movePrompt, setMovePrompt] = useState<{
      row: Opportunity;
      stageId: string;
    } | null>(null),
    [drag, setDrag] = useState<{
      row: Opportunity;
      x: number;
      y: number;
      stageId: string;
    } | null>(null);
  const alive = useRef(true),
    seq = useRef(0),
    dragRef = useRef<{
      row: Opportunity;
      x: number;
      y: number;
      originX: number;
      originY: number;
      stageId: string;
      moved: boolean;
    } | null>(null),
    pointer = useRef<{
      move(e: PointerEvent): void;
      up(e: PointerEvent): void;
      cancel(): void;
    } | null>(null),
    boardRef = useRef<HTMLDivElement>(null),
    suppress = useRef(0),
    dirty = useRef(false),
    refresh = useRef<() => Promise<void>>(async () => {});
  const pipeline = pipelines.find((p) => p.id === pipelineId),
    canWrite =
      user.role !== "viewer" && !connectivity.readOnly && !failed && !busy,
    canEdit = (row: Opportunity) =>
      canWrite && (admin || row.owner_id === user.id);
  const initialize = useCallback(async () => {
    try {
      const [data, options] = await Promise.all([
        accountRequest<{ pipelines: SalesPipeline[] }>("/api/sales/pipelines"),
        accountRequest<SalesOptions>("/api/sales/options"),
      ]);
      if (!alive.current) return;
      setPipelines(data.pipelines);
      setOptions(options);
      setPipelineId((current) => current || data.pipelines[0]?.id || "");
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setFailed(true);
      }
    }
  }, []);
  const load = useCallback(async () => {
    if (!pipelineId) return;
    const current = ++seq.current;
    try {
      const [result, metadata] = await Promise.all([
        accountRequest<SalesBoard>(
          "/api/sales/opportunities?" +
            new URLSearchParams({
              pipelineId,
              status,
              search,
              page: String(page),
              ...(ownerFilter !== "all" ? { ownerId: ownerFilter } : {}),
              ...(from ? { closeFrom: from } : {}),
              ...(to ? { closeTo: to } : {}),
              ...(minValue ? { minValue: String(salesMinor(minValue)) } : {}),
              ...(maxValue ? { maxValue: String(salesMinor(maxValue)) } : {}),
            }),
        ),
        accountRequest<{ pipelines: SalesPipeline[] }>("/api/sales/pipelines"),
      ]);
      if (alive.current && current === seq.current) {
        setBoard(result);
        setPipelines(metadata.pipelines);
        setFailed(false);
      }
    } catch (e) {
      if (alive.current && current === seq.current) {
        setError((e as Error).message);
        setFailed(true);
      }
    }
  }, [
    pipelineId,
    status,
    search,
    page,
    ownerFilter,
    from,
    to,
    minValue,
    maxValue,
  ]);
  refresh.current = load;
  useEffect(() => {
    alive.current = true;
    void initialize();
    return () => {
      alive.current = false;
      seq.current++;
    };
  }, [initialize]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    // Salesforce global-action deep link: open a new opportunity editor.
    const openNew = () => {
      setEditor("new");
      window.history.replaceState(null, "", window.location.pathname);
    };
    if (new URLSearchParams(window.location.search).has("new")) openNew();
    window.addEventListener("ofs:new-opportunity", openNew);
    return () => window.removeEventListener("ofs:new-opportunity", openNew);
  }, []);
  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      if (dragRef.current) dirty.current = true;
      else void refresh.current();
    };
    const timer = setInterval(poll, 10000);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
    };
  }, []);
  useEffect(() => {
    if (!opportunityId) return;
    let live = true;
    void accountRequest<{ opportunity: Opportunity }>(
      "/api/sales/opportunities/" + opportunityId,
    )
      .then((result) => {
        if (live) {
          setPipelineId(result.opportunity.pipeline_id);
          setEditor(result.opportunity);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [opportunityId]);
  async function mutate(
    path: string,
    method: string,
    data: unknown,
    message: string,
  ) {
    if (!canWrite) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await accountRequest<{
        opportunity?: Opportunity;
        pipeline?: SalesPipeline;
      }>(path, method, data);
      if (result.pipeline) {
        setPipelines((current) => [
          ...current.filter((p) => p.id !== result.pipeline!.id),
          result.pipeline!,
        ]);
        setPipelineId(result.pipeline.id);
        setPage(1);
      }
      if (
        result.opportunity &&
        editor &&
        editor !== "new" &&
        editor.id === result.opportunity.id
      )
        setEditor(result.opportunity);
      await refresh.current();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await refresh.current();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const save = (id: string | null, data: unknown) =>
    mutate(
      "/api/sales/opportunities" + (id ? "/" + id : ""),
      id ? "PUT" : "POST",
      data,
      id ? "Opportunity updated." : "Opportunity created.",
    );
  const move = async (row: Opportunity, stageId: string, reason = "") => {
    const ok = await mutate(
      "/api/sales/opportunities/" + row.id + "/stage",
      "PUT",
      { stageId, reason, expectedVersion: row.version },
      "Sales stage updated.",
    );
    if (ok) setMovePrompt(null);
    return ok;
  };
  async function commitPipeline(data: unknown, id?: string) {
    const ok = await mutate(
      "/api/sales/pipelines" + (id ? "/" + id : ""),
      id ? "PUT" : "POST",
      data,
      "Pipeline configuration saved.",
    );
    if (ok) await initialize();
    return ok;
  }
  function down(e: JSX.TargetedPointerEvent<HTMLElement>, row: Opportunity) {
    if (!canEdit(row) || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      row,
      x: e.clientX,
      y: e.clientY,
      originX: e.clientX,
      originY: e.clientY,
      stageId: row.stage_id,
      moved: false,
    };
  }
  function pointerMove(e: PointerEvent) {
    const current = dragRef.current;
    if (
      !current ||
      (!current.moved &&
        Math.hypot(e.clientX - current.originX, e.clientY - current.originY) <
          6)
    )
      return;
    const column = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-sales-stage]"),
      next = {
        ...current,
        x: e.clientX,
        y: e.clientY,
        stageId: column?.dataset.salesStage || "",
        moved: true,
      };
    dragRef.current = next;
    setDrag(next);
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      if (e.clientX > rect.right - 35) boardRef.current.scrollLeft += 18;
      else if (e.clientX < rect.left + 35) boardRef.current.scrollLeft -= 18;
    }
  }
  function cancel() {
    dragRef.current = null;
    setDrag(null);
    if (dirty.current) {
      dirty.current = false;
      void refresh.current();
    }
  }
  function up(e: PointerEvent) {
    pointerMove(e);
    const current = dragRef.current;
    cancel();
    if (!current?.moved) return;
    suppress.current = Date.now() + 600;
    if (!current.stageId || current.stageId === current.row.stage_id) return;
    const target = pipeline?.stages.find((s) => s.id === current.stageId);
    if (target?.kind === "lost" || current.row.stage_kind === "lost") {
      setMovePrompt({ row: current.row, stageId: current.stageId });
      return;
    }
    void move(current.row, current.stageId);
  }
  pointer.current = { move: pointerMove, up, cancel };
  useEffect(() => {
    const move = (e: PointerEvent) => pointer.current?.move(e),
      up = (e: PointerEvent) => pointer.current?.up(e),
      cancel = () => pointer.current?.cancel(),
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancel();
      };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const name = (id: string) =>
    options.owners.find((owner) => owner.id === id)?.name ||
    "Former team member";
  if (!pipeline || !board || board.pipelineId !== pipeline.id)
    return (
      <div class="page">
        <h1>Sales</h1>
        {error ? (
          <Notice tone="danger">
            {error}
            <Button
              onClick={() => {
                void initialize();
                void load();
              }}
            >
              Retry
            </Button>
          </Notice>
        ) : (
          <LoadingState label="Loading Sales workspace…" />
        )}
      </div>
    );
  const totalValue = board.totals.reduce((sum, t) => sum + t.value, 0),
    weighted = board.totals.reduce(
      (sum, t) => sum + t.weightedHundredths / 100,
      0,
    );
  const card = (row: Opportunity) => (
    <article
      key={row.id}
      class={
        "sales-opportunity " +
        (canEdit(row) ? "can-drag " : "") +
        (drag?.row.id === row.id ? "is-dragging" : "")
      }
      onPointerDown={(e) => down(e, row)}
      onClick={(e) => {
        if (Date.now() > suppress.current) {
          e.currentTarget.querySelector("button")?.focus();
          setEditor(row);
        }
      }}
    >
      <div class="sales-card-heading">
        <GripVertical size={15} aria-hidden="true" />
        <Badge>{row.segment}</Badge>
      </div>
      <h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (Date.now() > suppress.current) {
              e.currentTarget.focus();
              setEditor(row);
            }
          }}
        >
          {row.title}
        </button>
      </h3>
      <p>{row.customer_name || row.prospect_name}</p>
      <strong class="sales-card-value">{salesMoney(row.expected_value)}</strong>
      <div class="sales-card-meta">
        <span>{name(row.owner_id)}</span>
        <span>{row.probability}%</span>
      </div>
      <small>Close {dateLabel(row.expected_close_date)}</small>
      <small class="sales-stage-age" title={row.stageTiming?.enteredAt ? `Entered this stage ${row.stageTiming.enteredAt}; measured at ${row.stageTiming.observedAt}.` : "No reliable recorded stage-entry time. Notes and field edits do not reset stage age."}>{stageAge(row.stageTiming)}</small>
      {row.next_action && (
        <div class="sales-next-action">
          <ArrowRight size={13} />
          <span>
            {row.next_action}
            {row.next_action_date && (
              <small>{dateLabel(row.next_action_date)}</small>
            )}
          </span>
        </div>
      )}
    </article>
  );
  return (
    <div class="page sales-page">
      <header class="sales-header">
        <div>
          <span class="dispatch-eyebrow">Growth</span>
          <h1>Sales</h1>
          <p>Turn the next conversation into your next customer.</p>
        </div>
        <div class="sales-header-actions">
          <Badge tone={failed ? "danger" : "neutral"}>
            {failed ? "Updates unavailable" : "Updates every 10s"}
          </Badge>
          <Button
            size="icon"
            aria-label="Refresh Sales board"
            disabled={busy}
            onClick={() => {
              void initialize();
              void load();
            }}
          >
            <RefreshCw size={17} />
          </Button>
          {admin && (
            <Button
              disabled={!canWrite}
              onClick={() => setPipelineEditor(pipeline)}
            >
              <Settings2 size={15} /> Configure
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!canWrite}
            onClick={() => {
              setError("");
              setEditor("new");
            }}
          >
            <Plus size={16} /> New opportunity
          </Button>
        </div>
      </header>
      {error && (
        <Notice tone="danger" close={() => setError("")}>
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      {(connectivity.readOnly || failed) && (
        <Notice tone="warning">
          Sales changes require a live connection. Reload before editing if
          updates failed.
        </Notice>
      )}
      <div class="sales-metrics">
        <div>
          <span>Opportunities · current filters</span>
          <strong>{board.total}</strong>
        </div>
        <div>
          <span>Pipeline value · USD</span>
          <strong>{salesMoney(totalValue)}</strong>
        </div>
        <div>
          <span>Weighted forecast · USD</span>
          <strong>{salesMoney(weighted)}</strong>
        </div>
      </div>
      <p class="sales-forecast-note">
        Forecast amounts are estimates, not revenue. Totals cover all matching
        records; cards show page {page}.
      </p>
      <div class="sales-filters">
        <Select
          label="Pipeline"
          value={pipelineId}
          onValueChange={(id) => {
            setPipelineId(id);
            setPage(1);
          }}
          options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
        />
        {admin && (
          <Button disabled={!canWrite} onClick={() => setPipelineEditor("new")}>
            <Plus size={14} /> Pipeline
          </Button>
        )}
        <label class="sales-search">
          <Search size={16} />
          <Input
            aria-label="Search opportunities"
            value={search}
            placeholder="Find an opportunity…"
            onInput={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          label="Owner"
          value={ownerFilter}
          onValueChange={(id) => {
            setOwnerFilter(id);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All owners" },
            ...options.owners.map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
        <Select
          label="Status"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All stages" },
            { value: "lost", label: "Lost" },
          ]}
        />
        <TextField
          label="Close from"
          type="date"
          value={from}
          onInput={(e) => {
            setFrom(e.currentTarget.value);
            setPage(1);
          }}
        />
        <TextField
          label="Close through"
          type="date"
          value={to}
          onInput={(e) => {
            setTo(e.currentTarget.value);
            setPage(1);
          }}
        />
        <TextField
          label="Minimum value (USD)"
          inputMode="decimal"
          value={minValue}
          onChange={(e) => {
            setMinValue(e.currentTarget.value.trim());
            setPage(1);
          }}
        />
        <TextField
          label="Maximum value (USD)"
          inputMode="decimal"
          value={maxValue}
          onChange={(e) => {
            setMaxValue(e.currentTarget.value.trim());
            setPage(1);
          }}
        />
        <Select
          label="Sales view"
          value={view}
          onValueChange={setView}
          options={[
            { value: "board", label: "Kanban board" },
            { value: "list", label: "Opportunity list" },
            { value: "activities", label: "Follow-ups" },
          ]}
        />
      </div>
      <ReminderSummary reload={notice} open={() => setView("activities")} />
      <div class="sales-board-help">
        <span>
          Drag a card to change its stage, or open it to use Move stage.
        </span>
        <span>Won is reserved for quote conversion.</span>
      </div>
      {view === "activities" ? (
        <FollowUpInbox
          open={(id) => {
            setError("");
            void accountRequest<{ opportunity: Opportunity }>(
              "/api/sales/opportunities/" + id,
            )
              .then((result) => {
                setPipelineId(result.opportunity.pipeline_id);
                setEditor(result.opportunity);
              })
              .catch((e) => setError(e.message));
          }}
        />
      ) : view === "board" ? (
        <div
          class="sales-kanban"
          ref={boardRef}
          tabIndex={0}
          aria-label="Sales pipeline. Scroll horizontally to see all stages."
        >
          {pipeline.stages.map((stage) => {
            const totals = board.totals.find((t) => t.stage_id === stage.id),
              rows = board.opportunities.filter((o) => o.stage_id === stage.id);
            return (
              <section
                key={stage.id}
                data-sales-stage={stage.id}
                class={
                  "sales-column sales-kind-" +
                  stage.kind +
                  (drag?.stageId === stage.id ? " is-drop-target" : "")
                }
                aria-label={stage.name + " stage"}
              >
                <header>
                  <h2>{stage.name}</h2>
                  <Badge>{totals?.count || 0}</Badge>
                  <strong>{salesMoney(totals?.value || 0)}</strong>
                </header>
                <div class="sales-column-cards">
                  {rows.map(card)}
                  {!rows.length && (
                    <p class="sales-column-empty">
                      {stage.kind === "won"
                        ? "Accepted quote conversion will place won work here."
                        : "No opportunities on this page"}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Table label="Sales opportunities">
          <thead>
            <tr>
              <th>Opportunity / customer</th>
              <th>Stage</th>
              <th>Owner</th>
              <th>Value (USD)</th>
              <th>Close date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {board.opportunities.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.title}
                  <br />
                  <small>{row.customer_name || row.prospect_name}</small>
                </td>
                <td>{row.stage_name}<small class="sales-stage-age">{stageAge(row.stageTiming)}</small></td>
                <td>{name(row.owner_id)}</td>
                <td>{salesMoney(row.expected_value)}</td>
                <td>{dateLabel(row.expected_close_date)}</td>
                <td>
                  <Button onClick={() => setEditor(row)}>
                    Open opportunity
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {!board.total && (
        <EmptyState title="No matching opportunities">
          Try another filter, or create a prospect and link an existing customer
          when ready.
        </EmptyState>
      )}
      <footer class="sales-pagination">
        <Button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(board.total / board.pageSize))}{" "}
          · {board.pageSize} per page
        </span>
        <Button
          disabled={page * board.pageSize >= board.total || busy}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </footer>
      {editor && pipeline && (
        <OpportunityEditor
          key={editor === "new" ? "new" : editor.id}
          row={editor === "new" ? null : editor}
          pipeline={pipeline}
          options={options}
          userId={user.id}
          admin={admin}
          disabled={!canWrite}
          error={error}
          close={() => setEditor(null)}
          save={save}
          mutate={mutate}
          converted={()=>{setEditor(null);setNotice("Prospect linked to native customer. Stage retained; no job or invoice created.");void initialize();void load();}}
          move={move}
          addNote={(row, content) =>
            mutate(
              "/api/sales/opportunities/" + row.id + "/notes",
              "POST",
              { content, expectedVersion: row.version },
              "Internal note added.",
            )
          }
        />
      )}
      {pipelineEditor && (
        <PipelineEditor
          pipeline={pipelineEditor === "new" ? null : pipelineEditor}
          close={() => setPipelineEditor(null)}
          disabled={!canWrite}
          serverError={error}
          commit={commitPipeline}
        />
      )}
      {movePrompt && (
        <Sheet close={() => setMovePrompt(null)}>
          <header class="sales-sheet-header">
            <DialogTitle>{movePrompt.row.title}</DialogTitle>
            <Button
              size="icon"
              aria-label="Close stage move"
              onClick={() => setMovePrompt(null)}
            >
              <X size={18} />
            </Button>
          </header>
          {error && <Notice tone="danger">{error}</Notice>}
          <MoveForm
            opportunity={movePrompt.row}
            pipeline={pipeline}
            target={movePrompt.stageId}
            disabled={!canEdit(movePrompt.row)}
            move={move}
          />
        </Sheet>
      )}
      {drag && (
        <div
          class="sales-drag-preview"
          style={{ left: drag.x + 15, top: drag.y + 15 }}
        >
          <strong>{drag.row.title}</strong>
          <span>
            {pipeline.stages.find((s) => s.id === drag.stageId)?.name ||
              "Drop onto a stage"}
          </span>
        </div>
      )}
    </div>
  );
}

export function SalesPage({opportunityId,quoteId}:{opportunityId:string|null;quoteId?:string|null}) {
  if(!opportunityId)return <ModuleOverview module={businessModules.sales}/>;
  if(opportunityId==='quotes')return <Suspense fallback={<div class="page"><p role="status">Loading Quotes…</p></div>}><QuotesPage quoteId={quoteId}/></Suspense>;
  return <SalesWorkspace opportunityId={opportunityId==='pipeline'?null:opportunityId}/>;
}
