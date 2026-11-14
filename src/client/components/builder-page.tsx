import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { Notice } from "./ui/surfaces";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  Plus,
  Search,
  Send,
  Download,
  FileCode,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
} from "lucide-preact";
import { accountRequest } from "../auth";
import { lineDiff } from "../builder-diff";

type Provider = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
};
type DraftFile = {
  path: string;
  before: string;
  content: string;
  sha256: string;
};
type Proposal = {
  id: string;
  request?: string;
  summary: string;
  provider?: string;
  parentId?: string;
  createdAt?: string;
  staleFiles?: string[];
  files: DraftFile[];
};
type Turn = { id: string; request: string; summary: string; createdAt: string };
type History = {
  id: string;
  request: string;
  created_at: string;
  parentId?: string | null;
};
const starterPrompts = [
  {
    label: "Improve navigation",
    text: "Make the sidebar easier to use on phones. Keep all current links and account permissions.",
  },
  {
    label: "Improve job details",
    text: "Make job details easier for a field technician to scan. Highlight the schedule, customer and equipment without changing the stored data.",
  },
  {
    label: "Polish the dashboard",
    text: "Improve dashboard spacing and readability on desktop and mobile while keeping the current statistics and behavior.",
  },
];
function FileDiff({ file }: { file: DraftFile }) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(
    () => lineDiff(file.before, file.content),
    [file.before, file.content],
  );
  const counts = {
    add: lines.filter((line) => line.kind === "add").length,
    remove: lines.filter((line) => line.kind === "remove").length,
  };
  const visible = new Set<number>();
  if (!showAll)
    lines.forEach((line, index) => {
      if (line.kind !== "same")
        for (
          let i = Math.max(0, index - 3);
          i <= Math.min(lines.length - 1, index + 3);
          i++
        )
          visible.add(i);
    });
  return (
    <details class="builder-file" open>
      <summary>
        <FileCode size={15} />
        <span>{file.path}</span>
        <span class="builder-add-count">+{counts.add}</span>
        <span class="builder-remove-count">−{counts.remove}</span>
      </summary>
      <label class="builder-show-context">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.currentTarget.checked)}
        />{" "}
        Show unchanged lines
      </label>
      {!counts.add && !counts.remove && (
        <p class="workspace-help">This file has no changes.</p>
      )}
      {lines.length > 4000 && (
        <p class="workspace-help">
          Large diff: showing the first 4,000 lines. Review the full
          before/after content in the exported proposal before deploying.
        </p>
      )}
      <div
        class="builder-diff"
        role="region"
        aria-label={`Changes in ${file.path}`}
        tabIndex={0}
      >
        <pre>
          {lines.slice(0, 4000).map((line, index) =>
            showAll || visible.has(index) ? (
              <div class={`builder-diff-line ${line.kind}`}>
                <span class="builder-line-number" aria-hidden="true">
                  {line.oldLine ?? ""}
                </span>
                <span class="builder-line-number" aria-hidden="true">
                  {line.newLine ?? ""}
                </span>
                <span class="builder-line-marker">
                  {line.kind === "add"
                    ? "+"
                    : line.kind === "remove"
                      ? "−"
                      : " "}
                </span>
                <code>{line.text || " "}</code>
              </div>
            ) : index === 0 || visible.has(index - 1) ? (
              <div class="builder-diff-gap">··· unchanged lines ···</div>
            ) : null,
          )}
        </pre>
      </div>
    </details>
  );
}
export function BuilderPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [autoFiles, setAutoFiles] = useState(true);
  const [history, setHistory] = useState<History[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const request = <T,>(path: string, method = "GET", body?: unknown) =>
    accountRequest<T>("/api/workspace/builder" + path, method, body);
  async function loadHistory() {
    setHistory(
      (await request<{ proposals: History[] }>("/proposals")).proposals,
    );
  }
  useEffect(() => {
    void Promise.all([
      accountRequest<{ providers: Provider[] }>("/api/workspace/status"),
      request<{ files: string[] }>("/files"),
      request<{ proposals: History[] }>("/proposals"),
    ])
      .then(([status, sources, saved]) => {
        setProviders(status.providers);
        setProvider(status.providers.find((item) => item.configured)?.id || "");
        setFiles(sources.files);
        setHistory(saved.proposals);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function openDraft(id: string) {
    setBusy(true);
    setError("");
    try {
      const [draft, thread] = await Promise.all([
        request<Proposal>("/proposals/" + id),
        request<{ messages: Turn[] }>("/proposals/" + id + "/thread"),
      ]);
      setProposal(draft);
      setTurns(thread.messages);
      setSelectedFiles(draft.files.map((file) => file.path));
      setPrompt("");
      setReviewed(false);
      if (
        providers.some((item) => item.id === draft.provider && item.configured)
      )
        setProvider(draft.provider!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const draft = await request<Proposal>("/proposals", "POST", {
        provider,
        message: prompt,
        files: selectedFiles,
        autoFiles,
        ...(proposal ? { parentId: proposal.id } : {}),
      });
      setProposal(draft);
      setTurns((current) => [
        ...current,
        {
          id: draft.id,
          request: draft.request || prompt,
          summary: draft.summary,
          createdAt: draft.createdAt || "",
        },
      ]);
      setSelectedFiles(draft.files.map((file) => file.path));
      setPrompt("");
      setReviewed(false);
      try {
        await loadHistory();
      } catch {
        setError(
          "Draft saved. Recent drafts could not refresh; reopen the builder to retry.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function newConversation() {
    setProposal(null);
    setTurns([]);
    setSelectedFiles([]);
    setPrompt("");
    setError("");
    setReviewed(false);
    setAutoFiles(true);
  }
  function download() {
    if (!proposal || !reviewed || proposal.staleFiles?.length) return;
    const { staleFiles: _, ...saved } = proposal;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `openfieldservice-change-${proposal.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const configured = providers.some(
    (item) => item.id === provider && item.configured,
  );
  const hasChanges = proposal?.files.some(
    (file) => file.before !== file.content,
  );
  const parentIds = new Set(
    history.map((item) => item.parentId).filter(Boolean),
  );
  const conversations = history.filter((item) => !parentIds.has(item.id));
  return (
    <div class="builder-layout">
      <aside class="builder-history" aria-label="Builder conversations">
        <Button
          class="btn"
          disabled={busy || loading}
          onClick={newConversation}
        >
          <Plus size={15} /> New conversation
        </Button>
        <h2>Recent drafts</h2>
        {conversations.map((item) => (
          <Button
            class={`builder-history-item ${proposal?.id === item.id ? "active" : ""}`}
            disabled={busy}
            onClick={() => void openDraft(item.id)}
          >
            <MessageSquare size={14} />
            <span>
              {item.request}
              <small>
                {new Date(
                  item.created_at.replace(" ", "T") +
                    (item.created_at.includes("Z") ? "" : "Z"),
                ).toLocaleDateString()}
              </small>
            </span>
          </Button>
        ))}
        {!loading && !history.length && (
          <p class="workspace-help">
            Your saved conversations will appear here.
          </p>
        )}
      </aside>
      <section class="builder-conversation" aria-label="Build conversation">
        <div class="builder-toolbar">
          <div>
            <strong>Build with a conversation</strong>
            <p>Describe it. Review it. Refine it.</p>
          </div>
          <Select
            label="AI connection"
            value={provider}
            disabled={busy || loading}
            onValueChange={setProvider}
            placeholder="Choose a connection"
            options={providers.map((item) => ({
              value: item.id,
              label:
                item.label +
                (item.model ? ` · ${item.model}` : " · Not configured"),
              disabled: !item.configured,
            }))}
          />
        </div>
        <p class="builder-scope">
          Edits existing frontend files. Backend, database and account-security
          changes require code development outside this builder.
        </p>
        {error && (
          <Notice tone="danger" close={() => setError("")}>
            {error}
          </Notice>
        )}
        {!loading && !configured && (
          <p class="integration-notice">
            Configure an AI provider under{" "}
            <a href="/integrations">Integrations</a> to start building.
          </p>
        )}
        <div class="builder-turns" aria-live="polite" aria-busy={busy}>
          {!turns.length && (
            <div class="builder-welcome">
              <FileCode size={30} />
              <h2>What would you like to change?</h2>
              <p>
                Ask in plain language. Follow-up messages improve the same
                draft, preserving earlier edits.
              </p>
              <div class="builder-starters">
                {starterPrompts.map((item) => (
                  <Button
                    class="btn"
                    disabled={busy}
                    onClick={() => setPrompt(item.text)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn, index) => (
            <div key={turn.id} class="builder-turn">
              <article class="builder-user-message">
                <strong>You</strong>
                <p>{turn.request}</p>
              </article>
              <article class="builder-assistant-message">
                <strong>Draft {index + 1}</strong>
                <p>{turn.summary}</p>
                <small>Saved proposal · live application unchanged</small>
              </article>
            </div>
          ))}
          {busy && (
            <p class="builder-progress" role="status">
              Preparing your draft
              {autoFiles ? " and selecting relevant files" : ""}… This can take
              a few minutes.
            </p>
          )}
        </div>
        <form
          class="builder-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label class="form-group">
            {proposal ? "Refine this draft" : "Describe your change"}
            <textarea
              rows={4}
              maxLength={8000}
              required
              value={prompt}
              disabled={busy || loading}
              placeholder={
                proposal
                  ? "Keep that layout, but make the buttons larger on mobile…"
                  : "Make the dashboard easier to read on a phone…"
              }
              onInput={(e) => setPrompt(e.currentTarget.value)}
            />
          </label>
          <details class="builder-advanced">
            <summary>
              Advanced ·{" "}
              {autoFiles
                ? "AI chooses files"
                : `${selectedFiles.length} files selected`}
            </summary>
            <label class="workspace-consent">
              <input
                type="checkbox"
                checked={autoFiles}
                disabled={busy}
                onChange={(e) => setAutoFiles(e.currentTarget.checked)}
              />{" "}
              Automatically select relevant files
            </label>
            <p class="workspace-help">
              Automatic selection makes an extra AI request. Drafts can change
              up to four files. Existing draft files are retained during
              follow-ups.
            </p>
            {!autoFiles && (
              <>
                <label class="builder-file-search">
                  <Search size={15} />
                  <input
                    aria-label="Search frontend files"
                    value={fileSearch}
                    onInput={(e) => setFileSearch(e.currentTarget.value)}
                    placeholder="Search files…"
                  />
                </label>
                <div class="builder-file-picker">
                  {files
                    .filter((file) =>
                      file.toLowerCase().includes(fileSearch.toLowerCase()),
                    )
                    .map((file) => (
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file)}
                          disabled={
                            busy ||
                            proposal?.files.some(
                              (item) => item.path === file,
                            ) ||
                            (!selectedFiles.includes(file) &&
                              selectedFiles.length >= 4)
                          }
                          onChange={(e) =>
                            setSelectedFiles((current) =>
                              e.currentTarget.checked
                                ? [...current, file]
                                : current.filter((item) => item !== file),
                            )
                          }
                        />
                        <span>{file.replace("src/client/", "")}</span>
                      </label>
                    ))}
                </div>
              </>
            )}
          </details>
          <div class="builder-send">
            <span>
              {prompt.length}/8,000 · Selected source code goes to this AI
              provider.
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                loading ||
                !configured ||
                !prompt.trim() ||
                (!autoFiles && !selectedFiles.length)
              }
            >
              <Send size={15} />
              {proposal ? "Revise draft" : "Prepare draft"}
            </Button>
          </div>
        </form>
      </section>
      <section class="builder-review" aria-label="Draft review">
        <div class="builder-review-heading">
          <h2>Review changes</h2>
          <span>
            {proposal ? `${proposal.files.length} files` : "No draft yet"}
          </span>
        </div>
        {!proposal ? (
          <div class="workspace-empty">
            <p>
              Your draft and file differences appear here. Generated changes
              stay separate from the live application.
            </p>
          </div>
        ) : (
          <>
            {proposal.staleFiles?.length ? (
              <p class="workspace-error" role="alert">
                <AlertTriangle size={16} /> Source files changed. Start a new
                conversation to regenerate against the current code.
              </p>
            ) : (
              <p class="builder-review-status">
                <CheckCircle size={16} /> Draft saved · build not yet validated
              </p>
            )}
            {proposal.files.map((file) => (
              <FileDiff key={proposal.id + file.path} file={file} />
            ))}
            <div class="builder-export">
              <label class="workspace-consent">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={
                    busy || Boolean(proposal.staleFiles?.length) || !hasChanges
                  }
                  onChange={(e) => setReviewed(e.currentTarget.checked)}
                />{" "}
                I reviewed the generated code changes.
              </label>
              <Button
                class="btn"
                disabled={
                  busy ||
                  !reviewed ||
                  !hasChanges ||
                  Boolean(proposal.staleFiles?.length)
                }
                onClick={download}
              >
                <Download size={15} /> Download reviewed proposal
              </Button>
              <p class="workspace-help">
                Validate and deploy on the LXC as your non-root deployment user:
              </p>
              <code>pnpm builder:apply /path/to/proposal.json</code>
              <p class="workspace-help">
                The deployment command checks for changed source files, runs
                type checks and builds. A failed build restores the previous
                source.{" "}
                <a
                  href="https://github.com/mattbrodeur28-cmyk/OpenFieldService/blob/feature/debian-standalone/deploy/WORKSPACE.md#app-builder-review-apply-rebuild"
                  target="_blank"
                  rel="noreferrer"
                >
                  Deployment instructions
                </a>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
