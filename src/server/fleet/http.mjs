import { createFleet } from "./service.mjs";
import { fail } from "../inventory/domain.mjs";
export function mountFleet(app, options) {
  const fleet = createFleet(options),
    check = options.check;
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch {
      fail("Send a valid JSON request.");
    }
  };
  app.get("/fleet", (c) => c.json(fleet.list(check(c))));
  app.get("/fleet/:id", (c) =>
    c.json(
      fleet.detail(
        check(c),
        c.req.param("id"),
        Number(c.req.query("page") || 1),
      ),
    ),
  );
  app.post("/fleet", async (c) => {
    const d = await body(c);
    return c.json(fleet.save(check(c), d));
  });
  app.post("/fleet/plans", async (c) => {
    const d = await body(c);
    return c.json(fleet.savePlan(check(c), d));
  });
  app.post("/fleet/services", async (c) => {
    const d = await body(c);
    return c.json(fleet.complete(check(c), d));
  });
  return fleet;
}
