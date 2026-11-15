import { createPostWork } from "./reports.mjs";
import { createSafetyWorkflow } from "./safety.mjs";
import { ServiceIdentityError } from "./identity.mjs";
export function mountExecution(app, { storage, identity, check, people }) {
  const service = createSafetyWorkflow({ storage, identity, people });
  const reports = createPostWork({ storage, identity, safety: service });
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch {
      throw new ServiceIdentityError("Send a valid JSON request.");
    }
  };
  app.get("/safety-templates", (c) => {
    check(c);
    return c.json({ templates: service.templates() });
  });
  app.post("/safety-templates", async (c) => {
    const data = await body(c);
    return c.json({ template: service.saveTemplate(check(c), data) }, 201);
  });
  app.get("/jobs/:id/workflow", (c) =>
    c.json(reports.detail(check(c), c.req.param("id"))),
  );
  app.post("/jobs/:id/workflow", async (c) => {
    const data = await body(c);
    return c.json(service.enroll(check(c), c.req.param("id"), data), 201);
  });
  app.put("/jobs/:id/safety-draft", async (c) => {
    const data = await body(c);
    return c.json(service.safety(check(c), c.req.param("id"), data));
  });
  app.post("/jobs/:id/safety-submit", async (c) => {
    const data = await body(c);
    return c.json(service.safety(check(c), c.req.param("id"), data, true));
  });
  app.post("/jobs/:id/safety-reassess", async (c) => {
    const data = await body(c);
    return c.json(service.reassess(check(c), c.req.param("id"), data));
  });
  app.put("/jobs/:id/report-draft", async (c) => {
    const data = await body(c);
    return c.json(reports.save(check(c), c.req.param("id"), data));
  });
  app.post("/jobs/:id/report-submit", async (c) => {
    const data = await body(c);
    return c.json(reports.save(check(c), c.req.param("id"), data, true));
  });
  app.post("/jobs/:id/report-review", async (c) => {
    const data = await body(c);
    return c.json(reports.review(check(c), c.req.param("id"), data));
  });
  return { ...service, reports };
}
