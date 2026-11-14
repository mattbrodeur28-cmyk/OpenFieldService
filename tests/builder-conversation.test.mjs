import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkspace } from "../src/server/workspace.mjs";
import { openStorage } from "../src/server/sqlite.mjs";

test("builder threads retain cumulative edits, choose allowlisted files and reject stale revisions", async () => {
  const root = mkdtempSync(join(tmpdir(), "ofs-builder-thread-"));
  mkdirSync(join(root, "src/client"), { recursive: true });
  const a = "src/client/page.tsx",
    b = "src/client/styles.css";
  writeFileSync(join(root, a), 'export const title = "Original";\n');
  writeFileSync(join(root, b), ".page { padding: 8px; }\n");
  const storage = openStorage(join(root, "service.sqlite"));
  const env = {
    NODE_ENV: "test",
    WORKSPACE_TOKEN: "fixture-key-with-at-least-24-characters",
    OLLAMA_BASE_URL: "http://fixture.invalid",
    OLLAMA_MODEL: "fixture",
  };
  const queue = [];
  const calls = [];
  const options = {
    filename: join(root, "workspace.sqlite"),
    storage,
    root,
    env,
    fetcher: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      const next = queue.shift();
      assert.notEqual(next, undefined, "unexpected model request");
      return Response.json({
        message: {
          content: typeof next === "string" ? next : JSON.stringify(next),
        },
      });
    },
  };
  let workspace = createWorkspace(options);
  async function request(path, body, status = 200) {
    const result = await workspace.app.request("/builder" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + env.WORKSPACE_TOKEN,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await result.json();
    assert.equal(result.status, status, JSON.stringify(data));
    return data;
  }
  try {
    queue.push(
      { files: [a] },
      {
        summary: "Rename heading",
        files: [
          { path: a, content: 'export const title = "Field Service";\n' },
        ],
      },
    );
    const first = await request(
      "/proposals",
      { provider: "ollama", message: "Rename the heading", autoFiles: true },
      201,
    );
    assert.equal(calls.length, 2);
    assert.equal(first.parentId, null);
    assert.equal(first.provider, "ollama");
    queue.push(
      { files: [b] },
      {
        summary: "Keep heading and increase padding",
        files: [{ path: b, content: ".page { padding: 16px; }\n" }],
      },
    );
    const second = await request(
      "/proposals",
      {
        provider: "ollama",
        message: "Keep that heading and increase spacing",
        parentId: first.id,
        autoFiles: true,
      },
      201,
    );
    assert.equal(second.parentId, first.id);
    assert.equal(second.files.length, 2);
    assert.equal(
      second.files.find((file) => file.path === a).content,
      first.files[0].content,
    );
    assert.equal(
      second.files.find((file) => file.path === a).before,
      'export const title = "Original";\n',
    );
    assert(JSON.stringify(calls.at(-1)).includes("Field Service"));
    assert(JSON.stringify(calls.at(-1)).includes("previous draft"));
    assert.equal(
      readFileSync(join(root, a), "utf8"),
      'export const title = "Original";\n',
      "generation never writes the app",
    );
    assert.equal(
      readFileSync(join(root, b), "utf8"),
      ".page { padding: 8px; }\n",
    );
    const thread = await request("/proposals/" + second.id + "/thread");
    assert.deepEqual(
      thread.messages.map((turn) => turn.request),
      ["Rename the heading", "Keep that heading and increase spacing"],
    );
    const history = await request("/proposals");
    assert.equal(history.proposals[0].parentId, first.id);
    workspace.close();
    workspace = createWorkspace(options);
    assert.equal(
      (await request("/proposals/" + second.id + "/thread")).messages.length,
      2,
    );
    writeFileSync(
      join(root, a),
      'export const title = "Changed after draft";\n',
    );
    const details = await request("/proposals/" + second.id);
    assert.deepEqual(details.staleFiles, [a]);
    const count = calls.length;
    await request(
      "/proposals",
      { provider: "ollama", message: "Another revision", parentId: second.id },
      409,
    );
    assert.equal(calls.length, count);
    queue.push({ files: ["src/server/node.ts"] });
    await request(
      "/proposals",
      {
        provider: "ollama",
        message: "Select a forbidden file",
        autoFiles: true,
      },
      400,
    );
    queue.push("not valid json");
    await request(
      "/proposals",
      { provider: "ollama", message: "Select files", autoFiles: true },
      422,
    );
    await request(
      "/proposals",
      { provider: "ollama", message: "Missing parent", parentId: "missing" },
      404,
    );
    assert.equal(queue.length, 0);
  } finally {
    workspace.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
