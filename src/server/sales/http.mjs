import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createSalesService } from "./service.mjs";
import { SalesError } from "./domain.mjs";
export function createSales({ storage, currentUser, owners }) {
  const service = createSalesService({ storage, owners }),
    app = new Hono();
  app.use(
    "*",
    bodyLimit({
      maxSize: 50000,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    }),
  );
  const actor = (c) => currentUser(c);
  const check = (c) => {
    const user = actor(c);
    if (!user?.active) throw new SalesError("Sign in to continue.", 401);
    if (user.mustChangePassword)
      throw new SalesError(
        "Change your temporary password before continuing.",
        403,
      );
    if (
      c.req.method !== "GET" &&
      (user.role === "viewer" ||
        c.req.header("X-Requested-With") !== "OpenFieldService")
    )
      throw new SalesError("Your account cannot change Sales records.", 403);
    return user;
  };
  app.use("*", (c, next) => {
    check(c);
    return next();
  });
  app.onError((error, c) => {
    if (error instanceof SalesError)
      return c.json({ error: error.message }, error.status);
    console.error("Sales request failed:", error.name);
    return c.json(
      { error: "The Sales operation could not be completed." },
      500,
    );
  });
  async function body(c) {
    try {
      return await c.req.json();
    } catch {
      throw new SalesError("Send a valid JSON request.");
    }
  }
  app.get("/pipelines", (c) =>
    c.json({ pipelines: service.pipelines(), currency: "USD" }),
  );
  app.post("/pipelines", async (c) => {
    const data = await body(c);
    return c.json(
      { pipeline: service.savePipeline(check(c), null, data) },
      201,
    );
  });
  app.put("/pipelines/:id", async (c) => {
    const data = await body(c);
    return c.json({
      pipeline: service.savePipeline(check(c), c.req.param("id"), data),
    });
  });
  app.get("/options", (c) => c.json(service.options(c.req.query())));
  app.get("/opportunities", (c) => c.json(service.list(c.req.query())));
  app.get("/opportunities/:id", (c) =>
    c.json(service.detail(c.req.param("id"))),
  );
  app.post("/opportunities", async (c) => {
    const data = await body(c);
    return c.json(
      { opportunity: service.saveOpportunity(check(c), null, data) },
      201,
    );
  });
  app.put("/opportunities/:id", async (c) => {
    const data = await body(c);
    return c.json({
      opportunity: service.saveOpportunity(check(c), c.req.param("id"), data),
    });
  });
  app.put("/opportunities/:id/stage", async (c) => {
    const data = await body(c);
    return c.json({
      opportunity: service.move(check(c), c.req.param("id"), data),
    });
  });
  app.post("/opportunities/:id/notes", async (c) => {
    const data = await body(c);
    return c.json(
      { opportunity: service.note(check(c), c.req.param("id"), data) },
      201,
    );
  });
  return { app, service };
}
