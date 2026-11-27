import { createPurchasing } from "./service.mjs";
import { createPurchasingExtensions } from "./extensions.mjs";
import { fail } from "../inventory/domain.mjs";
export function mountPurchasing(app, options) {
  const purchasing = createPurchasing(options),
    ext = createPurchasingExtensions({ storage: options.storage }),
    check = options.check;
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch (error) {
      if (error?.name === "BodyLimitError") fail("Request too large.", 413);
      fail("Send a valid JSON request.");
    }
  };
  app.get("/purchasing/options", (c) => c.json(purchasing.options(check(c))));
  app.get("/purchasing/orders", (c) =>
    c.json(
      purchasing.list(check(c), {
        page: Number(c.req.query("page") || 1),
        status: c.req.query("status") || "all",
        search: c.req.query("search") || "",
      }),
    ),
  );
  app.get("/purchasing/orders/:id", (c) =>
    c.json(
      purchasing.detail(
        check(c),
        c.req.param("id"),
        Number(c.req.query("page") || 1),
      ),
    ),
  );
  for (const [path, method] of [
    ["suppliers", "saveSupplier"],
    ["orders", "saveOrder"],
    ["actions", "action"],
    ["receipts", "receive"],
  ])
    app.post("/purchasing/" + path, async (c) => {
      const d = await body(c);
      return c.json(purchasing[method](check(c), d));
    });
  // M16 PURCH-001/005: Vendor SKU mappings, supplier returns/credits, and PO reconciliation
  app.get("/purchasing/vendor-skus", (c) => c.json({ skus: ext.listVendorSkus(check(c), c.req.query("materialId") || null) }));
  app.post("/purchasing/vendor-skus", async (c) => c.json(ext.saveVendorSku(check(c), await body(c))));
  app.get("/purchasing/credits", (c) => c.json({ credits: ext.listCredits(check(c), c.req.query("orderId") || null) }));
  app.post("/purchasing/credits", async (c) => c.json(ext.recordCredit(check(c), await body(c)), 201));
  app.get("/purchasing/reconciliation", (c) => c.json(ext.reconciliation(check(c))));
  return purchasing;
}
