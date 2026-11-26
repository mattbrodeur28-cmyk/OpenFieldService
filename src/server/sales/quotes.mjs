import {quoteConversionSchema} from "./quote-conversion-schema.mjs";
import {createQuoteConversion} from "./quote-conversion.mjs";
import {quoteLifecycleSchema} from "./quote-lifecycle-schema.mjs";
import {createQuoteLifecycle} from "./quote-lifecycle.mjs";
import { hasPendingPricing } from "./estimating-domain.mjs";
import { quoteReviewSchema } from "./quote-review-schema.mjs";
import { createQuoteReview } from "./quote-review.mjs";
import { quoteTemplateSchema } from "./quote-template-schema.mjs";
import { createQuoteTemplates, templateReference } from "./quote-templates.mjs";
import { customerQuoteDocument } from "./quote-document.mjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import {
  SalesError,
  parse,
  version,
  date,
  requireWriter,
  requireOwner,
  isSalesAdmin,
} from "./domain.mjs";
import { previewInput } from "./estimating-domain.mjs";
import { quoteSchema } from "./quote-schema.mjs";

const uuid = z.string().uuid();
const documentInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(12000),
    exclusions: z.string().trim().max(10000),
    validUntil: date.refine(Boolean),
  })
  .strict();
const saveInput = z
  .object({
    id: uuid,
    requestKey: uuid,
    expectedVersion: version,
    document: documentInput,
    estimate: previewInput,
    template: templateReference.nullable().optional(),
  })
  .strict()
  .refine(
    (data) => data.document.validUntil >= data.estimate.pricingDate,
    "Quote validity must not precede pricing date.",
  );
const pageInput = z.coerce.number().int().min(1).max(1000000);

