import { Dialog, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useEffect, useState } from "preact/hooks";
import { Search, X, Plug, ArrowUpRight } from "lucide-preact";
import { integrationCatalog, type Integration } from "../integrations-catalog";
import { integrationLogos } from "../integration-logos";
import { ConnectorPanel, type Connector } from "./connector-panel";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { ProviderSettings } from "./account-pages";

type Provider = { id: string; configured: boolean };
const categories = [
  "All services",
  "Google",
  "Microsoft",
  "CRM",
  "Social media",
  "AI",
];
const ai = new Set(["ollama", "openai", "deepseek"]);
function Logo({ item }: { item: Integration }) {
  return integrationLogos.has(item.id) ? (
    <img
      class="integration-logo"
      src={`/integrations/${item.id}.svg`}
      alt=""
      loading="lazy"
      width="36"
      height="36"
    />
  ) : (
    <span
      class={`integration-monogram integration-color-${item.name.charCodeAt(0) % 6}`}
      aria-hidden="true"
    >
      {item.name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")}
    </span>
  );
}
export function IntegrationsPage({
  providers,
  refresh,
}: {
  providers: Provider[];
  refresh(): Promise<void>;
}) {
  const { user } = useAccount();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All services");
  const [selected, setSelected] = useState<Integration | null>(null);
  const canManage = isAdministrator(user);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  async function loadConnections() {
    try {
      setConnectors(
        (await accountRequest<{ connectors: Connector[] }>("/api/integrations"))
          .connectors,
      );
    } catch {
      setConnectors([]);
    }
  }
  useEffect(() => {
    void loadConnections();
  }, []);
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = integrationCatalog.filter(
    (item) =>
      (category === "All services" || item.categories.includes(category)) &&
      words.every((word) =>
        `${item.name} ${item.description} ${item.categories.join(" ")}`
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
  function close() {
    setSelected(null);
    void refresh();
  }
  return (
    <div class="integration-catalog">
      {new URLSearchParams(window.location.search).get("connection") ===
        "connected" && (
        <p class="account-success" role="status">
          Account connected. Open its service card to preview live data.
        </p>
      )}
      {new URLSearchParams(window.location.search).get("connection") ===
        "denied" && (
        <p class="integration-notice" role="status">
          Authorization was declined. No new connection was saved.
        </p>
      )}
      <p class="integration-intro">
        Browse {integrationCatalog.length} services for your workspace. Open a
        service to see its availability and connection options.
      </p>
      <div class="integration-toolbar">
        <label class="integration-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search integrations"
            type="search"
            placeholder="Search integrations…"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {query && (
            <button
              class="btn-icon"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </label>
      </div>
      <div
        class="integration-filters"
        role="group"
        aria-label="Integration categories"
      >
        {categories.map((name) => (
          <button
            class={`integration-filter ${category === name ? "active" : ""}`}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p class="integration-result-count" role="status">
        {filtered.length} {filtered.length === 1 ? "service" : "services"}
        {category !== "All services" ? ` in ${category}` : ""}
      </p>
      <div class="integration-grid">
        {filtered.map((item) => (
          <button
            key={item.id}
            class="integration-card"
            onClick={() => setSelected(item)}
            aria-haspopup="dialog"
          >
            <Logo item={item} />
            <span class="integration-card-copy">
              <span class="integration-name">{item.name}</span>
              <span class="integration-description">{item.description}</span>
              {item.connector && (
                <span class="integration-availability">
                  {connectors.some(
                    (c) => c.id === item.connector && c.connected,
                  )
                    ? "Account connected"
                    : "Connect account"}
                </span>
              )}
              {ai.has(item.id) && (
                <span class="integration-availability">
                  {providers.some(
                    (provider) =>
                      provider.id === item.id && provider.configured,
                  )
                    ? "Configured"
                    : "Setup available"}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div class="workspace-empty">
          <Plug size={28} />
          <h2>No matching integrations</h2>
          <p>Try another service name or category.</p>
          <button
            class="btn"
            onClick={() => {
              setQuery("");
              setCategory("All services");
            }}
          >
            Show all services
          </button>
        </div>
      )}
      {selected && (
        <Dialog class="integration-dialog" close={close}>
          {selected && (
            <>
              <div class="integration-dialog-heading">
                <Logo item={selected} />
                <div>
                  <DialogTitle>{selected.name}</DialogTitle>
                  <p>{selected.categories.join(" · ")}</p>
                </div>
                <Button
                  size="icon"
                  onClick={close}
                  aria-label="Close integration details"
                >
                  <X size={20} />
                </Button>
              </div>
              <p class="integration-dialog-description">
                {selected.description}
              </p>
              {ai.has(selected.id) ? (
                <>
                  <p class="integration-notice">
                    {providers.some(
                      (provider) =>
                        provider.id === selected.id && provider.configured,
                    )
                      ? "Settings are configured. Send a message in Chat to verify the connection."
                      : "This connector is available. Configure your server address or API account below."}
                  </p>
                  {canManage ? (
                    <ProviderSettings providerId={selected.id} />
                  ) : (
                    <p>Your administrator manages this connection.</p>
                  )}
                  <a class="btn" href="/chat">
                    Open Chat <ArrowUpRight size={14} />
                  </a>
                </>
              ) : selected.connector ? (
                <ConnectorPanel
                  provider={selected.connector}
                  refresh={() => void loadConnections()}
                />
              ) : (
                <div class="integration-notice">
                  <strong>Connector not yet implemented</strong>
                  <p>
                    This service is in your catalog. Connecting accounts and
                    using its data from Chat or apps requires a dedicated
                    connector. No account has been connected and no data is
                    being synchronized.
                  </p>
                </div>
              )}
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
