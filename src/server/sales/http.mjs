import {createSalesCustomerOverview} from "./customer-overview.mjs";
import {createProspectConversion} from "./prospect-conversion.mjs";
import { renderCustomerQuoteHtml } from "./quote-document.mjs";
import { createQuotes } from "./quotes.mjs";
import { createBillingProfiles } from "./billing-profiles.mjs";
import { createActivities } from "./activities.mjs";
import { createCampaigns } from "./campaigns.mjs";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createSalesService } from "./service.mjs";
import { SalesError } from "./domain.mjs";
export function createSales({
  storage,
  currentUser,
  owners,
  resolveMessage,
  materialSnapshots,
  clock,
  jobHandoff,
  crmHandoff,
}) {
  const service = createSalesService({ storage, owners, clock }),
    app = new Hono();
  const billingProfiles = createBillingProfiles({
    storage,
    sales: service,
    materialSnapshots,
  });
  const quotes = createQuotes({
    storage,
    sales: service,
    pricing: billingProfiles,
    clock,
    jobHandoff,
    materialSnapshots,
  });
  const prospects=createProspectConversion({storage,sales:service,crmHandoff});
  const activities = createActivities({
    storage,
    sales: service,
    owners,
    resolveMessage,
  });
  const campaigns = createCampaigns({ storage });
  storage.salesCustomerOverviewInTransaction=createSalesCustomerOverview({storage,clock});
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
    } catch (error) {
      if (error?.name === "BodyLimitError")
        throw new SalesError("Request too large.", 413);
      throw new SalesError("Send a valid JSON request.");
    }
  }
  const templateActor = (c) => {
    c.header("Cache-Control", "private, no-store");
    return check(c);
  };
  app.get("/quotes/:id/conversion/options",c=>c.json(quotes.conversion.options(templateActor(c),c.req.param("id"),c.req.query())));
  app.get("/converted-jobs/:id",c=>c.json(quotes.conversion.forJob(templateActor(c),c.req.param("id"))));
  app.get("/quotes/:id/conversion",c=>c.json(quotes.conversion.summary(templateActor(c),c.req.param("id"))));
  app.post("/quotes/:id/conversion",async c=>{const data=await body(c);return c.json(quotes.conversion.convert(templateActor(c),c.req.param("id"),data));});
  app.post("/quotes/:id/conversion/cancel",async c=>{const data=await body(c);return c.json(quotes.conversion.cancel(templateActor(c),c.req.param("id"),data));});
  // SALES-007: Multi-option customer quotes (Good/Better/Best / Alternates)
  app.get("/quotes/:id/options", (c) => c.json(quotes.quoteOptions.list(templateActor(c), c.req.param("id"))));
  app.post("/quotes/:id/options", async (c) => c.json(quotes.quoteOptions.save(templateActor(c), c.req.param("id"), await body(c))));
  app.post("/quotes/:id/options/:optionId/select", async (c) => c.json(quotes.quoteOptions.select(templateActor(c), c.req.param("id"), c.req.param("optionId"), await body(c))));
  app.delete("/quotes/:id/options/:optionId", (c) => c.json(quotes.quoteOptions.remove(templateActor(c), c.req.param("id"), c.req.param("optionId"))));
  // SALES-016: Accepted quote to draft PO procurement allocation
  app.get("/quotes/:id/procurement", (c) => c.json(quotes.procurement.summary(templateActor(c), c.req.param("id"))));
  app.post("/quotes/:id/procurement", async (c) => c.json(quotes.procurement.allocate(templateActor(c), c.req.param("id"), await body(c))));
  // SALES-012: Owner/Admin Sales audit log read
  app.get("/audit", (c) => {
    const user = templateActor(c);
    if (!["owner", "admin"].includes(user.role)) throw new SalesError("Owner or Administrator access is required to view the Sales audit log.", 403);
    const rows = storage.database.prepare("SELECT id,entity_type AS entityType,entity_id AS entityId,actor_id AS actorId,action,before_json AS beforeJson,after_json AS afterJson,created_at AS createdAt FROM _sales_audit ORDER BY id DESC LIMIT 200").all();
    return c.json({ rows });
  });
  app.get("/quote-issuer", c=>c.json(quotes.lifecycle.issuer.detail(templateActor(c),c.req.query())));
  app.post("/quote-issuer",async c=>{const data=await body(c);return c.json(quotes.lifecycle.issuer.save(templateActor(c),data));});
  app.get("/quotes/:id/lifecycle",c=>c.json(quotes.lifecycle.summary(templateActor(c),c.req.param("id"),c.req.query())));
  app.post("/quotes/:id/lifecycle",async c=>{const data=await body(c);return c.json(quotes.lifecycle.record(templateActor(c),c.req.param("id"),data));});
  app.get("/quotes/:id/offer-document",c=>{
    const {html,...result}=quotes.lifecycle.frozenDocument(templateActor(c),c.req.param("id"),c.req.query());
    c.header("X-Content-Type-Options","nosniff");return c.json(result);
  });
  app.get("/quotes/:id/offer-document.html",c=>{
    const result=quotes.lifecycle.frozenDocument(templateActor(c),c.req.param("id"),c.req.query());
    c.header("X-Content-Type-Options","nosniff");
    c.header("Content-Security-Policy","sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    c.header("Content-Disposition",`attachment; filename="${result.document.identifier}-r${result.document.revision}-offer.html"`);
    return c.html(result.html);
  });
  app.get("/review-policy", (c) => c.json(quotes.review.policyDetail(templateActor(c), c.req.query())));
  app.post("/review-policy", async (c) => {
    const data = await body(c);
    return c.json(quotes.review.savePolicy(templateActor(c), data));
  });
  app.get("/quotes/:id/review", (c) => c.json(quotes.review.summary(templateActor(c), c.req.param("id"), c.req.query())));
  app.post("/quotes/:id/review", async (c) => {
    const data = await body(c);
    return c.json(quotes.review.record(templateActor(c), c.req.param("id"), data));
  });
  app.get("/quote-templates", (c) => c.json(quotes.templates.list(templateActor(c), c.req.query())));
  app.get("/quote-templates/:id", (c) => c.json(quotes.templates.detail(templateActor(c), c.req.param("id"), c.req.query())));
  app.post("/quote-templates", async (c) => {
    const data = await body(c);
    return c.json(quotes.templates.save(templateActor(c), data));
  });
  app.post("/quote-templates/:id/instantiate", async (c) => {
    const data = await body(c);
    return c.json(quotes.templates.instantiate(templateActor(c), c.req.param("id"), data));
  });
  app.get("/quotes", (c) => c.json(quotes.list(check(c), c.req.query())));
  app.get("/quotes/options", (c) =>
    c.json(quotes.options(check(c), c.req.query())),
  );
  app.get("/quotes/:id/document", (c) => {
    c.header("Cache-Control", "private, no-store");
    c.header("X-Content-Type-Options", "nosniff");
    return c.json(quotes.document(check(c), c.req.param("id"), c.req.query()));
  });
  app.get("/quotes/:id/document.html", (c) => {
    c.header("Cache-Control", "private, no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    const { document } = quotes.document(check(c), c.req.param("id"), c.req.query());
    c.header("Content-Disposition", `attachment; filename="${document.identifier}-r${document.revision}-draft.html"`);
    return c.html(renderCustomerQuoteHtml(document));
  });
  app.get("/quotes/:id", (c) =>
    c.json(quotes.detail(check(c), c.req.param("id"), c.req.query())),
  );
  app.post("/quotes", async (c) => {
    const data = await body(c);
    return c.json(quotes.save(check(c), data));
  });
  app.get("/billing-profiles", (c) =>
    c.json(billingProfiles.list(check(c), c.req.query())),
  );
  app.get("/billing-profiles/:id", (c) =>
    c.json(billingProfiles.get(check(c), c.req.param("id"))),
  );
  app.post("/billing-profiles", async (c) => {
    const data = await body(c);
    return c.json(billingProfiles.save(check(c), data));
  });
  app.post("/estimates/preview", async (c) => {
    const data = await body(c);
    return c.json(billingProfiles.preview(check(c), data));
  });
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
  app.get("/customers/:id/context", (c) =>
    c.json(service.customerContext(c.req.param("id"), c.req.query("page"))),
  );
  app.get("/options", (c) => c.json(service.options(c.req.query())));
  app.get("/opportunities/:id/prospect-conversion",c=>c.json(prospects.summary(templateActor(c),c.req.param("id"))));
  app.get("/opportunities/:id/prospect-conversion/options",c=>c.json(prospects.options(templateActor(c),c.req.param("id"),c.req.query())));
  app.post("/opportunities/:id/prospect-conversion",async c=>{const data=await body(c);return c.json(prospects.convert(templateActor(c),c.req.param("id"),data));});
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
  app.get("/opportunities/:id/outcomes", (c) =>
    c.json({ outcomes: service.outcomes(c.req.param("id")) }),
  );
  app.get("/forecast", (c) => c.json(service.forecast(c.req.query())));
  app.get("/forecast/stage-durations", (c) => c.json(service.stageDurations(c.req.query())));
  // SALES-019 & SALES-020: Ad campaigns, referral attribution and ROI analytics
  app.get("/campaigns", (c) => c.json(campaigns.list(c.req.query())));
  app.get("/campaigns/analytics", (c) => c.json(campaigns.analytics(c.req.query())));
  app.get("/campaigns/:id", (c) => c.json(campaigns.detail(c.req.param("id"), c.req.query())));
  app.post("/campaigns", async (c) => c.json(campaigns.save(check(c), null, await body(c)), 201));
  app.put("/campaigns/:id", async (c) => c.json(campaigns.save(check(c), c.req.param("id"), await body(c))));
  app.post("/attributions", async (c) => c.json(campaigns.attribute(check(c), await body(c)), 201));
  app.post("/opportunities/:id/notes", async (c) => {
    const data = await body(c);
    return c.json(
      { opportunity: service.note(check(c), c.req.param("id"), data) },
      201,
    );
  });
  app.get("/activities/reminders", (c) =>
    c.json(activities.reminders(check(c))),
  );
  app.get("/activities", (c) =>
    c.json(activities.list(check(c), c.req.query())),
  );
  app.post("/opportunities/:id/activities", async (c) => {
    const data = await body(c);
    return c.json(
      activities.save(check(c), c.req.param("id"), null, data),
      201,
    );
  });
  app.put("/opportunities/:id/activities/:activityId", async (c) => {
    const data = await body(c);
    return c.json(
      activities.save(
        check(c),
        c.req.param("id"),
        c.req.param("activityId"),
        data,
      ),
    );
  });
  return { app, service, billingProfiles, quotes, campaigns, issuer:quotes.lifecycle.issuer.publicFields };
}
