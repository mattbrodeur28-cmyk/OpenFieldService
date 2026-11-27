import { Hono } from "hono";
import { createControlsService, ControlsError } from "./service.mjs";

export function createControlsModule({ storage, currentUser }) {
  const service = createControlsService({ storage });
  const app = new Hono();
  const actor = (c) => {
    c.header("Cache-Control", "private, no-store");
    const u = currentUser(c);
    if (!u?.active || u.mustChangePassword) throw new ControlsError("Sign in to continue.", 401);
    return u;
  };
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch {
      throw new ControlsError("Send valid JSON.", 400);
    }
  };

  app.onError((err, c) => {
    if (err instanceof ControlsError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Controls request failed." }, 500);
  });

  app.get("/summary", (c) => c.json(service.summary(actor(c))));
  app.get("/systems", (c) => c.json({ rows: service.listSystems(actor(c)) }));
  app.post("/systems", async (c) => c.json(service.createSystem(actor(c), await body(c)), 201));
  app.get("/systems/:id/handover", (c) => c.json(service.handoverPackage(actor(c), c.req.param("id"))));

  app.get("/controllers", (c) => c.json({ rows: service.listControllers(actor(c), c.req.query("systemId") || undefined) }));
  app.post("/controllers", async (c) => c.json(service.createController(actor(c), await body(c)), 201));
  app.post("/controllers/:id/move", async (c) => c.json(service.moveOrReplaceController(actor(c), c.req.param("id"), await body(c))));

  app.get("/checkouts", (c) => c.json({ rows: service.listCheckouts(actor(c)) }));
  app.post("/checkouts", async (c) => c.json(service.createCheckout(actor(c), await body(c)), 201));
  app.post("/checkouts/:id/review", async (c) => c.json(service.reviewCheckout(actor(c), c.req.param("id"), await body(c))));

  app.get("/artifacts", (c) => c.json({ rows: service.listArtifacts(actor(c)) }));
  app.post("/artifacts", async (c) => c.json(service.createArtifact(actor(c), await body(c)), 201));

  app.get("/deficiencies", (c) => c.json({ rows: service.listDeficiencies(actor(c)) }));
  app.post("/deficiencies", async (c) => c.json(service.createDeficiency(actor(c), await body(c)), 201));
  app.post("/deficiencies/:id/corrective-job", async (c) =>
    c.json(service.scheduleCorrectiveJob(actor(c), c.req.param("id"), await body(c)), 201),
  );
  app.post("/deficiencies/:id/close", async (c) => c.json(service.closeDeficiency(actor(c), c.req.param("id"), await body(c))));

  app.get("/maintenance-links", (c) => c.json({ rows: service.listMaintLinks(actor(c)) }));
  app.post("/maintenance-links", async (c) => c.json(service.recordMaintLink(actor(c), await body(c)), 201));

  return { app, service };
}
