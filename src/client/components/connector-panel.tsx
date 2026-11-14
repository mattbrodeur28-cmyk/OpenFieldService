import { useEffect, useState } from "preact/hooks";
import { accountRequest, isAdministrator, useAccount } from "../auth";
export interface Connector {
  id: string;
  name: string;
  actions: string[];
  scopes: string;
  ready: boolean;
  callback: string;
  connected: boolean;
  clientId?: string;
  secretConfigured?: boolean;
}
export function ConnectorPanel({
  provider,
  refresh,
}: {
  provider: string;
  refresh(): void;
}) {
  const { user } = useAccount();
  const [item, setItem] = useState<Connector | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<unknown>(null);
  async function load() {
    const result = await accountRequest<{ connectors: Connector[] }>(
      "/api/integrations",
    );
    const next = result.connectors.find((x) => x.id === provider) || null;
    setItem(next);
    setClientId(next?.clientId || "");
    refresh();
  }
  useEffect(() => {
    setItem(null);
    setData(null);
    setSecret("");
    setError("");
    setNotice("");
    void load().catch((e) => setError(e.message));
  }, [provider]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="connector-panel" aria-busy={busy}>
      {error && (
        <p role="alert" class="workspace-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" class="account-success">
          {notice}
        </p>
      )}
      {item && (
        <>
          <div class="integration-notice">
            <strong>
              {item.connected ? "Account connected" : "Connect your account"}
            </strong>
            <p>
              This is your personal {item.name} connection. Other workspace
              users cannot read it. Access is read-only.
            </p>
          </div>
          {isAdministrator(user) && (
            <details open={!item.ready}>
              <summary>Provider application settings</summary>
              <p class="workspace-help">
                Register your own OAuth application with this provider. Changing
                these settings disconnects all users of this provider. A blank
                secret preserves the saved secret.
              </p>
              <p class="workspace-help">
                Callback URL:{" "}
                <code>
                  {item.callback ||
                    "Set PUBLIC_URL to your HTTPS origin in /etc/openfieldservice.env and restart."}
                </code>
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await accountRequest(
                      "/api/integrations/" + provider + "/client",
                      "PUT",
                      { clientId, clientSecret: secret },
                    );
                    setSecret("");
                    setData(null);
                    await load();
                    setNotice(
                      "Provider settings saved. Connect your account below.",
                    );
                  });
                }}
              >
                <label class="form-group">
                  Client ID
                  <input
                    value={clientId}
                    required
                    maxLength={500}
                    autoComplete="off"
                    onInput={(e) => setClientId(e.currentTarget.value)}
                  />
                </label>
                <label class="form-group">
                  Client secret
                  <input
                    type="password"
                    value={secret}
                    required={!item.secretConfigured}
                    maxLength={4000}
                    autoComplete="new-password"
                    placeholder={
                      item.secretConfigured
                        ? "Saved secret — leave blank to keep"
                        : ""
                    }
                    onInput={(e) => setSecret(e.currentTarget.value)}
                  />
                </label>
                <button class="btn" disabled={busy}>
                  Save provider settings
                </button>
              </form>
            </details>
          )}
          <details>
            <summary>Requested permissions</summary>
            <p class="workspace-help">{item.scopes}</p>
          </details>
          {!item.ready && (
            <p class="workspace-help">
              An administrator must configure the provider application and HTTPS
              address before accounts can connect.
            </p>
          )}
          <div class="integration-actions">
            <button
              class="btn btn-primary"
              disabled={busy || !item.ready || user.role === "viewer"}
              onClick={() =>
                void action(async () => {
                  const result = await accountRequest<{ url: string }>(
                    "/api/integrations/" + provider + "/connect",
                    "POST",
                    {},
                  );
                  window.location.assign(result.url);
                })
              }
            >
              {item.connected ? "Reconnect account" : "Connect account"}
            </button>
            {item.connected && (
              <button
                class="btn"
                disabled={busy || user.role === "viewer"}
                onClick={() =>
                  void action(async () => {
                    await accountRequest(
                      "/api/integrations/" + provider + "/connection",
                      "DELETE",
                    );
                    setData(null);
                    await load();
                    setNotice(
                      "Connection removed from this workspace. You can also revoke access in your provider account.",
                    );
                  })
                }
              >
                Disconnect
              </button>
            )}
          </div>
          {item.connected && (
            <>
              <h3>Read live data</h3>
              <p class="workspace-help">
                Previews contain up to 20 records (10 Gmail headers). They do
                not synchronize or change service records.
              </p>
              <div class="integration-actions">
                {item.actions.map((name) => (
                  <button
                    class="btn"
                    disabled={busy || user.role === "viewer"}
                    onClick={() =>
                      void action(async () => {
                        setData(null);
                        setData(
                          await accountRequest(
                            "/api/integrations/" + provider + "/read",
                            "POST",
                            { action: name },
                          ),
                        );
                      })
                    }
                  >
                    Read {name}
                  </button>
                ))}
              </div>
            </>
          )}
          {data !== null && (
            <pre class="integration-data" aria-label="Integration data preview">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
