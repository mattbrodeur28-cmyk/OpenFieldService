import { createHash } from "node:crypto";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { SalesError, isSalesAdmin, requireOwner, parse } from "./domain.mjs";
import {
  saveProfileInput,
  previewInput,
  calculateEstimate,
  reviewableProfile,
} from "./estimating-domain.mjs";
const sql = `
CREATE TABLE _sales_billing_profiles(id TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>0),config_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_billing_profile_revisions(profile_id TEXT NOT NULL REFERENCES _sales_billing_profiles(id) ON DELETE RESTRICT,version INTEGER NOT NULL,actor_id TEXT NOT NULL,config_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(profile_id,version));
CREATE TABLE _sales_billing_profile_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER _sales_billing_profile_revisions_update BEFORE UPDATE ON _sales_billing_profile_revisions BEGIN SELECT RAISE(ABORT,'BILLING_PROFILE_IMMUTABLE'); END;
CREATE TRIGGER _sales_billing_profile_revisions_delete BEFORE DELETE ON _sales_billing_profile_revisions BEGIN SELECT RAISE(ABORT,'BILLING_PROFILE_IMMUTABLE'); END;
CREATE TRIGGER _sales_billing_profile_requests_update BEFORE UPDATE ON _sales_billing_profile_requests BEGIN SELECT RAISE(ABORT,'BILLING_PROFILE_IMMUTABLE'); END;
CREATE TRIGGER _sales_billing_profile_requests_delete BEFORE DELETE ON _sales_billing_profile_requests BEGIN SELECT RAISE(ABORT,'BILLING_PROFILE_IMMUTABLE'); END;
`;
export function createBillingProfiles({
  storage,
  sales,
  materialSnapshots = () => {
    throw new SalesError("Material pricing is not configured.", 503);
  },
}) {
  const db = storage.database;
  migrate(db, "_sales_billing_profile_migrations", [{ version: 1, sql }]);
  const admin = (user) => {
    if (!isSalesAdmin(user))
      throw new SalesError("Only Owners/Admins manage billing profiles.", 403);
  };
  const profile = (id) => {
    const row = db
      .prepare("SELECT * FROM _sales_billing_profiles WHERE id=?")
      .get(id);
    if (!row) throw new SalesError("Billing profile not found.", 404);
    return {
      id: row.id,
      version: row.version,
      ...reviewableProfile(JSON.parse(row.config_json)),
      updatedAt: row.updated_at,
    };
  };
  function requirePricingAccess(user) {
    // Internal pricing rules include review notes; restrict to active Sales writers.
    if (
      !user?.active ||
      user.mustChangePassword ||
      !["owner", "admin", "member"].includes(user.role)
    )
      throw new SalesError("Sales writer access required.", 403);
  }
  function list(user, query = {}) {
    requirePricingAccess(user);
    const page = Number(query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new SalesError("Choose a valid profile page.");
    const search = String(query.search ?? "").slice(0, 200);
    const segment = query.segment;
    if (
      segment !== undefined &&
      !["commercial", "residential"].includes(segment)
    )
      throw new SalesError("Choose a valid work segment.");
    const rows = db
      .prepare(
        "SELECT id FROM _sales_billing_profiles WHERE instr(lower(json_extract(config_json,'$.name') || ' ' || json_extract(config_json,'$.state') || ' ' || json_extract(config_json,'$.jurisdiction')),lower(?))>0" +
          (segment ? " AND json_extract(config_json,'$.segment')=?" : "") +
          " ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?",
      )
      .all(search, ...(segment ? [segment] : []), (page - 1) * 50);
    return {
      profiles: rows.slice(0, 50).map((r) => profile(r.id)),
      page,
      hasMore: rows.length > 50,
    };
  }
  function save(user, input) {
    admin(user);
    const data = parse(saveProfileInput, input),
      hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    return transaction(db, () => {
      const replay = db
        .prepare(
          "SELECT * FROM _sales_billing_profile_requests WHERE request_key=?",
        )
        .get(data.requestKey);
      if (replay) {
        if (replay.actor_id !== user.id)
          throw new SalesError("This request belongs to another user.", 403);
        if (replay.request_hash !== hash)
          throw new SalesError("This request key has different content.", 409);
        return JSON.parse(replay.result_json);
      }
      const old = db
        .prepare("SELECT version FROM _sales_billing_profiles WHERE id=?")
        .get(data.id);
      if ((old?.version ?? 0) !== data.expectedVersion)
        throw new SalesError(
          "Billing profile changed. Reload before saving.",
          409,
        );
      const next = data.expectedVersion + 1,
        json = JSON.stringify(data.config);
      db.prepare(
        "INSERT INTO _sales_billing_profiles(id,version,config_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,config_json=excluded.config_json,updated_at=CURRENT_TIMESTAMP",
      ).run(data.id, next, json);
      db.prepare(
        "INSERT INTO _sales_billing_profile_revisions(profile_id,version,actor_id,config_json) VALUES(?,?,?,?)",
      ).run(data.id, next, user.id, json);
      const result = { profile: profile(data.id) };
      db.prepare(
        "INSERT INTO _sales_billing_profile_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)",
      ).run(data.requestKey, user.id, hash, JSON.stringify(result));
      return result;
    });
  }
  // Synchronous narrow contract: caller owns the service database transaction.
  function previewInTransaction(user, input) {
    const data = parse(previewInput, input);
    const opportunity = sales.opportunity(data.opportunityId);
    requireOwner(user, opportunity);
    if (opportunity.version !== data.expectedOpportunityVersion)
      throw new SalesError(
        "Opportunity changed. Reload before estimating.",
        409,
      );
    if (opportunity.stage_kind !== "open")
      throw new SalesError("Reopen the opportunity before estimating.", 409);
    const selected = profile(data.profileId),
      config = selected.config;
    if (selected.requiresReview)
      throw new SalesError(
        "Review current billing tax categories in Settings before estimating.",
        409,
      );
    if (selected.version !== data.expectedProfileVersion)
      throw new SalesError(
        "Billing profile changed. Review the new version.",
        409,
      );
    if (
      !config.active ||
      config.segment !== opportunity.segment ||
      data.pricingDate < config.effectiveFrom ||
      (config.effectiveTo && data.pricingDate > config.effectiveTo)
    )
      throw new SalesError(
        "Choose an active profile matching the work segment and pricing date.",
        409,
      );
    const materials = data.lines.filter((l) => l.materialId),
      snapshots = materials.length
        ? materialSnapshots([...new Set(materials.map((l) => l.materialId))])
        : [];
    for (const line of materials) {
      const snapshot = snapshots.find((s) => s.id === line.materialId);
      if (!snapshot)
        throw new SalesError("A material is no longer available.", 409);
      if (
        (snapshot.unitCostCents === null ||
          snapshot.unitCostCents !== line.unitCostCents) &&
        line.costOverrideReason.length < 10
      )
        throw new SalesError(
          "Review a material cost override with a reason of at least 10 characters.",
          409,
        );
    }
    return {
      ...calculateEstimate(data.lines, config),
      profileId: selected.id,
      profileVersion: selected.version,
      pricingDate: data.pricingDate,
      opportunityId: opportunity.id,
      opportunityVersion: opportunity.version,
      materialSnapshots: snapshots,
      persisted: false,
    };
  }
  function preview(user, input) {
    return transaction(db, () => previewInTransaction(user, input));
  }
  function get(user, id) {
    requirePricingAccess(user);
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new SalesError("Choose a valid billing profile.");
    return { profile: profile(id) };
  }
  return { list, get, save, preview, previewInTransaction };
}
