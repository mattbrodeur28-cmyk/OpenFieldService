import { randomUUID } from "node:crypto";
import { transaction } from "../platform/sqlite.mjs";
import { installSales, projection, audit } from "./storage.mjs";
import {
  SalesError,
  isSalesAdmin,
  requireWriter,
  requireOwner,
  parse,
  pipelineInput,
  validatePipeline,
  opportunityInput,
  moveInput,
  noteInput,
  checkStage,
  inputRecord,
  date,
} from "./domain.mjs";

// Synchronous application service, independent of HTTP. Identity lookups expose names/IDs only.
export function createSalesService({ storage, owners = () => [] }) {
  const db = storage.database;
  installSales(db);
  const pipeline = (id) => {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
      throw new SalesError("Choose a valid pipeline.");
    const row = db.prepare("SELECT * FROM _sales_pipelines WHERE id=?").get(id);
    if (!row) throw new SalesError("Pipeline not found.", 404);
    return {
      ...row,
      stages: db
        .prepare(
          "SELECT * FROM _sales_stages WHERE pipeline_id=? AND active=1 ORDER BY position",
        )
        .all(id)
        .map((stage) => ({
          ...stage,
          requiredFields: JSON.parse(stage.required_fields),
          allowedFrom: JSON.parse(stage.allowed_from),
        })),
    };
  };
  const opportunity = (id) => {
    const row = db.prepare(projection + " WHERE o.id=?").get(id);
    if (!row) throw new SalesError("Opportunity not found.", 404);
    return row;
  };
  const stage = (id, pipelineId) => {
    const row = db
      .prepare(
        "SELECT * FROM _sales_stages WHERE id=? AND pipeline_id=? AND active=1",
      )
      .get(id, pipelineId);
    if (!row) throw new SalesError("Choose an active stage in this pipeline.");
    return row;
  };
  const expected = (row, version) => {
    if (version !== row.version)
      throw new SalesError(
        "This record changed in another session. Close and reopen it before saving.",
        409,
      );
  };
  function savePipeline(user, id, input) {
    if (!isSalesAdmin(user))
      throw new SalesError("Owner or administrator access required.", 403);
    const data = parse(pipelineInput, input);
    validatePipeline(data);
    return transaction(db, () => {
      const old = id ? pipeline(id) : null;
      if (old) expected(old, data.expectedVersion);
      if (
        !old &&
        db.prepare("SELECT COUNT(*) AS n FROM _sales_pipelines").get().n >= 20
      )
        throw new SalesError(
          "At most 20 pipelines are supported in this release.",
          409,
        );
      const pipelineId = id || randomUUID(),
        oldIds = new Set(old?.stages.map((s) => s.id) || []),
        usedIds = new Set(),
        stages = data.stages.map((s, index) => ({
          ...s,
          id: s.id || randomUUID(),
          position: index,
        }));
      for (const s of stages) {
        if (usedIds.has(s.id))
          throw new SalesError("Stage IDs must be unique.");
        usedIds.add(s.id);
        if (
          s.id &&
          db
            .prepare("SELECT pipeline_id FROM _sales_stages WHERE id=?")
            .get(s.id)?.pipeline_id &&
          !oldIds.has(s.id)
        )
          throw new SalesError(
            "A stage belongs to another or archived pipeline.",
          );
      }
      for (const s of stages) {
        if (
          s.allowedFrom.some(
            (source) => !usedIds.has(source) || source === s.id,
          )
        )
          throw new SalesError(
            "Allowed source stages must be other active stages in this pipeline.",
          );
      }
      if (old) {
        for (const s of old.stages) {
          if (
            !usedIds.has(s.id) &&
            db
              .prepare("SELECT 1 FROM _sales_opportunities WHERE stage_id=?")
              .get(s.id)
          )
            throw new SalesError(
              "Move opportunities before removing their stage.",
              409,
            );
          const updated = stages.find((item) => item.id === s.id);
          if (
            updated &&
            updated.kind !== s.kind &&
            db
              .prepare("SELECT 1 FROM _sales_opportunities WHERE stage_id=?")
              .get(s.id)
          )
            throw new SalesError(
              "An occupied stage cannot change its open/won/lost meaning.",
              409,
            );
        }
      }
      if (old)
        db.prepare(
          "UPDATE _sales_pipelines SET name=?,version=version+1 WHERE id=?",
        ).run(data.name, pipelineId);
      else
        db.prepare("INSERT INTO _sales_pipelines(id,name) VALUES(?,?)").run(
          pipelineId,
          data.name,
        );
      db.prepare("UPDATE _sales_stages SET active=0 WHERE pipeline_id=?").run(
        pipelineId,
      );
      for (const s of stages)
        db.prepare(
          "INSERT INTO _sales_stages(id,pipeline_id,name,kind,position,probability,required_fields,allowed_from) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,position=excluded.position,probability=excluded.probability,required_fields=excluded.required_fields,allowed_from=excluded.allowed_from,active=1",
        ).run(
          s.id,
          pipelineId,
          s.name,
          s.kind,
          s.position,
          s.probability,
          JSON.stringify(s.requiredFields),
          JSON.stringify(s.allowedFrom),
        );
      const result = pipeline(pipelineId);
      audit(
        db,
        user,
        "pipeline",
        pipelineId,
        old ? "configure" : "create",
        old,
        result,
      );
      return result;
    });
  }
  function validateRelations(data) {
    if (!owners().some((owner) => owner.id === data.ownerId))
      throw new SalesError("Choose an active Sales owner.");
    if (
      data.customerId &&
      !db.prepare("SELECT 1 FROM customers WHERE id=?").get(data.customerId)
    )
      throw new SalesError("Customer not found.");
    if (
      data.siteId &&
      !db
        .prepare("SELECT 1 FROM sites WHERE id=? AND customer_id=?")
        .get(data.siteId, data.customerId)
    )
      throw new SalesError("Site must belong to the customer.");
    if (data.assetId) {
      const asset = db
        .prepare("SELECT customer_id,site_id FROM assets WHERE id=?")
        .get(data.assetId);
      if (
        !asset ||
        asset.customer_id !== data.customerId ||
        (data.siteId && asset.site_id !== data.siteId)
      )
        throw new SalesError(
          "Equipment must belong to the chosen customer and site.",
        );
    }
  }
  function saveOpportunity(user, id, input) {
    requireWriter(user);
    const data = parse(opportunityInput, input);
    return transaction(db, () => {
      const old = id ? opportunity(id) : null;
      if (old) {
        requireOwner(user, old);
        expected(old, data.expectedVersion);
        if (old.stage_kind !== "open")
          throw new SalesError(
            "Closed opportunities must be reopened before editing.",
            409,
          );
        if (
          data.pipelineId !== old.pipeline_id ||
          data.stageId !== old.stage_id
        )
          throw new SalesError(
            "Use Move stage to change a stage. Pipeline changes are not supported.",
            409,
          );
      }
      if (!isSalesAdmin(user) && data.ownerId !== user.id)
        throw new SalesError(
          "Members can create and edit their own opportunities only.",
          403,
        );
      validateRelations(data);
      const target = stage(data.stageId, data.pipelineId);
      if (!old && target.kind !== "open")
        throw new SalesError("Create an opportunity in an open stage.");
      checkStage(target, data);
      const columns = [
        "title",
        "pipeline_id",
        "stage_id",
        "owner_id",
        "prospect_name",
        "contact_name",
        "contact_email",
        "contact_phone",
        "segment",
        "source",
        "expected_value",
        "probability",
        "expected_close_date",
        "next_action",
        "next_action_date",
        "customer_id",
        "site_id",
        "asset_id",
        "notes",
      ];
      const values = [
        data.title,
        data.pipelineId,
        data.stageId,
        data.ownerId,
        data.prospectName,
        data.contactName,
        data.contactEmail,
        data.contactPhone,
        data.segment,
        data.source,
        data.expectedValue,
        data.probability,
        data.expectedCloseDate,
        data.nextAction,
        data.nextActionDate,
        data.customerId,
        data.siteId,
        data.assetId,
        data.notes,
      ];
      const opportunityId = id || randomUUID();
      if (old)
        db.prepare(
          "UPDATE _sales_opportunities SET " +
            columns.map((c) => c + "=?").join(",") +
            ",version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
        ).run(...values, opportunityId, data.expectedVersion);
      else
        db.prepare(
          "INSERT INTO _sales_opportunities(id," +
            columns.join(",") +
            ") VALUES(" +
            Array(columns.length + 1)
              .fill("?")
              .join(",") +
            ")",
        ).run(opportunityId, ...values);
      const result = opportunity(opportunityId);
      audit(
        db,
        user,
        "opportunity",
        opportunityId,
        old ? "update" : "create",
        old,
        result,
      );
      return result;
    });
  }
  function move(user, id, input) {
    const data = parse(moveInput, input);
    return transaction(db, () => {
      const old = opportunity(id);
      requireOwner(user, old);
      expected(old, data.expectedVersion);
      const target = stage(data.stageId, old.pipeline_id);
      if (target.id === old.stage_id) return old;
      if (old.stage_kind === "won")
        throw new SalesError(
          "Converted opportunities cannot be reopened through stage moves.",
          409,
        );
      if (
        old.stage_kind === "lost" &&
        (!isSalesAdmin(user) || data.reason.length < 3)
      )
        throw new SalesError(
          "An administrator and a reason are required to reopen lost work.",
          403,
        );
      const allowed = JSON.parse(target.allowed_from);
      if (allowed.length && !allowed.includes(old.stage_id))
        throw new SalesError(
          "This transition is not allowed by the pipeline configuration.",
          409,
        );
      checkStage(target, inputRecord(old));
      if (target.kind === "lost" && data.reason.length < 3)
        throw new SalesError("Enter a loss reason of at least 3 characters.");
      db.prepare(
        "UPDATE _sales_opportunities SET stage_id=?,probability=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
      ).run(target.id, target.probability, id, data.expectedVersion);
      const result = opportunity(id);
      audit(
        db,
        user,
        "opportunity",
        id,
        old.stage_kind === "lost" ? "reopen" : "move",
        old,
        result,
        data.reason,
      );
      return result;
    });
  }
  function note(user, id, input) {
    const data = parse(noteInput, input);
    return transaction(db, () => {
      const old = opportunity(id);
      requireOwner(user, old);
      expected(old, data.expectedVersion);
      const noteId = randomUUID();
      db.prepare(
        "INSERT INTO _sales_notes(id,opportunity_id,actor_id,content) VALUES(?,?,?,?)",
      ).run(noteId, id, user.id, data.content);
      db.prepare(
        "UPDATE _sales_opportunities SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(id);
      audit(db, user, "opportunity", id, "note", null, { noteId });
      return opportunity(id);
    });
  }
  function list(query = {}) {
    const page = Number(query.page || 1);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !["all", "open", "lost"].includes(query.status || "open")
    )
      throw new SalesError("Invalid page or status.");
    const where = ["o.pipeline_id=?"],
      params = [query.pipelineId];
    pipeline(query.pipelineId);
    if (query.ownerId) {
      where.push("o.owner_id=?");
      params.push(query.ownerId);
    }
    if ((query.status || "open") !== "all") {
      where.push("s.kind=?");
      params.push(query.status || "open");
    }
    if (query.search) {
      where.push(
        "instr(lower(o.title||' '||o.prospect_name||' '||COALESCE(c.name,'')||' '||o.contact_name||' '||o.next_action),lower(?))>0",
      );
      params.push(String(query.search).slice(0, 200));
    }
    for (const [key, operator] of [
      ["closeFrom", ">="],
      ["closeTo", "<="],
    ])
      if (query[key]) {
        parse(date, query[key]);
        where.push(
          `o.expected_close_date<>'' AND o.expected_close_date${operator}?`,
        );
        params.push(query[key]);
      }
    for (const [key, operator] of [
      ["minValue", ">="],
      ["maxValue", "<="],
    ])
      if (query[key] !== undefined && query[key] !== "") {
        const value = Number(query[key]);
        if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
          throw new SalesError(
            "Value filters must use nonnegative whole cents, up to $10,000,000.",
          );
        where.push(`o.expected_value${operator}?`);
        params.push(value);
      }
    if (
      query.minValue !== undefined &&
      query.maxValue !== undefined &&
      Number(query.minValue) > Number(query.maxValue)
    )
      throw new SalesError("Value range is reversed.");
    if (query.closeFrom && query.closeTo && query.closeFrom > query.closeTo)
      throw new SalesError("Close-date range is reversed.");
    return transaction(db, () => {
      const base = projection + " WHERE " + where.join(" AND "),
        total = db
          .prepare("SELECT COUNT(*) AS n FROM (" + base + ")")
          .get(...params).n;
      const rows = db
        .prepare(base + " ORDER BY o.updated_at DESC,o.id LIMIT 50 OFFSET ?")
        .all(...params, (page - 1) * 50);
      const totals = db
        .prepare(
          "SELECT stage_id,COUNT(*) AS count,SUM(expected_value) AS value,SUM(expected_value*probability) AS weightedHundredths FROM (" +
            base +
            ") GROUP BY stage_id",
        )
        .all(...params);
      return {
        pipelineId: query.pipelineId,
        opportunities: rows,
        total,
        page,
        pageSize: 50,
        totals,
        currency: "USD",
      };
    });
  }
  function detail(id) {
    return transaction(db, () => ({
      opportunity: opportunity(id),
      activity: db
        .prepare(
          "SELECT id,actor_id,action,reason,created_at,before_json,after_json FROM _sales_audit WHERE entity_type='opportunity' AND entity_id=? ORDER BY id DESC LIMIT 100",
        )
        .all(id),
      notes: db
        .prepare(
          "SELECT * FROM _sales_notes WHERE opportunity_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
        )
        .all(id),
    }));
  }
  function options(query = {}) {
    const search = String(query.search || "").slice(0, 200);
    return {
      owners: owners(),
      customers: db
        .prepare(
          "SELECT id,name FROM customers WHERE instr(lower(name),lower(?))>0 ORDER BY name LIMIT 100",
        )
        .all(search),
      sites: query.customerId
        ? db
            .prepare(
              "SELECT id,name FROM sites WHERE customer_id=? ORDER BY name LIMIT 100",
            )
            .all(query.customerId)
        : [],
      assets: query.customerId
        ? db
            .prepare(
              "SELECT id,name,site_id FROM assets WHERE customer_id=? ORDER BY name LIMIT 100",
            )
            .all(query.customerId)
        : [],
    };
  }
  function bootstrap() {
    if (db.prepare("SELECT 1 FROM _sales_pipelines").get()) return;
    savePipeline({ id: "system", role: "owner", active: true }, null, {
      name: "Service Sales",
      stages: [
        ["New", 10],
        ["Qualified", 25],
        ["Site visit", 40],
        ["Estimating", 55],
        ["Proposal sent", 70],
        ["Negotiation", 85],
        ["Won", 100],
        ["Lost", 0],
      ].map(([name, probability]) => ({
        name,
        probability,
        kind: name === "Won" ? "won" : name === "Lost" ? "lost" : "open",
        requiredFields: [],
        allowedFrom: [],
      })),
    });
  }
  bootstrap();
  function customerContext(customerId, pageValue = 1) {
    const page = Number(pageValue);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      throw new SalesError("Choose a valid customer activity page.");
    return transaction(db, () => {
      if (!db.prepare("SELECT id FROM customers WHERE id=?").get(customerId))
        throw new SalesError("Customer not found.", 404);
      const opportunities = db
        .prepare(
          projection +
            " WHERE o.customer_id=? ORDER BY o.updated_at DESC,o.id LIMIT 25 OFFSET ?",
        )
        .all(customerId, (page - 1) * 25);
      const total = db
        .prepare(
          "SELECT COUNT(*) AS n FROM _sales_opportunities WHERE customer_id=?",
        )
        .get(customerId).n;
      const openActivities = db
        .prepare(
          "SELECT COUNT(*) AS n FROM _sales_activities a JOIN _sales_opportunities o ON o.id=a.opportunity_id WHERE o.customer_id=? AND a.status='open'",
        )
        .get(customerId).n;
      return {
        customerId,
        opportunities,
        total,
        openActivities,
        page,
        pageSize: 25,
      };
    });
  }
  return {
    customerContext,
    opportunity,
    pipelines: () =>
      db
        .prepare("SELECT id FROM _sales_pipelines ORDER BY created_at,id")
        .all()
        .map((row) => pipeline(row.id)),
    pipeline,
    savePipeline,
    saveOpportunity,
    move,
    note,
    list,
    detail,
    options,
  };
}
