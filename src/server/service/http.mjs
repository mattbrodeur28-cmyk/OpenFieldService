import { createCompanySettings } from "./company.mjs";
import { mountExecution } from "./execution-http.mjs";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createServiceIdentity, ServiceIdentityError } from "./identity.mjs";
export function createService({ storage, currentUser, people }) {
  const company = createCompanySettings({ storage });
  storage.companyTimeZone = company.timeZone;
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
      maxSize: 50000,
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
    if (String(error.message).includes("SERVICE_TIME_OVERLAP"))
      return c.json(
        {
          error:
            "This technician already has overlapping submitted or approved time. Review the existing report before saving.",
        },
        409,
      );
    console.error("Service identity request failed:", error.name);
    return c.json(
      { error: "The technician identity operation could not be completed." },
      500,
    );
  });
  app.get("/company", (c) => c.json(company.read()));
  app.put("/company", async (c) => {
    let data;
    try {
      data = await c.req.json();
    } catch {
      throw new ServiceIdentityError("Send a valid JSON request.");
    }
    return c.json(company.save(check(c), data));
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
  const execution = mountExecution(app, {
    storage,
    identity: service,
    check,
    people,
  });
  return { app, service, execution, company };
}
