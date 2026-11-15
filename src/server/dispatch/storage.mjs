import { installServiceWork } from "../service/work.mjs";
import { migrate } from "../platform/sqlite.mjs";
import { hoursMigration } from "./hours.mjs";
const minutes = (alias) =>
  `(CAST(substr(${alias}.scheduled_time,1,2) AS INTEGER)*60+CAST(substr(${alias}.scheduled_time,4,2) AS INTEGER))`;
const signature = `(NEW.technician_id || '|' || NEW.scheduled_date || '|' || NEW.scheduled_time || '|' || NEW.duration)`;
const overridden = `(SELECT override_signature FROM _dispatch_job_state WHERE job_id=NEW.id)=${signature}`;
const managed = `(SELECT managed FROM _dispatch_job_state WHERE job_id=NEW.id)=1`;
const active = `NEW.status IN ('scheduled','confirmed','in_progress') AND NEW.technician_id IS NOT NULL`;
const overlaps = `SELECT 1 FROM jobs other JOIN _dispatch_job_state peer ON peer.job_id=other.id WHERE other.id<>NEW.id AND other.technician_id=NEW.technician_id AND other.scheduled_date=NEW.scheduled_date AND other.status IN ('scheduled','confirmed','in_progress') AND ${minutes("other")}<${minutes("NEW")}+NEW.duration AND ${minutes("other")}+other.duration>${minutes("NEW")} AND (${managed} OR peer.managed=1)`;
const migration = `
CREATE TABLE _dispatch_job_state(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,version INTEGER NOT NULL DEFAULT 0,managed INTEGER NOT NULL DEFAULT 0,override_signature TEXT NOT NULL DEFAULT '');
INSERT INTO _dispatch_job_state(job_id) SELECT id FROM jobs;
CREATE TABLE _dispatch_profiles(technician_id TEXT PRIMARY KEY REFERENCES technicians(id) ON DELETE CASCADE,dispatch_team TEXT NOT NULL DEFAULT '',territory TEXT NOT NULL DEFAULT '',skills TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE _dispatch_availability(technician_id TEXT REFERENCES technicians(id) ON DELETE CASCADE,date TEXT NOT NULL,available INTEGER NOT NULL,start_minute INTEGER NOT NULL,end_minute INTEGER NOT NULL,PRIMARY KEY(technician_id,date));
CREATE TABLE _dispatch_events(id INTEGER PRIMARY KEY AUTOINCREMENT,entity_id TEXT,kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _dispatch_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,job_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _dispatch_events_entity ON _dispatch_events(entity_id,id);
CREATE INDEX _dispatch_schedule_lookup ON jobs(technician_id,scheduled_date,status);
CREATE TRIGGER _dispatch_insert AFTER INSERT ON jobs BEGIN
 INSERT INTO _dispatch_job_state(job_id) VALUES(NEW.id);
 INSERT INTO _dispatch_events(entity_id,kind) VALUES(NEW.id,'job');
END;
CREATE TRIGGER _dispatch_update AFTER UPDATE ON jobs BEGIN
 UPDATE _dispatch_job_state SET version=version+1 WHERE job_id=NEW.id;
 INSERT INTO _dispatch_events(entity_id,kind) VALUES(NEW.id,'job');
END;
CREATE TRIGGER _dispatch_delete AFTER DELETE ON jobs BEGIN INSERT INTO _dispatch_events(entity_id,kind) VALUES(OLD.id,'deleted'); END;
CREATE TRIGGER _dispatch_technician_update AFTER UPDATE ON technicians BEGIN INSERT INTO _dispatch_events(entity_id,kind) VALUES(NEW.id,'resource'); END;
CREATE TRIGGER _dispatch_technician_insert AFTER INSERT ON technicians BEGIN INSERT INTO _dispatch_events(entity_id,kind) VALUES(NEW.id,'resource'); END;
CREATE TRIGGER _dispatch_technician_delete AFTER DELETE ON technicians BEGIN INSERT INTO _dispatch_events(entity_id,kind) VALUES(OLD.id,'resource'); END;
CREATE TRIGGER _dispatch_protect_update BEFORE UPDATE OF technician_id,scheduled_date,scheduled_time,duration,status ON jobs BEGIN
 SELECT CASE WHEN ${managed} AND OLD.status IN ('completed','cancelled') AND (NEW.status<>OLD.status OR NEW.technician_id IS NOT OLD.technician_id OR NEW.scheduled_date<>OLD.scheduled_date OR NEW.scheduled_time<>OLD.scheduled_time OR NEW.duration<>OLD.duration) THEN RAISE(ABORT,'DISPATCH_CLOSED') END;
 SELECT CASE WHEN ${managed} AND NEW.status NOT IN ('scheduled','confirmed','in_progress','completed','cancelled') THEN RAISE(ABORT,'DISPATCH_INVALID') END;
 SELECT CASE WHEN ${managed} AND ${active} AND NOT EXISTS(SELECT 1 FROM technicians WHERE id=NEW.technician_id AND active=1) THEN RAISE(ABORT,'DISPATCH_INACTIVE') END;
 SELECT CASE WHEN ${managed} AND ${active} AND (NEW.duration<15 OR NEW.duration>1440 OR ${minutes("NEW")}+NEW.duration>1440) THEN RAISE(ABORT,'DISPATCH_INVALID') END;
 SELECT CASE WHEN ${managed} AND ${active} AND NOT (${overridden}) AND EXISTS(SELECT 1 FROM _dispatch_availability a WHERE a.technician_id=NEW.technician_id AND a.date=NEW.scheduled_date AND (a.available=0 OR ${minutes("NEW")}<a.start_minute OR ${minutes("NEW")}+NEW.duration>a.end_minute)) THEN RAISE(ABORT,'DISPATCH_AVAILABILITY') END;
 SELECT CASE WHEN ${active} AND NOT COALESCE(${overridden},0) AND EXISTS(${overlaps}) THEN RAISE(ABORT,'DISPATCH_OVERLAP') END;
END;
CREATE TRIGGER _dispatch_protect_insert BEFORE INSERT ON jobs WHEN ${active} BEGIN
 SELECT CASE WHEN EXISTS(${overlaps}) THEN RAISE(ABORT,'DISPATCH_OVERLAP') END;
END;
`;

