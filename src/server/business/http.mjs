import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createBusinessService, BusinessError } from "./service.mjs";

export function createBusinessModule({ storage, currentUser }) {
    const biz = createBusinessService({ storage });
    const app = new Hono();
    const portalApp = new Hono();

    const actor = (c) => {
        const user = currentUser(c);
        if (c.req.method !== "GET" && c.req.header("X-Requested-With") !== "OpenFieldService")
            throw new BusinessError("Use the workspace application to change business controls.", 403);
        return user;
    };
    const body = async (c) => {
        try { return await c.req.json(); }
        catch (e) { throw new BusinessError(e?.name === "BodyLimitError" ? "Request too large." : "Send valid JSON.", e?.name === "BodyLimitError" ? 413 : 400); }
    };

    app.use("*", (c, next) => { c.header("Cache-Control", "private, no-store"); return next(); });
    app.use("*", bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: "Request too large." }, 413) }));
    app.onError((err, c) => {
        if (err instanceof BusinessError) return c.json({ error: err.message }, err.status);
        console.error("Business request failed:", err.name);
        return c.json({ error: "The business operation could not be completed." }, 500);
    });

    app.get("/dashboard", (c) => c.json(biz.dashboard(actor(c))));
    app.get("/reports", (c) => c.json({ reports: biz.listReports(actor(c)) }));
    app.post("/reports", async (c) => c.json(biz.saveReport(actor(c), await body(c))));
    app.get("/reports/:id/export", (c) => {
        const format = c.req.query("format") === "csv" ? "csv" : "json";
        const res = biz.exportReport(actor(c), c.req.param("id"), format);
        if (format === "csv") {
            return new Response(res.body, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${res.filename}"`,
                    "Cache-Control": "private, no-store",
                },
            });
        }
        return c.json(res);
    });
    app.get("/automations", (c) => c.json({ automations: biz.listAutomations(actor(c)) }));
    app.post("/automations", async (c) => c.json(biz.saveAutomation(actor(c), await body(c))));
    app.post("/automations/:id/dry-run", (c) => c.json(biz.dryRunAutomation(actor(c), c.req.param("id"))));
    app.get("/portal-tokens", (c) => c.json({ tokens: biz.listPortalTokens(actor(c), c.req.query("customerId") || null) }));
    app.post("/portal-tokens", async (c) => c.json(biz.issuePortalToken(actor(c), await body(c)), 201));
    app.post("/portal-tokens/:id/revoke", (c) => c.json(biz.revokePortalToken(actor(c), c.req.param("id"))));

    // Separate external customer portal route (Bearer token auth, isolated from staff sessions)
    portalApp.use("*", (c, next) => { c.header("Cache-Control", "private, no-store"); return next(); });
    portalApp.onError((err, c) => {
        if (err instanceof BusinessError) return c.json({ error: err.message }, err.status);
        return c.json({ error: "Customer portal unavailable." }, 500);
    });
    portalApp.get("/me", (c) => {
        const authHeader = c.req.header("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : (c.req.query("token") || "");
        return c.json(biz.portalView(token));
    });

    return { app, portalApp, biz };
}
