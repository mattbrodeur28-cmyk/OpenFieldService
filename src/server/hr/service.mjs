import { createHash } from 'node:crypto';
import { createStaffRepository } from './repository.mjs';
import { peopleManager, parse, uuid, staffCommand, listQuery, optionsQuery, historyQuery, fail } from './domain.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createStaff({ storage }) {
    const repo = createStaffRepository(storage);
    function detail(user, id) { peopleManager(user); parse(uuid, id); return repo.within(() => { const staff = repo.detail(id); if (!staff)
        fail('Staff member not found.', 404); return { staff }; }); }
    function list(user, raw = {}) { peopleManager(user); const q = parse(listQuery, raw); return repo.within(() => repo.list(q)); }
    function options(user, raw = {}) { peopleManager(user); const q = parse(optionsQuery, raw); return repo.within(() => repo.options(q.search)); }
    function save(user, raw) {
        peopleManager(user);
        const d = parse(staffCommand, raw), hash = digest(d);
        return repo.within(() => {
            const prior = repo.prior(d.requestKey);
            if (prior) {
                if (prior.actor_id !== user.id)
                    fail('This request belongs to another account.', 403);
                if (prior.request_hash !== hash)
                    fail('This request key has different content.', 409);
                return JSON.parse(prior.result_json);
            }
            const before = repo.detail(d.id);
            if ((before?.version ?? 0) !== d.expectedVersion)
                fail('Staff profile changed. Reload before saving.', 409);
            if (d.expectedVersion === Number.MAX_SAFE_INTEGER)
                fail('Staff profile version needs administrator review.', 409);
            if (d.supervisorId) {
                const seen = new Set([d.id]);
                let cursor = d.supervisorId, depth = 0;
                while (cursor) {
                    if (seen.has(cursor))
                        fail('Supervisor relationships cannot contain a loop.', 409);
                    if (++depth > 1000)
                        fail('Supervisor hierarchy exceeds the supported review depth.', 422);
                    seen.add(cursor);
                    const supervisor = repo.detail(cursor);
                    if (!supervisor)
                        fail('Supervisor is unavailable.', 409);
                    if (cursor === d.supervisorId && supervisor.employment_status !== 'active')
                        fail('Choose an active supervisor.', 409);
                    cursor = supervisor.supervisor_id;
                }
            }
            const nextActive = d.technician && d.employmentStatus === 'active';
            if (before?.technician_active && !nextActive && before.open_jobs > 0 && !d.acknowledgeOpenWork)
                fail('This technician still has open jobs. Review them and acknowledge retained assignments before disabling field availability.', 409);
            let techId = before?.technician_id ?? null;
            if (d.technician && !techId) {
                repo.createTechnician(d);
                techId = d.id;
            }
            repo.save(d, techId, d.expectedVersion + 1);
            const staff = repo.detail(d.id);
            repo.audit(user, d.id, before ? 'staff_updated' : 'staff_created', before, staff, d.reason);
            const result = { staff, accountChanged: false, assignmentsChanged: false };
            repo.acknowledge(d.requestKey, user, hash, result);
            return result;
        });
    }
    function history(user, id, raw = {}) { peopleManager(user); parse(uuid, id); const { page } = parse(historyQuery, raw); return repo.within(() => { if (!repo.detail(id))
        fail('Staff member not found.', 404); const rows = repo.history(id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    return { detail, list, options, save, history };
}
