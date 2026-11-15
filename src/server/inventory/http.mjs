import { createInventory } from "./service.mjs";
import { fail } from "./domain.mjs";
export function mountInventory(
  app,
  { storage, identity, check, purchaseReferences },
) {
  const inventory = createInventory({ storage, identity, purchaseReferences });
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch {
      fail("Send a valid JSON request.");
    }
  };
  app.get("/inventory", (c) => c.json(inventory.options(check(c))));
  app.get("/inventory/locations/:id", (c) =>
    c.json(
      inventory.detail(
        check(c),
        c.req.param("id"),
        Number(c.req.query("page") || 1),
      ),
    ),
  );
  app.post("/inventory/locations", async (c) => {
    const data = await body(c);
    return c.json(inventory.saveLocation(check(c), data));
  });
  app.put("/inventory/policy", async (c) => {
    const data = await body(c);
    return c.json(inventory.policy(check(c), data));
  });
  app.post("/inventory/movements/:kind", async (c) => {
    const data = await body(c);
    return c.json(inventory.post(check(c), c.req.param("kind"), data));
  });
  app.get("/jobs/:id/inventory", (c) =>
    c.json(inventory.jobUsage(check(c), c.req.param("id"))),
  );
  return inventory;
}
