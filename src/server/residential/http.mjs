import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createResidentialService, ResidentialError } from "./service.mjs";

export function createResidentialModule({ storage, currentUser }) {
    const res = createResidentialService({ storage });
    const app = new Hono();

    const actor = (c) => {
        const user = currentUser(c);
        if (c.req.method !== "GET" && c.req.header("X-Requested-With") !== "OpenFieldService")
            throw new ResidentialError("Use the workspace application to change residential records.", 403);
        return user;
    };
    const body = async (c) => {
        try { return await c.req.json(); }
        catch (e) { throw new ResidentialError(e?.name === "BodyLimitError" ? "Request too large." : "Send valid JSON.", e?.name === "BodyLimitError" ? 413 : 400); }
    };

    app.use("*", (c, next) => { c.header("Cache-Control", "private, no-store"); return next(); });
    app.use("*", bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: "Request too large." }, 413) }));
    app.onError((err, c) => {
        if (err instanceof ResidentialError) return c.json({ error: err.message }, err.status);
        console.error("Residential request failed:", err.name);
        return c.json({ error: "The residential operation could not be completed." }, 500);
    });

    app.get("/overview", (c) => c.json(res.overview(actor(c))));
    app.post("/plans", async (c) => c.json(res.savePlan(actor(c), await body(c))));
    app.post("/memberships", async (c) => c.json(res.enrollMembership(actor(c), await body(c)), 201));
    app.post("/memberships/:id/status", async (c) => c.json(res.updateMembershipStatus(actor(c), c.req.param("id"), await body(c))));
    app.post("/pricebook", async (c) => c.json(res.savePricebookItem(actor(c), await body(c))));
    app.post("/estimates", async (c) => c.json(res.createEstimate(actor(c), await body(c)), 201));
    app.post("/estimates/:id/accept", async (c) => c.json(res.acceptEstimate(actor(c), c.req.param("id"), await body(c))));
    app.post("/bookings", async (c) => c.json(res.createBooking(actor(c), await body(c)), 201));
    app.post("/bookings/:id/dispatch", async (c) => c.json(res.dispatchBooking(actor(c), c.req.param("id"), await body(c))));
    app.get("/mobile-packet/:jobId", (c) => c.json(res.mobilePacket(actor(c), c.req.param("jobId"))));
    app.get("/adaptive-dispatch", (c) => c.json(res.adaptiveDispatch(actor(c))));
    app.post("/payments", async (c) => c.json(res.recordPaymentIntent(actor(c), await body(c)), 201));
    app.post("/financing", async (c) => c.json(res.createFinancingReferral(actor(c), await body(c)), 201));

    return { app, res };
}
