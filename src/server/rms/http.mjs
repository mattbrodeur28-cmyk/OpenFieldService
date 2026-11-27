import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createRmsService, RmsError } from "./service.mjs";

export function createRmsModule({ storage, currentUser }) {
    const rms = createRmsService({ storage });
    const app = new Hono();

    const actor = (c) => {
        const user = currentUser(c);
        if (c.req.method !== "GET" && c.req.header("X-Requested-With") !== "OpenFieldService")
            throw new RmsError("Use the workspace application to change RMS records.", 403);
        return user;
    };
    const body = async (c) => {
        try { return await c.req.json(); }
        catch (e) { throw new RmsError(e?.name === "BodyLimitError" ? "Request too large." : "Send valid JSON.", e?.name === "BodyLimitError" ? 413 : 400); }
    };

    app.use("*", (c, next) => { c.header("Cache-Control", "private, no-store"); return next(); });
    app.use("*", bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: "Request too large." }, 413) }));
    app.onError((err, c) => {
        if (err instanceof RmsError) return c.json({ error: err.message }, err.status);
        console.error("RMS request failed:", err.name);
        return c.json({ error: "The RMS operation could not be completed." }, 500);
    });

    app.get("/dashboard", (c) => c.json(rms.dashboard(actor(c))));
    app.get("/export", (c) => {
        const format = c.req.query("format") === "csv" ? "csv" : "json";
        const res = rms.exportRecords(actor(c), format);
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
    app.post("/rules", async (c) => c.json(rms.saveRule(actor(c), await body(c))));
    app.post("/refrigerants", async (c) => c.json(rms.saveRefrigerant(actor(c), await body(c))));
    app.post("/refrigerants/:id/toggle", async (c) => {
        let data = {};
        try { data = await c.req.json(); } catch {}
        return c.json(rms.toggleRefrigerant(actor(c), c.req.param("id"), typeof data?.active === "boolean" ? data.active : undefined));
    });
    app.post("/cylinders", async (c) => c.json(rms.saveCylinder(actor(c), await body(c))));
    app.post("/baselines", async (c) => c.json(rms.saveBaseline(actor(c), await body(c))));
    app.post("/events", async (c) => c.json(rms.recordEvent(actor(c), await body(c)), 201));
    app.post("/leak-inspections", async (c) => c.json(rms.recordLeakInspection(actor(c), await body(c)), 201));

    return { app, rms };
}
