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
    return { app, projects };
}
