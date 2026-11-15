import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ActionMenu } from "./ui/menu";
import { Avatar, Notice, Textarea } from "./ui/surfaces";
import { useEffect, useRef, useState } from "preact/hooks";
import { Hash, Users, Search, Send, ChevronDown } from "lucide-preact";
import { accountRequest, useAccount, canManagePeople } from "../auth";
import type { AccountUser } from "../auth";
type Message = {
  id: string;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
};
function timestamp(value: string) {
  return new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
}
export function TeamChannel({ id }: { id: string }) {
  const { user, refreshTeams } = useAccount();
  const manage = canManagePeople(user);
  const [team, setTeam] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const [members, setMembers] = useState<AccountUser[]>([]);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canRead, setCanRead] = useState(true);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const generation = useRef(0);
  async function load(reset = false) {
    const currentGeneration = generation.current;
    const result = await accountRequest<{
      team: typeof team;
      members: AccountUser[];
      messages: Message[];
      canReadMessages: boolean;
    }>("/api/auth/teams/" + id);
    if (currentGeneration !== generation.current) return;
    setTeam(result.team);
    setMembers(result.members);
    setMessages(result.messages);
    setCanRead(result.canReadMessages !== false);
    setPollError(false);
    if (reset) setSelected(result.members.map((item) => item.id));
  }
  useEffect(() => {
    let active = true;
    void load(true).catch((e) => {
      if (active) setError(e.message);
    });
    if (manage)
      void accountRequest<{ users: AccountUser[] }>("/api/auth/users")
        .then((result) => {
          if (active) setUsers(result.users);
        })
        .catch(() => {});
    const timer = setInterval(() => {
      if (!document.hidden)
        void load().catch(() => {
          if (active) setPollError(true);
        });
    }, 5000);
    return () => {
      active = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    const linked = window.location.hash.startsWith("#message-") ? document.getElementById(window.location.hash.slice(1)) : null;
    if (linked) { linked.scrollIntoView({ block: "center" }); return; }
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages.length]);
  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await accountRequest("/api/auth/teams/" + id + "/messages", "POST", {
        content: text,
      });
      setText("");
      nearBottom.current = true;
      try {
        await load();
      } catch {
        setError(
          "Message saved. The conversation could not refresh; updates will retry.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [messageFilter, setMessageFilter] = useState("all");
  const visible = messages.filter(
    (item) =>
      (messageFilter !== "mine" || item.user_id === user.id) &&
      (item.author + " " + item.content)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div class="team-channel">
      <header class="channel-header">
        <span class="channel-symbol">
          <Hash size={25} />
        </span>
        <div>
          <h1>{team?.name || "Team channel"}</h1>
          <p>{team?.description || "Your workspace conversation"}</p>
        </div>
        <Button
          class={`${showMembers ? "active" : ""}`}
          aria-expanded={showMembers}
          onClick={() => setShowMembers(!showMembers)}
        >
          <Users size={16} /> {members.filter((item) => item.active).length}{" "}
          members <ChevronDown size={13} />
        </Button>
        <ActionMenu
          label="Channel actions"
          disabled={busy}
          items={[
            {
              label: "Refresh conversation",
              onSelect: () => {
                void load().catch((e) => setError(e.message));
              },
            },
            {
              label: showMembers ? "Hide members" : "Show members",
              onSelect: () => setShowMembers(!showMembers),
            },
          ]}
        />
      </header>
      <div class="channel-tabs">
        <span class="active">Conversation</span>
        <label>
          <Search size={15} />
          <Input
            aria-label="Search recent channel messages"
            placeholder="Search recent messages"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>
        <Select
          label="Messages"
          value={messageFilter}
          onValueChange={setMessageFilter}
          options={[
            { value: "all", label: "All recent messages" },
            { value: "mine", label: "My messages" },
          ]}
        />
        <small>
          {pollError
            ? "Updates paused · reconnecting"
            : "Updates every 5 seconds"}
        </small>
      </div>
      <div class={`channel-body ${showMembers ? "with-members" : ""}`}>
        <section class="channel-conversation">
          {error && (
            <Notice tone="danger" close={() => setError("")}>
              {error}
            </Notice>
          )}
          <div
            class="channel-messages"
            ref={scroller}
            onScroll={() => {
              const element = scroller.current;
              if (element)
                nearBottom.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  100;
            }}
            role="log"
            aria-label="Team messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!visible.length && (
              <div class="channel-empty">
                <Hash size={38} />
                <h2>
                  {query ? "No matching messages" : "Start the conversation"}
                </h2>
                <p>
                  {!canRead
                    ? "You can manage this team’s membership. Join the team to read its messages."
                    : query
                      ? "Search covers the most recent 100 messages."
                      : "Keep dispatch updates, field notes and handovers together."}
                </p>
              </div>
            )}
            {visible.map((item, index) => {
              const date = timestamp(item.created_at);
              const previous = visible[index - 1];
              const dayChanged =
                !previous ||
                timestamp(previous.created_at).toDateString() !==
                  date.toDateString();
              const grouped =
                previous?.user_id === item.user_id &&
                !dayChanged &&
                date.getTime() - timestamp(previous.created_at).getTime() <
                  300000;
              const own = item.user_id === user.id;
              return (
                <div key={item.id}>
                  {dayChanged && (
                    <div class="channel-day">
                      <span>
                        {date.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  <article
                    id={"message-" + item.id}
                    class={`channel-message ${own ? "own" : ""} ${grouped ? "grouped" : ""}`}
                  >
                    <span class="channel-avatar" aria-hidden="true">
                      {grouped ? "" : item.author.slice(0, 1).toUpperCase()}
                    </span>
                    <div class="channel-message-content">
                      {!grouped && (
                        <div class="channel-message-meta">
                          <strong>{own ? "You" : item.author}</strong>
                          <time
                            dateTime={date.toISOString()}
                            title={date.toLocaleString()}
                          >
                            {date.toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      )}
                      <p>{item.content}</p>
                    </div>
                  </article>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
          {canRead && user.role !== "viewer" && (
            <form
              class="channel-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label>
                <Textarea
                  aria-label="Message your team"
                  placeholder={"Message " + (team?.name || "your team") + "…"}
                  rows={3}
                  maxLength={8000}
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  disabled={busy}
                />
              </label>
              <footer>
                <small>
                  {busy
                    ? "Sending…"
                    : "Enter to send · Shift+Enter for a new line"}
                </small>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={busy || !text.trim()}
                >
                  <Send size={16} /> Send
                </Button>
              </footer>
            </form>
          )}
        </section>
        {showMembers && (
          <aside class="channel-members">
            <h2>Channel members</h2>
            {members.map((item) => (
              <div class="account-member">
                <Avatar name={item.name} />
                <div>
                  {item.name}
                  <small>
                    {item.hr ? "HR · " : ""}
                    {item.active ? item.role : "Inactive"}
                  </small>
                </div>
              </div>
            ))}
            {manage && (
              <details>
                <summary>Manage membership</summary>
                {users
                  .filter((item) => item.active)
                  .map((item) => (
                    <label class="workspace-consent account-member-choice">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setSelected((current) =>
                            checked
                              ? [...current, item.id]
                              : current.filter((value) => value !== item.id),
                          );
                        }}
                      />
                      {item.name}
                    </label>
                  ))}
                <Button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void accountRequest(
                      "/api/auth/teams/" + id + "/members",
                      "PUT",
                      { userIds: selected },
                    )
                      .then(() => load(true))
                      .then(refreshTeams)
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Save members
                </Button>
              </details>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
