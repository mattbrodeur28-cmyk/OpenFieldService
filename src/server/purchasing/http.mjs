import { createPurchasing } from "./service.mjs";
import { fail } from "../inventory/domain.mjs";
export function mountPurchasing(app, options) {
  const purchasing = createPurchasing(options),
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
  return purchasing;
}
