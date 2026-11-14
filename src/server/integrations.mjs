import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const connectorDefinitions = {
  google: {
    name: "Google Workspace",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    pkce: true,
    scopes:
      "openid email profile https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.metadata",
    actions: ["profile", "files", "calendar", "mail"],
  },
  microsoft: {
    name: "Microsoft 365",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    pkce: true,
    scopes:
      "offline_access User.Read Mail.ReadBasic Calendars.Read Files.Read Contacts.Read",
    actions: ["profile", "files", "calendar", "mail", "contacts"],
  },
  hubspot: {
    name: "HubSpot CRM",
    authorize: "https://app.hubspot.com/oauth/authorize",
    token: "https://api.hubapi.com/oauth/2026-03/token",
    scopes:
      "oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read",
    actions: ["contacts", "companies", "deals"],
  },
  linkedin: {
    name: "LinkedIn",
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: "openid profile email",
    actions: ["profile"],
  },
};
const isAdmin = (user) => ["owner", "admin"].includes(user?.role);
export function createIntegrations({
  filename,
  env = process.env,
  fetcher = fetch,
}) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS integration_clients(provider TEXT PRIMARY KEY,client_id TEXT NOT NULL,secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS integration_connections(user_id TEXT NOT NULL,provider TEXT NOT NULL,tokens TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,provider));
 CREATE TABLE IF NOT EXISTS integration_oauth_states(state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,provider TEXT NOT NULL,verifier TEXT NOT NULL,redirect_uri TEXT NOT NULL,expires INTEGER NOT NULL,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS integration_versions(user_id TEXT NOT NULL,provider TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(user_id,provider));`);
  const locks = new Map();
  const version = (user, provider) =>
    db
      .prepare(
        "SELECT version FROM integration_versions WHERE user_id=? AND provider=?",
      )
      .get(user, provider)?.version || 0;
  const advance = (user, provider) =>
    db
      .prepare(
        "INSERT INTO integration_versions VALUES(?,?,1) ON CONFLICT(user_id,provider) DO UPDATE SET version=version+1",
      )
      .run(user, provider);
  function key() {
    const value = env.WORKSPACE_ENCRYPTION_KEY || env.WORKSPACE_TOKEN;
    if (!value || value.length < 24)
      throw Error("Configure the workspace encryption key.");
    return createHash("sha256").update(value).digest();
  }
  function seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), data]
      .map((x) => x.toString("base64"))
      .join(".");
  }
  function unseal(value) {
    const [iv, tag, data] = value
      .split(".")
      .map((x) => Buffer.from(x, "base64"));
    const cipher = createDecipheriv("aes-256-gcm", key(), iv);
    cipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([cipher.update(data), cipher.final()]).toString(),
    );
  }
  function client(provider) {
    const row = db
      .prepare("SELECT * FROM integration_clients WHERE provider=?")
      .get(provider);
    return row
      ? { id: row.client_id, secret: unseal(row.secret) }
      : {
          id: env[provider.toUpperCase() + "_CLIENT_ID"],
          secret: env[provider.toUpperCase() + "_CLIENT_SECRET"],
        };
  }
  function redirect(provider) {
    const url = new URL(env.PUBLIC_URL || "");
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error(
        "Set PUBLIC_URL to your HTTPS origin before connecting accounts.",
      );
    return url.origin + "/api/integrations/" + provider + "/callback";
  }
  async function remote(url, options = {}) {
    const response = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error(
        "Provider returned HTTP " +
          response.status +
          ". Check permissions or reconnect.",
      );
    const reader = response.body?.getReader();
    if (!reader) throw Error("Empty provider response.");
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 512000) throw Error("Provider response too large.");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  async function exchange(provider, fields) {
    const credentials = client(provider);
    const data = await remote(connectorDefinitions[provider].token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.id,
        client_secret: credentials.secret,
        ...fields,
      }),
    });
    if (
      typeof data.access_token !== "string" ||
      !data.access_token ||
      !Number.isFinite(Number(data.expires_in)) ||
      Number(data.expires_in) <= 0
    )
      throw Error("Provider returned invalid credentials.");
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires: Date.now() + Number(data.expires_in) * 1000,
    };
  }
  async function token(user, provider) {
    const row = db
      .prepare(
        "SELECT tokens FROM integration_connections WHERE user_id=? AND provider=?",
      )
      .get(user, provider);
    if (!row) throw Error("Connect this account first.");
    const saved = unseal(row.tokens);
    if (saved.expires > Date.now() + 60000) return saved.access_token;
    if (!saved.refresh_token)
      throw Error("Account authorization expired. Reconnect this account.");
    const id = user + ":" + provider;
    if (!locks.has(id))
      locks.set(
        id,
        (async () => {
          const next = await exchange(provider, {
            grant_type: "refresh_token",
            refresh_token: saved.refresh_token,
          });
          next.refresh_token ||= saved.refresh_token;
          const result = db
            .prepare(
              "UPDATE integration_connections SET tokens=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND provider=? AND tokens=?",
            )
            .run(seal(next), user, provider, row.tokens);
          if (!result.changes) throw Error("Connection changed. Try again.");
          return next.access_token;
        })().finally(() => locks.delete(id)),
      );
    return locks.get(id);
  }
  async function read(user, provider, action) {
    if (!connectorDefinitions[provider]?.actions.includes(action))
      throw Error("Unsupported connector action.");
    const access = await token(user, provider);
    const urls = {
      google: {
        profile: "https://openidconnect.googleapis.com/v1/userinfo",
        files:
          "https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,modifiedTime),nextPageToken&orderBy=modifiedTime%20desc",
        calendar:
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&singleEvents=true&orderBy=startTime&timeMin=" +
          encodeURIComponent(new Date().toISOString()),
        mail: "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX",
      },
      microsoft: {
        profile:
          "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
        files:
          "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=20&$select=id,name,lastModifiedDateTime,file,folder",
        calendar:
          "https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=" +
          encodeURIComponent(new Date().toISOString()) +
          "&endDateTime=" +
          encodeURIComponent(
            new Date(Date.now() + 30 * 86400000).toISOString(),
          ) +
          "&$top=20&$select=id,subject,start,end,location&$orderby=start/dateTime",
        mail: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime%20desc",
        contacts:
          "https://graph.microsoft.com/v1.0/me/contacts?$top=20&$select=id,displayName,emailAddresses,businessPhones,companyName",
      },
      hubspot: {
        contacts:
          "https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email,phone,company",
        companies:
          "https://api.hubapi.com/crm/v3/objects/companies?limit=20&properties=name,domain,phone",
        deals:
          "https://api.hubapi.com/crm/v3/objects/deals?limit=20&properties=dealname,amount,dealstage,closedate",
      },
      linkedin: { profile: "https://api.linkedin.com/v2/userinfo" },
    };
    const headers = { Authorization: "Bearer " + access };
    const data = await remote(urls[provider][action], { headers });
    if (provider === "google" && action === "mail") {
      const items = [];
      for (const item of (data.messages || []).slice(0, 10)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) continue;
        const message = await remote(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
            item.id +
            "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",
          { headers },
        );
        items.push({
          id: message.id,
          headers: (message.payload?.headers || []).filter((h) =>
            ["subject", "from", "date"].includes(h.name?.toLowerCase()),
          ),
        });
      }
      return { provider, action, items, limited: true };
    }
    const list = data.files || data.items || data.value || data.results;
    const fields =
      provider === "google"
        ? action === "files"
          ? ["id", "name", "mimeType", "modifiedTime"]
          : ["id", "summary", "start", "end", "location"]
        : provider === "hubspot"
          ? ["id", "properties"]
          : [
              "id",
              "name",
              "displayName",
              "subject",
              "from",
              "receivedDateTime",
              "start",
              "end",
              "location",
              "emailAddresses",
              "businessPhones",
              "companyName",
              "lastModifiedDateTime",
              "file",
              "folder",
            ];
    const pick = (item, keys) =>
      Object.fromEntries(
        keys.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]),
      );
    return {
      provider,
      action,
      items: list
        ? list.slice(0, 20).map((item) => pick(item, fields))
        : [
            pick(data, [
              "sub",
              "name",
              "email",
              "id",
              "displayName",
              "mail",
              "userPrincipalName",
            ]),
          ],
      limited: true,
    };
  }
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 20000 }));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!c.req.path.endsWith("/callback") && !c.get("user"))
      return c.json({ error: "Sign in to continue." }, 401);
    await next();
  });
  app.onError((error, c) =>
    c.json(
      {
        error:
          /^(Provider returned HTTP|Connect this|Account authorization|Set PUBLIC_URL|Unsupported|Connection changed)/.test(
            error.message,
          )
            ? error.message
            : "Integration request failed. Check configuration and reconnect if needed.",
      },
      502,
    ),
  );
  app.get("/", (c) =>
    c.json({
      connectors: Object.entries(connectorDefinitions).map(([id, d]) => {
        const credentials = client(id);
        let callback = "";
        try {
          callback = redirect(id);
        } catch {}
        return {
          id,
          name: d.name,
          actions: d.actions,
          scopes: d.scopes,
          ready: Boolean(credentials.id && credentials.secret && callback),
          callback,
          connected: Boolean(
            db
              .prepare(
                "SELECT 1 FROM integration_connections WHERE user_id=? AND provider=?",
              )
              .get(c.get("user").id, id),
          ),
          ...(isAdmin(c.get("user"))
            ? {
                clientId: credentials.id || "",
                secretConfigured: Boolean(credentials.secret),
              }
            : {}),
        };
      }),
    }),
  );
  app.put("/:provider/client", async (c) => {
    const provider = c.req.param("provider");
    if (!isAdmin(c.get("user")))
      return c.json({ error: "Administrator access required." }, 403);
    if (!connectorDefinitions[provider]) return c.notFound();
    const input = await c.req.json();
    const old = client(provider);
    if (
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      input.clientId.length > 500 ||
      typeof input.clientSecret !== "string" ||
      input.clientSecret.length > 4000 ||
      (!input.clientSecret && !old.secret)
    )
      return c.json({ error: "Enter a client ID and client secret." }, 400);
    const secret = seal(input.clientSecret || old.secret);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "INSERT INTO integration_clients VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET client_id=excluded.client_id,secret=excluded.secret",
      ).run(provider, input.clientId.trim(), secret);
      db.prepare("DELETE FROM integration_oauth_states WHERE provider=?").run(
        provider,
      );
      db.prepare("DELETE FROM integration_connections WHERE provider=?").run(
        provider,
      );
      db.prepare(
        "UPDATE integration_versions SET version=version+1 WHERE provider=?",
      ).run(provider);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return c.json({ ok: true });
  });
  app.post("/:provider/connect", (c) => {
    const provider = c.req.param("provider");
    const d = connectorDefinitions[provider];
    if (!d) return c.notFound();
    if (c.get("user").role === "viewer")
      return c.json(
        { error: "Read-only accounts cannot connect integrations." },
        403,
      );
    const credentials = client(provider);
    if (!credentials.id || !credentials.secret)
      return c.json(
        { error: "Your administrator must configure the provider app first." },
        409,
      );
    const callback = redirect(provider);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    db.prepare(
      "DELETE FROM integration_oauth_states WHERE expires<? OR (user_id=? AND provider=?)",
    ).run(Date.now(), c.get("user").id, provider);
    advance(c.get("user").id, provider);
    db.prepare(
      "INSERT INTO integration_oauth_states VALUES(?,?,?,?,?,?,?)",
    ).run(
      digest(state),
      c.get("user").id,
      provider,
      verifier,
      callback,
      Date.now() + 600000,
      version(c.get("user").id, provider),
    );
    const url = new URL(d.authorize);
    for (const [k, v] of Object.entries({
      client_id: credentials.id,
      response_type: "code",
      redirect_uri: callback,
      scope: d.scopes,
      state,
    }))
      url.searchParams.set(k, v);
    if (d.pkce) {
      url.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      url.searchParams.set("code_challenge_method", "S256");
    }
    if (provider === "google") {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
    }
    return c.json({ url: url.href });
  });
  app.get("/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const d = connectorDefinitions[provider];
    if (!d) return c.notFound();
    const state = c.req.query("state") || "";
    if (state.length > 200)
      return c.json({ error: "Invalid authorization state." }, 400);
    const pending = db
      .prepare(
        "DELETE FROM integration_oauth_states WHERE state_hash=? AND provider=? RETURNING *",
      )
      .get(digest(state), provider);
    if (!pending || pending.expires < Date.now())
      return c.json(
        {
          error:
            "Authorization expired or invalid. Start again in Integrations.",
        },
        400,
      );
    const active = () =>
      db
        .prepare(
          "SELECT active,must_change_password,role FROM users WHERE id=?",
        )
        .get(pending.user_id);
    let user = active();
    if (!user?.active || user.must_change_password || user.role === "viewer")
      return c.json(
        { error: "Account authorization is no longer available." },
        403,
      );
    if (c.req.query("error"))
      return c.redirect("/integrations?connection=denied", 303);
    const code = c.req.query("code");
    if (!code || code.length > 8000)
      return c.json({ error: "Missing authorization code." }, 400);
    const before = JSON.stringify(client(provider));
    const tokens = await exchange(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirect_uri,
      ...(d.pkce ? { code_verifier: pending.verifier } : {}),
    });
    if (
      before !== JSON.stringify(client(provider)) ||
      version(pending.user_id, provider) !== pending.version
    )
      return c.json({ error: "Provider app changed. Connect again." }, 409);
    user = active();
    if (!user?.active || user.must_change_password || user.role === "viewer")
      return c.json(
        { error: "Account authorization is no longer available." },
        403,
      );
    db.prepare(
      "INSERT INTO integration_connections(user_id,provider,tokens) VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET tokens=excluded.tokens,updated_at=CURRENT_TIMESTAMP",
    ).run(pending.user_id, provider, seal(tokens));
    return c.redirect("/integrations?connection=connected", 303);
  });
  app.delete("/:provider/connection", (c) => {
    advance(c.get("user").id, c.req.param("provider"));
    db.prepare(
      "DELETE FROM integration_connections WHERE user_id=? AND provider=?",
    ).run(c.get("user").id, c.req.param("provider"));
    db.prepare(
      "DELETE FROM integration_oauth_states WHERE user_id=? AND provider=?",
    ).run(c.get("user").id, c.req.param("provider"));
    return c.json({ ok: true });
  });
  app.post("/:provider/read", async (c) => {
    const input = await c.req.json();
    return c.json(
      await read(c.get("user").id, c.req.param("provider"), input.action),
    );
  });
  return { app, read, close: () => db.close() };
}
