import { z } from "zod";
import { CrmError, requireWriter, parse, version } from "./domain.mjs";

// CRM-001 transport. Mounted inside the service app, so routes are relative:
//   /customers/:customerId/contacts, /customers/:customerId/billing-links,
//   /customers/:customerId/account
// Auth, session and anti-CSRF checks arrive from the parent service app's middleware;
// `check(c)` resolves the current writer for mutations.
export function mountCrm(app, { crm, check }) {
  const body = async (c) => {
    try {
      return await c.req.json();
    } catch (error) {
      if (error?.name === "BodyLimitError")
        throw new CrmError("Request too large.", 413);
      throw new CrmError("Send a valid JSON request.");
    }
  };
  // Do NOT register app.onError here: the parent service app owns the shared error handler,
  // and overriding it would stop ServiceIdentityError (and other modules' errors) from mapping
  // to their proper JSON status codes. Wrap each handler so only CrmError is converted locally.
  const route = (handler) => async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      if (error instanceof CrmError)
        return c.json({ error: error.message }, error.status);
      throw error;
    }
  };

  app.get(
    "/customers/:customerId/contacts",
    route((c) => {
      const user = check(c);
      const includeInactive = c.req.query("includeInactive") === "true";
      const siteId = c.req.query("siteId") || null;
      return c.json({
        contacts: crm.listContacts(user, c.req.param("customerId"), {
          siteId,
          includeInactive,
        }),
      });
    }),
  );

  app.get(
    "/customers/:customerId/contacts/by-role/:role",
    route((c) => {
      const user = check(c);
      return c.json({
        contacts: crm.contactsByRole(
          user,
          c.req.param("customerId"),
          c.req.param("role"),
        ),
      });
    }),
  );

  app.post(
    "/customers/:customerId/contacts",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json(
        {
          contact: crm.createContact(check(c), c.req.param("customerId"), data),
        },
        201,
      );
    }),
  );

  app.put(
    "/customers/:customerId/contacts/:id",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json({
        contact: crm.updateContact(
          check(c),
          c.req.param("id"),
          data,
          c.req.param("customerId"),
        ),
      });
    }),
  );

  app.post(
    "/customers/:customerId/contacts/:id/archive",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = parse(
        z.object({ expectedVersion: version }).strict(),
        await body(c),
      );
      return c.json({
        contact: crm.archiveContact(
          check(c),
          c.req.param("id"),
          c.req.param("customerId"),
          data.expectedVersion,
        ),
      });
    }),
  );

  app.post(
    "/customers/:customerId/contacts/:id/restore",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = parse(
        z.object({ expectedVersion: version }).strict(),
        await body(c),
      );
      return c.json({
        contact: crm.restoreContact(
          check(c),
          c.req.param("id"),
          c.req.param("customerId"),
          data.expectedVersion,
        ),
      });
    }),
  );

  app.get(
    "/customers/:customerId/billing-links",
    route((c) => {
      const user = check(c);
      return c.json({
        links: crm.listBillingLinks(user, c.req.param("customerId")),
      });
    }),
  );

  app.post(
    "/customers/:customerId/billing-links",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json(
        {
          link: crm.createBillingLink(
            check(c),
            c.req.param("customerId"),
            data,
          ),
        },
        201,
      );
    }),
  );

  app.delete(
    "/customers/:customerId/billing-links/:id",
    route((c) => {
      const user = check(c);
      requireWriter(user);
      return c.json(
        crm.removeBillingLink(
          user,
          c.req.param("id"),
          c.req.param("customerId"),
        ),
      );
    }),
  );

  app.get(
    "/customers/:customerId/account",
    route((c) => {
      const user = check(c);
      return c.json({
        account: crm.accountSettings(user, c.req.param("customerId")),
      });
    }),
  );

  // CRM-002: one read-only summary across contacts, sites, equipment, jobs, invoices and Sales.
  app.get(
    "/customers/:customerId/360",
    route((c) => {
      const user = check(c);
      return c.json(crm.customer360(user, c.req.param("customerId")));
    }),
  );

  // CRM-004: customer-scoped activities (tasks, follow-ups, notes) with reminders.
  app.get(
    "/customers/:customerId/activities",
    route((c) => {
      const user = check(c);
      return c.json(crm.activities.list(user, c.req.param("customerId"), c.req.query()));
    }),
  );
  app.post(
    "/customers/:customerId/activities",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json(crm.activities.save(user, c.req.param("customerId"), null, data), 201);
    }),
  );
  app.put(
    "/customers/:customerId/activities/:id",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json(crm.activities.save(user, c.req.param("customerId"), c.req.param("id"), data));
    }),
  );
  app.get(
    "/activities/reminders",
    route((c) => {
      const user = check(c);
      return c.json(crm.activities.reminders(user));
    }),
  );

  app.put(
    "/customers/:customerId/account",
    route(async (c) => {
      const user = check(c);
      requireWriter(user);
      const data = await body(c);
      return c.json({
        account: crm.saveAccountSettings(
          check(c),
          c.req.param("customerId"),
          data,
        ),
      });
    }),
  );

  return app;
}
