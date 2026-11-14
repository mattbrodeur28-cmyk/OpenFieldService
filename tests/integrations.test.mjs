import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { createAuth } from "../src/server/auth.mjs";
import {
  createIntegrations,
  connectorDefinitions,
} from "../src/server/integrations.mjs";

test("integration OAuth enforces sessions, state, isolation, refresh and encrypted credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ofs-integrations-"));
  const filename = join(directory, "workspace.sqlite");
  const env = {
    WORKSPACE_TOKEN: "test-only-key-with-more-than-24-characters",
    PUBLIC_URL: "https://field.example",
  };
  const auth = createAuth({ filename, env });
  const db = new DatabaseSync(filename);
  let requests = [];
  let refreshes = 0;
  let expires = 3600;
  let hold;
  let entered;
  let pause = false;
  const integrations = createIntegrations({
    filename,
    env,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("/token") || url.endsWith("/accessToken")) {
        const fields = new URLSearchParams(options.body);
        assert.equal(fields.get("client_secret"), "fixture-secret");
        assert.equal(options.method, "POST");
        if (fields.get("grant_type") === "refresh_token") refreshes++;
        if (pause) {
          entered();
          await new Promise((resolve) => {
            hold = resolve;
          });
        }
        return Response.json({
          access_token: "fixture-access-token",
          refresh_token: "fixture-refresh-token",
          expires_in: expires,
        });
      }
      assert.equal(
        options.headers.Authorization,
        "Bearer fixture-access-token",
      );
      if (url.includes("gmail/v1/users/me/messages/"))
        return Response.json({
          id: "message1",
          payload: {
            headers: [
              { name: "Subject", value: "Fixture maintenance" },
              { name: "X-Secret", value: "Do not return" },
            ],
          },
        });
      if (url.includes("gmail/v1/users/me/messages?"))
        return Response.json({ messages: [{ id: "message1" }] });
      if (url.includes("/drive/v3/files"))
        return Response.json({
          files: [
            {
              id: "f1",
              name: "Controls handover",
              mimeType: "application/pdf",
              access_token: "not-returned",
            },
          ],
        });
      if (url.includes("hubapi.com/crm"))
        return Response.json({
          results: [{ id: "c1", properties: { firstname: "Fixture" } }],
        });
      if (url.includes("graph.microsoft.com") && !url.includes("/me?"))
        return Response.json({
          value: [{ id: "m1", subject: "Maintenance", secret: "not-returned" }],
        });
      return Response.json({
        sub: "fixture-profile",
        name: "Fixture",
        email: "fixture@example.test",
        access_token: "not-returned",
      });
    },
  });
  const app = new Hono();
  app.use("/api/*", auth.guard);
  app.route("/api/auth", auth.app);
  app.route("/api/integrations", integrations.app);
  async function req(path, method = "GET", body, cookie, verify = true) {
    const response = await app.request("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(verify ? { "X-Requested-With": "OpenFieldService" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return {
      response,
      data: response.headers.get("content-type")?.includes("json")
        ? await response.json()
        : null,
    };
  }
  try {
    const setup = await req("/auth/setup", "POST", {
      name: "Fixture",
      email: "fixture@example.test",
      password: "Fixture-password-123!",
      bootstrapToken: env.WORKSPACE_TOKEN,
    });
    assert.equal(setup.response.status, 201, JSON.stringify(setup.data));
    const cookie = setup.response.headers.get("set-cookie").split(";")[0];
    const owner = db.prepare("SELECT id FROM users").get().id;
    assert.equal((await req("/integrations")).response.status, 401);
    assert.equal(
      (await req("/integrations/google/read", "POST", { action: "files" }))
        .response.status,
      401,
    );
    assert.equal(
      (await req("/integrations/google/callback?state=bad&code=bad")).response
        .status,
      400,
    );
    assert.equal(
      (
        await req(
          "/integrations/google/client",
          "PUT",
          { clientId: "fixture-client", clientSecret: "fixture-secret" },
          cookie,
          false,
        )
      ).response.status,
      403,
    );
    for (const provider of Object.keys(connectorDefinitions)) {
      assert.equal(
        (
          await req(
            "/integrations/" + provider + "/client",
            "PUT",
            { clientId: "fixture-client", clientSecret: "fixture-secret" },
            cookie,
          )
        ).response.status,
        200,
      );
      const connect = await req(
        "/integrations/" + provider + "/connect",
        "POST",
        {},
        cookie,
      );
      assert.equal(connect.response.status, 200);
      const url = new URL(connect.data.url);
      assert.equal(
        url.searchParams.get("redirect_uri"),
        "https://field.example/api/integrations/" + provider + "/callback",
      );
      assert(!url.search.includes("fixture-secret"));
      assert(!url.searchParams.get("scope").includes("write"));
      if (connectorDefinitions[provider].pkce)
        assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      const callback =
        "/integrations/" +
        provider +
        "/callback?state=" +
        url.searchParams.get("state") +
        "&code=fixture-code";
      const result = await req(callback);
      assert.equal(result.response.status, 303, JSON.stringify(result.data));
      assert.equal((await req(callback)).response.status, 400);
    }
    const status = await req("/integrations", "GET", undefined, cookie);
    assert(status.data.connectors.every((x) => x.connected));
    assert(!JSON.stringify(status.data).includes("fixture-secret"));
    assert(!JSON.stringify(status.data).includes("fixture-access-token"));
    assert(
      !db
        .prepare("SELECT secret FROM integration_clients LIMIT 1")
        .get()
        .secret.includes("fixture-secret"),
    );
    assert(
      !db
        .prepare("SELECT tokens FROM integration_connections LIMIT 1")
        .get()
        .tokens.includes("fixture-access-token"),
    );
    assert.equal(
      (await integrations.read(owner, "google", "files")).items[0].name,
      "Controls handover",
    );
    assert.equal(
      (await integrations.read(owner, "google", "mail")).items[0].headers
        .length,
      1,
    );
    assert.equal(
      (await integrations.read(owner, "hubspot", "contacts")).items[0].id,
      "c1",
    );
    assert.equal(
      (await integrations.read(owner, "microsoft", "mail")).items[0].secret,
      undefined,
    );
    await assert.rejects(
      () => integrations.read("another-user", "google", "files"),
      /Connect this/,
    );
    await assert.rejects(
      () => integrations.read(owner, "google", "https://evil.example"),
      /Unsupported/,
    );
    // Expired credentials refresh once across simultaneous reads.
    expires = 1;
    let connect = await req("/integrations/google/connect", "POST", {}, cookie);
    let state = new URL(connect.data.url).searchParams.get("state");
    await req("/integrations/google/callback?state=" + state + "&code=short");
    expires = 3600;
    await Promise.all([
      integrations.read(owner, "google", "files"),
      integrations.read(owner, "google", "profile"),
    ]);
    assert.equal(refreshes, 1);
    // A disconnect while code exchange is in flight must not resurrect a connection.
    connect = await req("/integrations/google/connect", "POST", {}, cookie);
    state = new URL(connect.data.url).searchParams.get("state");
    pause = true;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const pending = req(
      "/integrations/google/callback?state=" + state + "&code=race",
    );
    await started;
    await req("/integrations/google/connection", "DELETE", undefined, cookie);
    hold();
    assert.equal((await pending).response.status, 409);
    pause = false;
    await assert.rejects(
      () => integrations.read(owner, "google", "profile"),
      /Connect this/,
    );
    db.prepare("UPDATE users SET role='member' WHERE id=?").run(owner);
    assert.equal(
      (
        await req(
          "/integrations/google/client",
          "PUT",
          { clientId: "bad", clientSecret: "bad" },
          cookie,
        )
      ).response.status,
      403,
    );
    const member = await req("/integrations", "GET", undefined, cookie);
    assert.equal(member.data.connectors[0].clientId, undefined);
    db.prepare("UPDATE users SET role='viewer' WHERE id=?").run(owner);
    assert.equal(
      (
        await req(
          "/integrations/microsoft/read",
          "POST",
          { action: "mail" },
          cookie,
        )
      ).response.status,
      403,
    );
    env.PUBLIC_URL = "http://10.0.4.67:3000";
    assert(
      (
        await req("/integrations", "GET", undefined, cookie)
      ).data.connectors.every((x) => !x.ready),
    );
  } finally {
    integrations.close();
    auth.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Chat fetches only explicitly selected integration sources for the signed-in user", async () => {
  const { createWorkspace } = await import("../src/server/workspace.mjs");
  const { openStorage } = await import("../src/server/sqlite.mjs");
  const directory = mkdtempSync(join(tmpdir(), "ofs-integration-chat-"));
  const storage = openStorage(join(directory, "service.sqlite"));
  let reads = [];
  let prompts = [];
  const workspace = createWorkspace({
    filename: join(directory, "workspace.sqlite"),
    storage,
    root: new URL("../", import.meta.url).pathname,
    env: {
      NODE_ENV: "test",
      WORKSPACE_TOKEN: "test-key-that-is-at-least-24-characters",
      OLLAMA_BASE_URL: "http://fixture.invalid",
      OLLAMA_MODEL: "fixture",
    },
    integrationRead: async (user, provider, action) => {
      reads.push({ user, provider, action });
      return { items: [{ name: "Fixture integration record" }] };
    },
    fetcher: async (url, options) => {
      prompts.push(JSON.parse(options.body));
      return Response.json({ message: { content: "Fixture answer" } });
    },
  });
  async function chat(extra) {
    return workspace.app.request("/chat", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key-that-is-at-least-24-characters",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "ollama",
        message: "Help with maintenance",
        includeRecords: false,
        ...extra,
      }),
    });
  }
  try {
    assert.equal((await chat({})).status, 200);
    assert.equal(reads.length, 0);
    assert(!JSON.stringify(prompts[0]).includes("Fixture integration record"));
    assert.equal(
      (
        await chat({
          integrations: [{ provider: "google", action: "calendar" }],
        })
      ).status,
      200,
    );
    assert.deepEqual(reads, [
      { user: "test-user", provider: "google", action: "calendar" },
    ]);
    assert(JSON.stringify(prompts[1]).includes("Fixture integration record"));
    assert.equal(
      (
        await chat({
          integrations: new Array(4).fill({
            provider: "google",
            action: "calendar",
          }),
        })
      ).status,
      400,
    );
    assert.equal(reads.length, 1);
  } finally {
    workspace.close();
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
