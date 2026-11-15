import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createServiceIdentity, ServiceIdentityError } from "./identity.mjs";
export function createService({ storage, currentUser, people }) {
  const service = createServiceIdentity({ storage, people }),
    app = new Hono();
  const check = (c) => {
    const user = currentUser(c);
    if (!user?.active)
      throw new ServiceIdentityError("Sign in to continue.", 401);
    if (user.mustChangePassword)
      throw new ServiceIdentityError(
        "Change your temporary password first.",
        403,
      );
    if (
      c.req.method !== "GET" &&
      c.req.header("X-Requested-With") !== "OpenFieldService"
    )
      throw new ServiceIdentityError(
        "Use the workspace application to change technician links.",
        403,
      );
    return user;
  };
  app.use(
    "*",
    bodyLimit({
      maxSize: 4000,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    }),
  );
  app.use("*", (c, next) => {
    check(c);
    return next();
  });
  app.onError((error, c) => {
    if (error instanceof ServiceIdentityError)
      return c.json({ error: error.message }, error.status);
    console.error("Service identity request failed:", error.name);
    return c.json(
      { error: "The technician identity operation could not be completed." },
      500,
    );
  });
  app.get("/technician-users", (c) => c.json(service.configuration(check(c))));
  app.get("/my-technician", (c) =>
    c.json({ technician: service.technician(check(c)) }),
  );
  app.put("/technician-users/:id", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      throw new ServiceIdentityError("Send a valid JSON request.");
    }
    return c.json({
      technician: service.save(check(c), c.req.param("id"), body),
    });
  });
  return { app, service };
}
