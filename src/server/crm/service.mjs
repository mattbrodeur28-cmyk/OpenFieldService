import {createCrmProspectHandoff} from "./prospect-handoff.mjs";
import { createCrmActivities } from "./activity.mjs";
import { createCrmCommunications } from "./communication.mjs";
import { randomUUID } from "node:crypto";
import { transaction, migrate } from "../platform/sqlite.mjs";
import { reviewSchema } from "./review-schema.mjs";
import { activitySchema } from "./activity-schema.mjs";
import { communicationSchema } from "./communication-schema.mjs";
import { crmSchema } from "./schema.mjs";
import {
  CrmError,
  requireWriter,
  requireReader,
  parse,
  contactInput,
  contactUpdateInput,
  billingLinkInput,
  accountSettingsInput,
  validateContact,
  ROLES,
} from "./domain.mjs";

// CRM-001 application service: synchronous, independent of HTTP.
// Identity checks receive the current user; no cross-database transaction is claimed.
export function installCrm(db) {
  migrate(db, "_crm_migrations", [
    { version: 1, sql: crmSchema },
    { version: 2, sql: reviewSchema },
    { version: 3, sql: activitySchema },
    { version: 4, sql: communicationSchema },
  ]);
}

export function createCrmService({ storage, invoiceSummaryInTransaction, salesSummaryInTransaction, timeZone, people = () => [], clock = () => new Date() }) {
  const db = storage.database;
  installCrm(db);

  const uuid = (id, label) => {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
      throw new CrmError(`Choose a valid ${label}.`);
    return id;
  };

  const customer = (id) => {
    uuid(id, "customer");
    const row = db.prepare("SELECT id,name FROM customers WHERE id=?").get(id);
    if (!row) throw new CrmError("Customer not found.", 404);
    return row;
  };

  const site = (id) => {
    uuid(id, "site");
    const row = db
      .prepare("SELECT id,name,customer_id FROM sites WHERE id=?")
      .get(id);
    if (!row) throw new CrmError("Site not found.", 404);
    return row;
  };

  const contactRow = (id) => {
    uuid(id, "contact");
    const row = db.prepare("SELECT * FROM _crm_contacts WHERE id=?").get(id);
    if (!row) throw new CrmError("Contact not found.", 404);
    return row;
  };

  const rolesFor = (id) =>
    db
      .prepare(
        "SELECT role FROM _crm_contact_roles WHERE contact_id=? ORDER BY role",
      )
      .all(id)
      .map((r) => r.role);

  const shape = (row) =>
    row && {
      id: row.id,
      customerId: row.customer_id,
      siteId: row.site_id,
      name: row.name,
      title: row.title,
      email: row.email,
      phone: row.phone,
      emailOk: row.email_ok === 1,
      phoneOk: row.phone_ok === 1,
      smsOk: row.sms_ok === 1,
      notes: row.notes,
      active: row.active === 1,
      roles: rolesFor(row.id),
      version: row.version,
    };

  const audit = (user, type, id, action, before, after) => {
    db.prepare(
      "INSERT INTO _crm_audit(entity_type,entity_id,actor_id,action,before_json,after_json) VALUES(?,?,?,?,?,?)",
    ).run(
      type,
      id,
      user.id,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
    );
  };

  const expected = (row, version) => {
    if (version !== row.version)
      throw new CrmError(
        "This contact changed in another session. Close and reopen it before saving.",
        409,
      );
  };

  // Contacts for a customer, optionally narrowed to one site. Inactive contacts are retained
  // and returned only when explicitly asked for, so retired people do not clutter the list.
  function listContacts(
    user,
    customerId,
    { siteId = null, includeInactive = false } = {},
  ) {
    requireReader(user);
    customer(customerId);
    const rows = siteId
      ? db
          .prepare(
            "SELECT * FROM _crm_contacts WHERE customer_id=? AND site_id=? " +
              (includeInactive ? "" : "AND active=1 ") +
              "ORDER BY active DESC,name COLLATE NOCASE",
          )
          .all(customerId, uuid(siteId, "site"))
      : db
          .prepare(
            "SELECT * FROM _crm_contacts WHERE customer_id=? " +
              (includeInactive ? "" : "AND active=1 ") +
              "ORDER BY active DESC,name COLLATE NOCASE",
          )
          .all(customerId);
    return rows.map(shape);
  }

  function createContactInTransaction(user, customerId, input, suppliedId) {
    requireWriter(user);
    const data = parse(contactInput, input);
    validateContact(data);
    if(!db.isTransaction)throw new Error("Contact handoff requires a caller-owned transaction.");
    {
      customer(customerId);
      if (data.siteId) {
        const owner = site(data.siteId);
        if (owner.customer_id !== customerId)
          throw new CrmError("That site belongs to a different customer.");
      }
      const id = suppliedId || randomUUID();
      db.prepare(
        "INSERT INTO _crm_contacts(id,customer_id,site_id,name,title,email,phone,email_ok,phone_ok,sms_ok,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        customerId,
        data.siteId,
        data.name,
        data.title,
        data.email,
        data.phone,
        data.emailOk ? 1 : 0,
        data.phoneOk ? 1 : 0,
        data.smsOk ? 1 : 0,
        data.notes,
      );
      for (const role of data.roles)
        db.prepare(
          "INSERT INTO _crm_contact_roles(contact_id,role) VALUES(?,?)",
        ).run(id, role);
      const row = contactRow(id);
      audit(user, "contact", id, "create", null, shape(row));
      return shape(row);
    }
  }

  function createContact(user,customerId,input){
    requireWriter(user);
    return transaction(db,()=>createContactInTransaction(user,customerId,input));
  }

  function updateContact(user, id, input, customerId) {
    requireWriter(user);
    const data = parse(contactUpdateInput, input);
    validateContact(data);
    return transaction(db, () => {
      const old = contactRow(id);
      if (customerId && old.customer_id !== customerId)
        throw new CrmError("Contact not found for this customer.", 404);
      const before = shape(old);
      expected(old, data.expectedVersion);
      if (data.siteId) {
        const owner = site(data.siteId);
        if (owner.customer_id !== old.customer_id)
          throw new CrmError("That site belongs to a different customer.");
      }
      db.prepare(
        "UPDATE _crm_contacts SET site_id=?,name=?,title=?,email=?,phone=?,email_ok=?,phone_ok=?,sms_ok=?,notes=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        data.siteId,
        data.name,
        data.title,
        data.email,
        data.phone,
        data.emailOk ? 1 : 0,
        data.phoneOk ? 1 : 0,
        data.smsOk ? 1 : 0,
        data.notes,
        id,
      );
      // Roles are a set: replace them wholesale so removing one is a normal edit.
      db.prepare("DELETE FROM _crm_contact_roles WHERE contact_id=?").run(id);
      for (const role of data.roles)
        db.prepare(
          "INSERT INTO _crm_contact_roles(contact_id,role) VALUES(?,?)",
        ).run(id, role);
      const row = contactRow(id);
      audit(user, "contact", id, "update", before, shape(row));
      return shape(row);
    });
  }

  // Deactivate rather than delete: service history and audit reference these people.
  function archiveContact(user, id, customerId, expectedVersion) {
    requireWriter(user);
    return transaction(db, () => {
      const old = contactRow(id);
      if (customerId && old.customer_id !== customerId)
        throw new CrmError("Contact not found for this customer.", 404);
      if (old.active === 0) return shape(old);
      if (customerId) expected(old, expectedVersion);
      db.prepare(
        "UPDATE _crm_contacts SET active=0,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(id);
      const row = contactRow(id);
      audit(user, "contact", id, "archive", shape(old), shape(row));
      return shape(row);
    });
  }

  function restoreContact(user, id, customerId, expectedVersion) {
    requireWriter(user);
    return transaction(db, () => {
      const old = contactRow(id);
      if (customerId && old.customer_id !== customerId)
        throw new CrmError("Contact not found for this customer.", 404);
      if (old.active === 1) return shape(old);
      if (customerId) expected(old, expectedVersion);
      db.prepare(
        "UPDATE _crm_contacts SET active=1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(id);
      const row = contactRow(id);
      audit(user, "contact", id, "restore", shape(old), shape(row));
      return shape(row);
    });
  }

  // Billing links: which account is invoiced for a site.
  function listBillingLinks(user, customerId) {
    requireReader(user);
    customer(customerId);
    return db
      .prepare(
        "SELECT l.*,c.name AS billing_name,s.name AS site_name FROM _crm_billing_links l " +
          "JOIN customers c ON c.id=l.billing_customer_id JOIN sites s ON s.id=l.site_id " +
          "WHERE l.billing_customer_id=? OR s.customer_id=? ORDER BY s.name",
      )
      .all(customerId, customerId)
      .map((r) => ({
        id: r.id,
        siteId: r.site_id,
        siteName: r.site_name,
        billingCustomerId: r.billing_customer_id,
        billingName: r.billing_name,
        poRequired: r.po_required === 1,
        notes: r.notes,
      }));
  }

  function createBillingLink(user, customerId, input) {
    requireWriter(user);
    const data = parse(billingLinkInput, input);
    return transaction(db, () => {
      customer(customerId);
      const target = site(data.siteId);
      const billing = customer(data.billingCustomerId);
      if (target.customer_id !== customerId)
        throw new CrmError(
          "That site belongs to a different customer. Link from the site's own account.",
        );
      const existing = db
        .prepare(
          "SELECT id FROM _crm_billing_links WHERE site_id=? AND billing_customer_id=?",
        )
        .get(data.siteId, data.billingCustomerId);
      if (existing)
        throw new CrmError(
          "That account is already the billing party for this site.",
          409,
        );
      const id = randomUUID();
      db.prepare(
        "INSERT INTO _crm_billing_links(id,site_id,billing_customer_id,po_required,notes) VALUES(?,?,?,?,?)",
      ).run(
        id,
        data.siteId,
        data.billingCustomerId,
        data.poRequired ? 1 : 0,
        data.notes,
      );
      const saved = {
        id,
        siteId: data.siteId,
        siteName: target.name,
        billingCustomerId: data.billingCustomerId,
        billingName: billing.name,
        poRequired: data.poRequired,
        notes: data.notes,
      };
      audit(user, "billing_link", id, "create", null, saved);
      return saved;
    });
  }

  function removeBillingLink(user, id, customerId) {
    requireWriter(user);
    return transaction(db, () => {
      uuid(id, "billing link");
      const old = db
        .prepare("SELECT * FROM _crm_billing_links WHERE id=?")
        .get(id);
      if (!old) throw new CrmError("Billing link not found.", 404);
      if (
        customerId &&
        old.billing_customer_id !== customerId &&
        site(old.site_id).customer_id !== customerId
      )
        throw new CrmError("Billing link not found for this customer.", 404);
      db.prepare("DELETE FROM _crm_billing_links WHERE id=?").run(id);
      audit(user, "billing_link", id, "remove", old, null);
      return { ok: true };
    });
  }

  // Account classification stored beside the legacy customers row.
  function accountSettings(user, customerId) {
    requireReader(user);
    customer(customerId);
    const row = db
      .prepare("SELECT * FROM _crm_account_settings WHERE customer_id=?")
      .get(customerId);
    if (!row)
      return {
        customerId,
        segment: "commercial",
        accountType: "customer",
        parentCustomerId: null,
        version: 0,
      };
    return {
      customerId,
      segment: row.segment,
      accountType: row.account_type,
      parentCustomerId: row.parent_customer_id,
      version: row.version,
    };
  }

  function saveAccountSettings(user, customerId, input) {
    requireWriter(user);
    const data = parse(accountSettingsInput, input);
    return transaction(db, () => {
      customer(customerId);
      if (data.parentCustomerId) {
        if (data.parentCustomerId === customerId)
          throw new CrmError("An account cannot be its own parent.");
        customer(data.parentCustomerId);
        const visited = new Set([customerId]);
        let cursor = data.parentCustomerId;
        while (cursor) {
          if (visited.has(cursor))
            throw new CrmError(
              "That would create an account relationship loop.",
            );
          visited.add(cursor);
          cursor = db
            .prepare(
              "SELECT parent_customer_id FROM _crm_account_settings WHERE customer_id=?",
            )
            .get(cursor)?.parent_customer_id;
        }
      }
      const before = accountSettings(user, customerId);
      if (before.version !== data.expectedVersion)
        throw new CrmError(
          "Account classification changed. Reload before saving.",
          409,
        );
      db.prepare(
        "INSERT INTO _crm_account_settings(customer_id,segment,account_type,parent_customer_id,version,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) " +
          "ON CONFLICT(customer_id) DO UPDATE SET segment=excluded.segment,account_type=excluded.account_type,parent_customer_id=excluded.parent_customer_id,version=excluded.version,updated_at=CURRENT_TIMESTAMP",
      ).run(
        customerId,
        data.segment,
        data.accountType,
        data.parentCustomerId,
        before.version + 1,
      );
      const after = accountSettings(user, customerId);
      audit(user, "account", customerId, "settings", before, after);
      return after;
    });
  }

  // The contacts usable for a given purpose, e.g. who to invoice or who to call on site.
  function contactsByRole(user, customerId, role) {
    requireReader(user);
    if (!ROLES.includes(role))
      throw new CrmError("Choose a valid contact role.");
    customer(customerId);
    const rows = db
      .prepare(
        "SELECT c.* FROM _crm_contacts c JOIN _crm_contact_roles r ON r.contact_id=c.id " +
          "WHERE c.customer_id=? AND c.active=1 AND r.role=? ORDER BY c.name COLLATE NOCASE",
      )
      .all(customerId, role);
    return rows.map(shape);
  }

  // ===== CRM-002: Customer 360 ===============================================================
  // One read-only summary of everything the company already knows about an account, so the
  // Customer 360 screen makes one request instead of six. Nothing here writes, and nothing is
  // copied: every figure is a live count or a projection of the owning module's rows.
  //
  // Module tables are optional. A database that has never opened the Sales or invoice screens
  // still answers honestly with a null section rather than a 500, so the view can distinguish
  // "you have none" from "this module is not installed".

  const hasTable = (name) =>
    Boolean(
      db
        .prepare(
          "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(name),
    );

  function customer360InSnapshot(user, customerId) {
    requireReader(user);
    const account = db
      .prepare(
        "SELECT id,name,email,phone,address,city,state,zip,created_at FROM customers WHERE id=?",
      )
      .get(uuid(customerId, "customer"));
    if (!account) throw new CrmError("Customer not found.", 404);

    const counts = {
      contacts: db
        .prepare(
          "SELECT COUNT(*) AS n FROM _crm_contacts WHERE customer_id=? AND active=1",
        )
        .get(customerId).n,
      sites: db
        .prepare("SELECT COUNT(*) AS n FROM sites WHERE customer_id=?")
        .get(customerId).n,
      equipment: db
        .prepare(
          "SELECT COUNT(*) AS n FROM assets WHERE customer_id=? AND status<>'retired'",
        )
        .get(customerId).n,
      // Open work is anything not finished or cancelled.
      openJobs: db
        .prepare(
          "SELECT COUNT(*) AS n FROM jobs WHERE customer_id=? AND status NOT IN ('completed','cancelled')",
        )
        .get(customerId).n,
    };

    const sites = db
      .prepare(
        "SELECT id,name,address FROM sites WHERE customer_id=? ORDER BY name COLLATE NOCASE",
      )
      .all(customerId)
      .map((s) => ({ id: s.id, name: s.name, address: s.address }));

    const equipment = db
      .prepare(
        "SELECT a.id,a.name,a.serial_number,a.status,s.name AS site_name FROM assets a " +
          "JOIN sites s ON s.id=a.site_id WHERE a.customer_id=? AND a.status<>'retired' " +
          "ORDER BY s.name COLLATE NOCASE,a.name COLLATE NOCASE LIMIT 20",
      )
      .all(customerId)
      .map((a) => ({
        id: a.id,
        name: a.name,
        serialNumber: a.serial_number,
        status: a.status,
        siteName: a.site_name,
      }));

    const recentJobs = db
      .prepare(
        "SELECT j.id,j.identifier,j.status,j.scheduled_date,j.price,t.name AS technician_name,st.name AS service_name " +
          "FROM jobs j LEFT JOIN technicians t ON t.id=j.technician_id " +
          "LEFT JOIN service_types st ON st.id=j.service_type_id " +
          "WHERE j.customer_id=? ORDER BY j.scheduled_date DESC,j.identifier DESC LIMIT 10",
      )
      .all(customerId)
      .map((j) => ({
        id: j.id,
        identifier: j.identifier,
        status: j.status,
        scheduledDate: j.scheduled_date,
        price: j.price,
        technicianName: j.technician_name || "",
        serviceName: j.service_name || "",
      }));

    // Invoices: outstanding balance is the useful number, but only if the table exists.
    let invoices = null;
    if(hasTable("invoices")&&invoiceSummaryInTransaction) {
      invoices=invoiceSummaryInTransaction(customerId);
    } else if (hasTable("invoices")) {
      const totals = db
        .prepare(
          "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status IN ('sent','overdue','paid') THEN CAST(ROUND(total*100) AS INTEGER) ELSE 0 END),0) AS billed, " +
            "COALESCE(SUM(CASE WHEN status IN ('sent','overdue') THEN CAST(ROUND(total*100) AS INTEGER) ELSE 0 END),0) AS outstanding " +
            "FROM invoices WHERE customer_id=?",
        )
        .get(customerId);
      invoices = {
        count: totals.n,
        billed: totals.billed / 100,
        outstanding: totals.outstanding / 100,
        currency: "USD",
      };
    }

    // Sales: open opportunities across pipelines, if the Sales module has ever run.
    let sales = null;
    if(salesSummaryInTransaction){
      sales=salesSummaryInTransaction(user,customerId);
    } else if (hasTable("_sales_opportunities") && hasTable("_sales_stages")) {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS open, COALESCE(SUM(expected_value),0) AS value " +
            "FROM _sales_opportunities o JOIN _sales_stages s ON s.id=o.stage_id WHERE o.customer_id=? AND s.kind='open'",
        )
        .get(customerId);
      sales = {
        openOpportunities: row ? row.open : 0,
        pipelineValue: row ? row.value : 0, // integer cents, as Sales stores it
        currency: "USD",
      };
    }

    // Activity (CRM-004): a bounded projection of open tasks/follow-ups and recent notes.
    let activity = null;
    if (hasTable("_crm_activities")) {
      const open = db
        .prepare(
          "SELECT COUNT(*) AS n FROM _crm_activities WHERE customer_id=? AND status='open'",
        )
        .get(customerId).n;
      const recent = db
        .prepare(
          "SELECT id,kind,visibility,title,status,assignee_id AS assigneeId,due_at AS dueAt,completed_at AS completedAt FROM _crm_activities WHERE customer_id=? ORDER BY COALESCE(due_at,created_at) DESC,id LIMIT 10",
        )
        .all(customerId)
        .map((row) => ({ ...row }));
      activity = { open, recent };
    }

    // Agreements (M5): a bounded projection of this account's native agreement heads.
    let agreements = null;
    if (hasTable("_agreement_drafts")) {
      const count = db
        .prepare(
          "SELECT COUNT(*) AS n FROM _agreement_drafts WHERE customer_id=?",
        )
        .get(customerId).n;
      const recent = db
        .prepare(
          "SELECT id,title,version,archived FROM _agreement_drafts WHERE customer_id=? ORDER BY number DESC LIMIT 10",
        )
        .all(customerId)
        .map((row) => ({ ...row, archived: row.archived === 1 }));
      agreements = { count, recent };
    }

    // Billing parties differ from the owning account when a property manager pays.
    const billingLinks = listBillingLinks(user, customerId);

    return {
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        address: [account.address, account.city, account.state, account.zip]
          .filter(Boolean)
          .join(", "),
        since: account.created_at,
      },
      classification: { ...accountSettings(user, customerId) },
      counts,
      contacts: listContacts(user, customerId),
      contactsByRole: {
        billing: contactsByRole(user, customerId, "billing"),
        service: contactsByRole(user, customerId, "service"),
      },
      billingLinks,
      sites,
      equipment,
      recentJobs,
      invoices,
      sales,
      activity,
      agreements,
    };
  }

  function customer360(user, customerId) {
    requireReader(user);
    db.exec("BEGIN");
    try {
      const result = customer360InSnapshot(user, customerId);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const activities = createCrmActivities({ storage, customer, audit, people, clock });
  const communications = createCrmCommunications({ storage, customer, contact: contactRow, audit });

  // CRM-006 (first slice): read-only duplicate candidates. A candidate is a group of
  // two or more accounts sharing a normalized email, phone or name. Nothing is merged
  // or deleted here; the reviewer decides with the merge policy, which is separate work.
  const normalize = (value) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const normEmail = (value) => value.toLowerCase().trim();
  const normPhone = (value) => value.replace(/\D/g, "");
  function duplicateCandidates(user) {
    requireReader(user);
    const rows = db.prepare("SELECT id,name,email,phone FROM customers ORDER BY name").all();
    const groups = new Map();
    for (const row of rows) {
      const keys = [];
      if (row.email) keys.push(["email", normEmail(row.email)]);
      if (row.phone) keys.push(["phone", normPhone(row.phone)]);
      const name = normalize(row.name);
      if (name) keys.push(["name", name]);
      for (const [kind, key] of keys) {
        const token = `${kind}:${key}`;
        if (!groups.has(token))
          groups.set(token, { kind, match: key, customers: [] });
        groups.get(token).customers.push({ id: row.id, name: row.name, email: row.email, phone: row.phone });
      }
    }
    return [...groups.values()].filter((group) => group.customers.length >= 2);
  }

  // CRM-006: PII-controlled export. Only Owner/Admin may export contact fields; the
  // result is a live read of the native customer/contact rows, never a copied ledger.
  function exportCustomers(user, format = "json") {
    requireReader(user);
    if (!["owner", "admin"].includes(user.role))
      throw new CrmError("Customer export requires Owner or Admin access.", 403);
    const customers = db
      .prepare("SELECT id,name,email,phone,address,city,state,zip,notes FROM customers ORDER BY name COLLATE NOCASE")
      .all()
      .map((c) => {
        const settings = accountSettings(user, c.id);
        const contacts = db
          .prepare("SELECT name,title,email,phone,active FROM _crm_contacts WHERE customer_id=? ORDER BY active DESC,name COLLATE NOCASE")
          .all(c.id)
          .map((row) => ({ ...row, active: row.active === 1 }));
        return { ...c, segment: settings.segment, accountType: settings.accountType, contacts };
      });
    if (format === "csv") {
      const escape = (value) => {
        const s = value == null ? "" : String(value);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const header = ["id", "name", "email", "phone", "address", "city", "state", "zip", "segment", "accountType", "contacts"];
      const lines = [header.join(",")];
      for (const row of customers)
        lines.push([row.id, row.name, row.email, row.phone, row.address, row.city, row.state, row.zip, row.segment, row.accountType, row.contacts.map((c) => c.name).join("; ")].map(escape).join(","));
      return { format: "csv", body: lines.join("\n") };
    }
    return { format: "json", customers };
  }

  return {
    prospects:createCrmProspectHandoff({storage,createContactInTransaction,audit,timeZone}),
    activities,
    communications,
    duplicateCandidates,
    exportCustomers,
    listContacts,
    createContact,
    updateContact,
    archiveContact,
    restoreContact,
    listBillingLinks,
    createBillingLink,
    removeBillingLink,
    accountSettings,
    saveAccountSettings,
    contactsByRole,
    customer360,
  };
}
