import { createInventory } from "./service.mjs";
import { createInventoryExtensions } from "./reservations.mjs";
import { fail } from "./domain.mjs";
export function mountInventory(
  app,
  { storage, identity, check, purchaseReferences },
) {
  const inventory = createInventory({ storage, identity, purchaseReferences });
  const ext = createInventoryExtensions({ storage });
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
  // M13 TECH-009/010: Stock reservations & physical stocktakes
  app.get("/inventory/reservations", (c) => c.json({ reservations: ext.listReservations(check(c), c.req.query()) }));
  app.post("/inventory/reservations", async (c) => c.json(ext.reserve(check(c), await body(c)), 201));
  app.post("/inventory/reservations/:id/release", (c) => c.json(ext.releaseReservation(check(c), c.req.param("id"), "released")));
  app.post("/inventory/reservations/:id/consume", (c) => c.json(ext.releaseReservation(check(c), c.req.param("id"), "consumed")));
  app.get("/inventory/stocktakes", (c) => c.json({ stocktakes: ext.listStocktakes(check(c)) }));
  app.post("/inventory/stocktakes", async (c) => c.json(ext.createStocktake(check(c), await body(c)), 201));
  app.post("/inventory/stocktakes/:id/approve", (c) => c.json(ext.approveStocktake(check(c), c.req.param("id"))));
  return inventory;
}