/** Draft pricing owns immutable revisions; lifecycle commands own frozen offers and recorded responses. */
export function createQuotes({ storage, sales, pricing, materialSnapshots, clock, jobHandoff }) {
  const db = storage.database;
  migrate(db, "_sales_quote_migrations", [
    { version: 1, sql: quoteSchema },
    { version: 2, sql: quoteTemplateSchema },
    { version: 3, sql: quoteReviewSchema },
    { version: 4, sql: quoteLifecycleSchema },
    { version: 5, sql: quoteConversionSchema },
  ]);
  const templates = createQuoteTemplates({ storage, sales, materialSnapshots });
  const review = createQuoteReview({ storage, sales });
  const lifecycle = createQuoteLifecycle({storage,sales,review,pricing,source:lifecycleSource,documentInTransaction,clock});

  const conversion = createQuoteConversion({storage,sales,source:lifecycleSource,jobHandoff});

  function head(id) {
    parse(uuid, id);
    const row = db.prepare("SELECT * FROM _sales_quotes WHERE id=?").get(id);
    if (!row) throw new SalesError("Quote not found.", 404);
    return row;
  }

  function authorize(user, row) {
    requireOwner(user, sales.opportunity(row.opportunity_id));
  }

  function shape(row, revision = row.version) {
    const saved = db
      .prepare(
        "SELECT * FROM _sales_quote_revisions WHERE quote_id=? AND version=?",
      )
      .get(row.id, revision);
    if (!saved) throw new SalesError("Quote revision not found.", 404);
    const template = db.prepare("SELECT t.template_id AS id,t.template_version AS version,json_extract(r.config_json,'$.name') AS name FROM _sales_quote_revision_templates t JOIN _sales_quote_template_revisions r ON r.template_id=t.template_id AND r.version=t.template_version WHERE t.quote_id=? AND t.quote_version=?").get(row.id,saved.version);
    return {
      id: row.id,
      number: row.number,
      identifier: `Q-${String(row.number).padStart(6, "0")}`,
      opportunityId: row.opportunity_id,
      version: row.version,
      status: row.status,
      revision: saved.version,
      actorId: saved.actor_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      savedAt: saved.created_at,
      template: template ? { ...template } : null,
      document: JSON.parse(saved.document_json),
      estimate: JSON.parse(saved.pricing_json),
    };
  }

  function detail(user, id, query = {}) {
    requireWriter(user);
    const revision =
      query.revision === undefined
        ? undefined
        : parse(pageInput, query.revision);
    const page = parse(pageInput, query.historyPage ?? 1);
    return transaction(db, () => {
      const row = head(id);
      authorize(user, row);
      const history = db
        .prepare(
          "SELECT version,actor_id AS actorId,created_at AS savedAt FROM _sales_quote_revisions WHERE quote_id=? ORDER BY version DESC LIMIT 26 OFFSET ?",
        )
        .all(id, (page - 1) * 25);
      return {
        quote: shape(row, revision),
        history: history.slice(0, 25),
        historyPage: page,
        hasMoreHistory: history.length > 25,
      };
    });
  }

  function lifecycleSource(user,id,revision) {
    requireWriter(user);const row=head(id);authorize(user,row);
    return {head:row,quote:shape(row,revision),opportunity:sales.opportunity(row.opportunity_id)};
  }
  function documentInTransaction(user,id,revision) {
    requireWriter(user);
      const row = head(id);
      authorize(user, row);
      const selectedQuote = shape(row, revision);
      if (hasPendingPricing(selectedQuote.estimate)) throw new SalesError("Complete pending supplier pricing and material links before generating a customer document.",409);
      const opportunity = sales.opportunity(row.opportunity_id);
      const customer = opportunity.customer_id ? db.prepare(
        "SELECT name,address,city,state,zip FROM customers WHERE id=?",
      ).get(opportunity.customer_id) : null;
      const site = opportunity.site_id && opportunity.customer_id ? db.prepare(
        "SELECT name,address FROM sites WHERE id=? AND customer_id=?",
      ).get(opportunity.site_id, opportunity.customer_id) : null;
      const equipment = opportunity.asset_id && opportunity.customer_id ? db.prepare(
        "SELECT name,manufacturer,model,serial_number FROM assets WHERE id=? AND customer_id=? AND (? IS NULL OR site_id=?)",
      ).get(opportunity.asset_id, opportunity.customer_id, opportunity.site_id, opportunity.site_id) : null;
      return customerQuoteDocument(selectedQuote, { opportunity, customer, site, equipment });
  }
  function document(user, id, query = {}) {
    requireWriter(user);
    const revision=query.revision===undefined?undefined:parse(pageInput,query.revision);
    return transaction(db,()=>({document:documentInTransaction(user,id,revision)}));
  }

  function list(user, query = {}) {
    requireWriter(user);
    const page = parse(pageInput, query.page ?? 1);
    const opportunityId =
      query.opportunityId === undefined
        ? null
        : parse(uuid, query.opportunityId);
    return transaction(db, () => {
      if (opportunityId) requireOwner(user, sales.opportunity(opportunityId));
      const admin = isSalesAdmin(user);
      const where = `WHERE ${admin ? "1=1" : "o.owner_id=?"}${opportunityId ? " AND q.opportunity_id=?" : ""}`;
      const args = [
        ...(admin ? [] : [user.id]),
        ...(opportunityId ? [opportunityId] : []),
      ];
      const from =
        "_sales_quotes q JOIN _sales_opportunities o ON o.id=q.opportunity_id";
      const total = db
        .prepare(`SELECT COUNT(*) AS n FROM ${from} ${where}`)
        .get(...args).n;
      const rows = db
        .prepare(
          `SELECT q.*,o.title AS opportunity_title FROM ${from} ${where} ORDER BY q.updated_at DESC,q.id LIMIT 25 OFFSET ?`,
        )
        .all(...args, (page - 1) * 25);
      const quotes = rows.map((row) => {
        const saved = shape(row);
        return {
          id: saved.id,
          identifier: saved.identifier,
          version: saved.version,
          status: saved.status,
          opportunityId: saved.opportunityId,
          opportunityTitle: row.opportunity_title,
          title: saved.document.title,
          validUntil: saved.document.validUntil,
          currency: saved.estimate.currency,
          totalCents: saved.estimate.totalCents,
          pricingComplete: !hasPendingPricing(saved.estimate),
          updatedAt: saved.updatedAt,
        };
      });
      return { quotes, total, page, pageSize: 25 };
    });
  }

  function save(user, input) {
    requireWriter(user);
    const data = parse(saveInput, input);
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    return transaction(db, () => {
      requireOwner(user, sales.opportunity(data.estimate.opportunityId));
      const prior = db
        .prepare("SELECT * FROM _sales_quote_requests WHERE request_key=?")
        .get(data.requestKey);
      if (prior) {
        if (prior.actor_id !== user.id)
          throw new SalesError("This request belongs to another user.", 403);
        if (prior.request_hash !== hash)
          throw new SalesError("This request key has different content.", 409);
        const result = JSON.parse(prior.result_json);
        authorize(user, head(result.quote.id));
        return result;
      }
      const old = db
        .prepare("SELECT * FROM _sales_quotes WHERE id=?")
        .get(data.id);
      if (old) {
        authorize(user, old);
        if (old.opportunity_id !== data.estimate.opportunityId)
          throw new SalesError("A quote cannot change its opportunity.", 409);
        if (old.status !== "draft")
          throw new SalesError("Only internal drafts can be edited.", 409);
      }
      if ((old?.version ?? 0) !== data.expectedVersion)
        throw new SalesError("Quote changed. Reload before saving.", 409);

      const template = templates.referenceInTransaction(user, data.template);
      // Same service database and transaction: evidence cannot drift during save.
      const calculation = pricing.previewInTransaction(user, data.estimate);
      const snapshot = {
        ...calculation,
        persisted: true,
        kind: "internal_draft",
      };
      const next = data.expectedVersion + 1;
      const number =
        old?.number ??
        db
          .prepare("SELECT COALESCE(MAX(number),0)+1 AS n FROM _sales_quotes")
          .get().n;
      if (old) {
        db.prepare(
          "UPDATE _sales_quotes SET version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(next, data.id);
      } else {
        db.prepare(
          "INSERT INTO _sales_quotes(id,number,opportunity_id,version,status) VALUES(?,?,?,?,'draft')",
        ).run(data.id, number, data.estimate.opportunityId, next);
      }
      db.prepare(
        "INSERT INTO _sales_quote_revisions(quote_id,version,actor_id,document_json,pricing_json) VALUES(?,?,?,?,?)",
      ).run(
        data.id,
        next,
        user.id,
        JSON.stringify(data.document),
        JSON.stringify(snapshot),
      );
      const insert = db.prepare(
        "INSERT INTO _sales_quote_revision_lines(quote_id,version,line_id,position,material_id,line_json) VALUES(?,?,?,?,?,?)",
      );
      snapshot.lines.forEach((line, i) => {
        insert.run(
          data.id,
          next,
          line.id,
          i,
          line.materialId,
          JSON.stringify(line),
        );
      });
      if (template) db.prepare("INSERT INTO _sales_quote_revision_templates(quote_id,quote_version,template_id,template_version) VALUES(?,?,?,?)").run(data.id,next,template.id,template.version);
      const result = { quote: shape(head(data.id)) };
      db.prepare(
        "INSERT INTO _sales_quote_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)",
      ).run(data.requestKey, user.id, hash, JSON.stringify(result));
      return result;
    });
  }
  function options(user, query = {}) {
    requireWriter(user);
    const kind = parse(z.enum(["opportunities", "materials"]), query.kind);
    const page = parse(pageInput, query.page ?? 1);
    const search = String(query.search ?? "").slice(0, 200);
    return transaction(db, () => {
      if (kind === "opportunities") {
        const admin = isSalesAdmin(user);
        const where =
          "s.kind='open'" +
          (admin ? "" : " AND o.owner_id=?") +
          " AND instr(lower(o.title || ' ' || COALESCE(c.name,o.prospect_name)),lower(?))>0";
        const args = [...(admin ? [] : [user.id]), search];
        const from =
          "_sales_opportunities o JOIN _sales_stages s ON s.id=o.stage_id LEFT JOIN customers c ON c.id=o.customer_id";
        const total = db
          .prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`)
          .get(...args).n;
        const rows = db
          .prepare(
            `SELECT o.id,o.title,o.version,o.segment,COALESCE(c.name,o.prospect_name) AS customerName FROM ${from} WHERE ${where} ORDER BY o.updated_at DESC,o.id LIMIT 25 OFFSET ?`,
          )
          .all(...args, (page - 1) * 25);
        return { rows, total, page, pageSize: 25 };
      }
      const opportunityId = parse(uuid, query.opportunityId);
      requireOwner(user, sales.opportunity(opportunityId));
      const materialId =
        query.materialId === undefined ? null : parse(uuid, query.materialId);
      const where =
        "instr(lower(name || ' ' || unit),lower(?))>0" +
        (materialId ? " AND id=?" : "");
      const args = [search, ...(materialId ? [materialId] : [])];
      const total = db
        .prepare(`SELECT COUNT(*) AS n FROM materials WHERE ${where}`)
        .get(...args).n;
      const rows = db
        .prepare(
          `SELECT id FROM materials WHERE ${where} ORDER BY name,id LIMIT 25 OFFSET ?`,
        )
        .all(...args, (page - 1) * 25);
      if (!materialSnapshots)
        throw new SalesError("Material pricing is not configured.", 503);
      return {
        rows: materialSnapshots(rows.map((row) => row.id)),
        total,
        page,
        pageSize: 25,
      };
    });
  }
  return { list, detail, save, options, document, templates, review, lifecycle, conversion };
}
