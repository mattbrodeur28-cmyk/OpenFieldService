import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createProjects } from "./service.mjs";
import { ProjectError } from "./domain.mjs";

export function createProjectModule({ storage, currentUser, proposalSource = null }) {
    const projects = createProjects({ storage, proposalSource }), app = new Hono();
    const actor = (c) => {
        const user = currentUser(c);
        if (c.req.method !== "GET" && c.req.header("X-Requested-With") !== "OpenFieldService")
            throw new ProjectError("Use the workspace application to change projects.", 403);
        return user;
    };
    app.use("*", (c, next) => { c.header("Cache-Control", "private, no-store"); return next(); });
    app.use("*", bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: "Project request too large." }, 413) }));
    app.onError((error, c) => { if (error instanceof ProjectError) return c.json({ error: error.message }, error.status); console.error("Project request failed:", error.name); return c.json({ error: "The project operation could not be completed." }, 500); });
    const body = async (c) => { try { return await c.req.json(); } catch (e) { throw new ProjectError(e?.name === "BodyLimitError" ? "Project request too large." : "Send valid project JSON.", e?.name === "BodyLimitError" ? 413 : 400); } };

    app.get("/", (c) => c.json(projects.list(actor(c), c.req.query())));
    app.post("/", async (c) => c.json(projects.save(actor(c), await body(c))));
    app.post("/from-proposal", async (c) => c.json(projects.fromProposal(actor(c), await body(c))));
    app.get("/:id", (c) => c.json(projects.detail(actor(c), c.req.param("id"))));
    app.post("/:id/phases", async (c) => c.json(projects.savePhase(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/milestones", async (c) => c.json(projects.saveMilestone(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/jobs", async (c) => c.json(projects.linkJob(actor(c), c.req.param("id"), await body(c))));
    app.delete("/:id/jobs/:linkId", (c) => c.json(projects.unlinkJob(actor(c), c.req.param("id"), c.req.param("linkId"))));
    app.post("/:id/sites", async (c) => c.json(projects.linkSite(actor(c), c.req.param("id"), await body(c))));
    app.delete("/:id/sites/:linkId", (c) => c.json(projects.unlinkSite(actor(c), c.req.param("id"), c.req.param("linkId"))));
    app.post("/:id/deliverables", async (c) => c.json(projects.saveDeliverable(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/baseline", async (c) => c.json(projects.setBaseline(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/issues", async (c) => c.json(projects.saveIssue(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/dependencies", async (c) => c.json(projects.saveDependency(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/cost-sections", async (c) => c.json(projects.saveCostSection(actor(c), c.req.param("id"), await body(c))));
    app.delete("/:id/cost-sections/:sectionId", (c) => c.json(projects.deleteCostSection(actor(c), c.req.param("id"), c.req.param("sectionId"))));

    // PROJ-003 Field documentation
    app.post("/:id/field-docs", async (c) => c.json(projects.saveFieldDoc(actor(c), c.req.param("id"), await body(c))));

    // PROJ-004 Crews & field time
    app.post("/:id/crews", async (c) => c.json(projects.saveCrew(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/crews/:crewId/members", async (c) => c.json(projects.addCrewMember(actor(c), c.req.param("id"), c.req.param("crewId"), await body(c))));
    app.post("/:id/crew-time", async (c) => c.json(projects.recordCrewTime(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/crew-time/:timeId/review", async (c) => c.json(projects.reviewCrewTime(actor(c), c.req.param("id"), c.req.param("timeId"), await body(c))));

    // PROJ-005 Change orders
    app.post("/:id/change-orders", async (c) => c.json(projects.saveChangeOrder(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/change-orders/:coId/action", async (c) => c.json(projects.transitionChangeOrder(actor(c), c.req.param("id"), c.req.param("coId"), await body(c))));

    // PROJ-006 Purchasing commitments
    app.post("/:id/purchasing", async (c) => c.json(projects.savePurchasingLink(actor(c), c.req.param("id"), await body(c))));

    // PROJ-007 Subcontractors
    app.post("/:id/subcontractors", async (c) => c.json(projects.saveSubcontractor(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/subcontractors/:subId/change-orders", async (c) => c.json(projects.saveSubChangeOrder(actor(c), c.req.param("id"), c.req.param("subId"), await body(c))));
    app.post("/:id/subcontractors/:subId/invoices", async (c) => c.json(projects.submitSubInvoice(actor(c), c.req.param("id"), c.req.param("subId"), await body(c))));
    app.post("/:id/sub-invoices/:invId/review", async (c) => c.json(projects.reviewSubInvoice(actor(c), c.req.param("id"), c.req.param("invId"), await body(c))));

    // COM/CONST-001..003 Schedule of Values & Progress Billing Applications
    app.post("/:id/sov", async (c) => c.json(projects.saveSovLine(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/billing-apps", async (c) => c.json(projects.createBillingApp(actor(c), c.req.param("id"), await body(c))));
    app.post("/:id/billing-apps/:appId/action", async (c) => c.json(projects.transitionBillingApp(actor(c), c.req.param("id"), c.req.param("appId"), await body(c))));
    app.get("/:id/billing-apps/:appId/export", (c) => {
        const html = projects.exportBillingAppHtml(actor(c), c.req.param("id"), c.req.param("appId"));
        c.header("Content-Type", "text/html; charset=utf-8");
        return c.body(html);
    });

    // PROJ-008 WIP reporting & snapshots
    app.get("/:id/wip", (c) => c.json(projects.getWip(actor(c), c.req.param("id"), c.req.query("method"))));
    app.post("/:id/wip/snapshots", async (c) => c.json(projects.createWipSnapshot(actor(c), c.req.param("id"), await body(c))));

    // PROJ-009 Audit log
    app.get("/:id/audit", (c) => c.json({ rows: projects.auditLog(actor(c), c.req.param("id")) }));
    return { app, projects };
}
