import { z } from 'zod';
import { parse, writer, reader, fail } from './domain.mjs';

// Company labor cost rate (cents per hour) used by agreement profitability. A single
// reviewed rate covers all field labor; per-role rates are a separate future policy.
export function createAgreementLabor({ db }) {
    const input = z.object({
        expectedVersion: z.number().int().nonnegative().safe(),
        rateCentsPerHour: z.number().int().nonnegative().max(100000000).safe(),
        reason: z.string().trim().min(10).max(2000),
        reviewAttested: z.literal(true),
    }).strict();
    const read = () => {
        const row = db.prepare('SELECT rate_cents_per_hour AS rateCentsPerHour,version,updated_by AS updatedBy,updated_at AS updatedAt FROM _agreement_labor_rates WHERE id=1').get();
        return row ? { ...row } : null;
    };
    function save(user, raw) {
        writer(user);
        const d = parse(input, raw);
        const before = read();
        if ((before?.version ?? 0) !== d.expectedVersion)
            fail('Labor rate changed. Reload before saving.', 409);
        db.prepare('INSERT INTO _agreement_labor_rates(id,rate_cents_per_hour,version,updated_by) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET rate_cents_per_hour=excluded.rate_cents_per_hour,version=excluded.version,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').run(d.rateCentsPerHour, (before?.version ?? 0) + 1, user.id);
        return { rate: read() };
    }
    function current(user) {
        reader(user);
        return read();
    }
    return { save, current, read };
}
