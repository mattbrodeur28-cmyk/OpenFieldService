import {createAgreementModule} from "./agreements/http.mjs";
import {createHrDocuments} from "./hr/documents-http.mjs";
import {createHr} from "./hr/http.mjs";
import {createPlatform} from "./platform/http.mjs";
import { createJobHandoff } from "./service/job-handoff.mjs";
import { createMaintenanceJobs } from "./service/maintenance-jobs.mjs";
import { createService } from "./service/http.mjs";
import { globalSearch } from "./search.mjs";
import { createProjectModule } from "./projects/http.mjs";
import { quoteMaterialSnapshots } from "./inventory/quote-pricing.mjs";
import { createSales } from "./sales/http.mjs";
import { createDispatcher } from "./dispatch/service.mjs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import api from "./index.js";
import { createIntegrations } from "./integrations.mjs";
import { createAuth } from "./auth.mjs";
import { createWorkspace } from "./workspace.mjs";
import { openStorage } from "./sqlite.mjs";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
if (!existsSync(resolve(root, "dist/index.html"))) throw new Error("Frontend missing: run pnpm build before pnpm start");
const storage = openStorage(process.env.DATABASE_PATH ?? resolve(root, "data/openfieldservice.sqlite"));
const integrations = createIntegrations({ filename: resolve(dirname(process.env.DATABASE_PATH ?? resolve(root, "data/openfieldservice.sqlite")), "workspace.sqlite") });
const workspace = createWorkspace({ filename: resolve(dirname(process.env.DATABASE_PATH ?? resolve(root, "data/openfieldservice.sqlite")), "workspace.sqlite"), storage, root, integrationRead: integrations.read });
const auth = createAuth({ filename: resolve(dirname(process.env.DATABASE_PATH ?? resolve(root, "data/openfieldservice.sqlite")), "workspace.sqlite") });
const dispatcher = createDispatcher({ storage, currentUser: auth.currentUser });
const service = createService({storage,currentUser:auth.currentUser,people:auth.activeWriters});
const maintenanceJobs = createMaintenanceJobs({storage});
const agreements=createAgreementModule({storage,currentUser:auth.currentUser,issuer:()=>sales.issuer(),timeZone:()=>dispatcher.timeZone,maintenanceJobs});
const hr=createHr({storage,currentUser:auth.currentUser});
const hrDocuments=createHrDocuments({storage,currentUser:auth.currentUser});
const jobHandoff = createJobHandoff({storage});
const sales = createSales({storage,jobHandoff,crmHandoff:service.crm.prospects,currentUser:auth.currentUser,owners:auth.activeWriters,resolveMessage:auth.salesMessageReference,materialSnapshots:(ids: string[])=>quoteMaterialSnapshots(storage.database,ids)});
const platform=createPlatform({storage,currentUser:auth.currentUser});
const projects = createProjectModule({ storage, currentUser: auth.currentUser, proposalSource: (user: unknown, quoteId: string) => {
  const summary = (sales as any).quotes.conversion.summary(user, quoteId);
  if (!summary.acceptedDocument || !summary.nativeLinks?.customerId) return null;
  return { customerId: summary.nativeLinks.customerId, title: summary.acceptedDocument.title, scope: summary.acceptedDocument.scope };
} });
const app = new Hono();
app.use("/api/*", auth.guard);
app.route("/api/auth", auth.app);
app.route("/api/platform",platform.app);
app.route("/api/projects",projects.app);
app.route("/api/agreements",agreements.app);
app.route("/api/hr",hr.app);
app.route("/api/hr-documents",hrDocuments.app);
app.post("/api/technicians",c=>c.json({error:"Create staff and enable technician availability through HR → Staff."},409));
app.put("/api/technicians/:id",c=>c.json({error:"Technician identity and availability are managed through HR → Staff."},409));
app.delete("/api/technicians/:id",c=>c.json({error:"Retain technician history; manage employment and field availability through HR → Staff."},409));
app.route("/api/service",service.app);
app.route("/api/documents",service.documents.app);
app.route("/api/dispatch", dispatcher.app);
app.route("/api/sales", sales.app);
app.get("/api/public/company", (c) => workspace.publicCompany(c));
app.route("/api/workspace", workspace.app);
app.route("/api/integrations", integrations.app);
app.get("/healthz", async (c) => {
  await storage.query("SELECT 1");
  return c.json({ status: "ok" });
});
app.get("/api/search", (c) => {
  const user = auth.currentUser(c) as { active?: boolean; mustChangePassword?: boolean } | null;
  if (!user?.active || user.mustChangePassword)
    return c.json({ error: "Sign in to continue." }, 401);
  return c.json(globalSearch(storage.database, c.req.query("q")));
});
// Do not let the legacy price-plus-used-materials shortcut double-bill a quote.
app.post("/api/jobs/:id/invoice", (c,next) => {
  if(jobHandoff.invoiceBlocked(c.req.param("id")))return c.json({error:"Accepted quote invoicing requires the quoted billing workflow; the legacy material-addition shortcut is blocked."},409);
  return next();
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
  dispatcher.close();
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => { auth.close(); integrations.close(); workspace.close(); storage.close(); clearTimeout(deadline); });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("error", (error) => { console.error(error); auth.close(); integrations.close(); workspace.close(); storage.close(); process.exit(1); });