/** One serialized, checksummed module migration. Never rebuild or reset populated job tables. */
export function installDispatch(db) {
  installServiceWork(db);
  migrate(db, "_dispatch_schema_migrations", [
    { version: 1, sql: migration },
    { version: 2, sql: hoursMigration },
    {
      version: 3,
      sql: `
INSERT INTO _service_work(job_id,category,updated_by) SELECT job_id,'on_demand','migration' FROM _dispatch_job_state WHERE is_emergency=1;
CREATE TRIGGER _dispatch_work_category_insert AFTER INSERT ON _service_work BEGIN
 UPDATE _dispatch_job_state SET is_emergency=(NEW.category='on_demand') WHERE job_id=NEW.job_id;
 UPDATE jobs SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.job_id;
END;
CREATE TRIGGER _dispatch_work_category_update AFTER UPDATE OF category ON _service_work BEGIN
 UPDATE _dispatch_job_state SET is_emergency=(NEW.category='on_demand') WHERE job_id=NEW.job_id;
 UPDATE jobs SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.job_id;
END;
`,
    },
  ]);
}
export { transaction } from "../platform/sqlite.mjs";
export function dispatchError(error) {
  const messages = {
    DISPATCH_SERVICE_HOURS:
      "Outside company service hours. Use an emergency designation and an Owner/Admin override with a reason, or choose an allowed time.",
    DISPATCH_OVERLAP: "This technician already has overlapping work.",
    DISPATCH_AVAILABILITY:
      "This assignment is outside the technician’s declared availability.",
    DISPATCH_CLOSED: "Completed or cancelled jobs cannot be rescheduled.",
    DISPATCH_INACTIVE: "Choose an active technician.",
    DISPATCH_INVALID: "Choose a valid duration within one calendar day.",
  };
  return Object.entries(messages).find(([code]) =>
    String(error?.message).includes(code),
  )?.[1];
}
