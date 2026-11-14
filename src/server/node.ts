import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import api from "./index.js";
import { openStorage } from "./sqlite.mjs";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
if (!existsSync(resolve(root, "dist/index.html"))) throw new Error("Frontend missing: run pnpm build before pnpm start");
const storage = openStorage(process.env.DATABASE_PATH ?? resolve(root, "data/openfieldservice.sqlite"));
const app = new Hono();
app.get("/healthz", async (c) => {
  await storage.query("SELECT 1");
  return c.json({ status: "ok" });
});
app.all("/api/*", (c) => api.fetch(c.req.raw, { STORAGE: storage }));
app.all("/api", (c) => api.fetch(c.req.raw, { STORAGE: storage }));
app.use("*", serveStatic({ root: "./dist" }));
// SPA bookmarks work; missing files and unknown API paths remain 404s.
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (/\.[^/]+$/.test(path)) return c.notFound();
  await next();
});
app.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve({ fetch: app.fetch, hostname: process.env.HOST ?? "127.0.0.1", port }, (info) => {
  console.log(`OpenFieldService listening on ${process.env.HOST ?? "127.0.0.1"}:${info.port}`);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => { storage.close(); clearTimeout(deadline); });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("error", (error) => { console.error(error); storage.close(); process.exit(1); });
