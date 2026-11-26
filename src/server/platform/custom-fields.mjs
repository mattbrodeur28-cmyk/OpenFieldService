import { createHash } from 'node:crypto';
import { createCustomFieldRepository, customFieldObjectKeys } from './custom-fields-repository.mjs';
import { administrator, fail, parse, uuid, objectKey, fieldCommand, valueCommand, pageQuery, fieldQuery, validateDefinition, validateValue } from './custom-fields-domain.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createCustomFields({ storage, registry }) {
    const repo = createCustomFieldRepository(storage);
    function key(raw) { const value = parse(objectKey, raw); if (registry.object(value)?.writeMode !== 'domain_commands')
        fail('Custom fields are unavailable for this object.', 422); return value; }
    function command(user, requestKey, digest, work) {
        return repo.within(() => {
            const old = repo.prior(requestKey);
            if (old) {
                if (old.actor_id !== user.id)
                    fail('This request belongs to another account.', 403);
                if (old.request_hash !== digest)
                    fail('The request key has different content.', 409);
                return JSON.parse(old.result_json);
            }
            const result = work();
            repo.acknowledge(requestKey, user, digest, result);
            return result;
        });
    }
    function definitions(user, raw, query = {}) { administrator(user); const object = key(raw), q = parse(fieldQuery, query); return repo.within(() => ({ objectKey: object, fields: repo.fields(object).filter(f => q.includeArchived === 'true' || f.active) })); }
    function saveDefinition(user, raw) {
        administrator(user);
        const d = parse(fieldCommand, raw);
        key(d.objectKey);
        return command(user, d.requestKey, hash({ action: 'save_definition', ...d }), () => {
            const old = repo.field(d.id);
            if ((old?.version ?? 0) !== d.expectedVersion)
                fail('Field definition changed. Reload before saving.', 409);
            if (d.expectedVersion === Number.MAX_SAFE_INTEGER)
                fail("Field version needs administrator review.", 409);
            validateDefinition(d, old);
            if (!old && repo.fields(d.objectKey).length >= 100)
                fail('This object has reached the 100-field pilot limit, including archived definitions.', 422);
            const named = repo.namedField(d.objectKey, d.key);
            if (named && named.id !== d.id)
                fail('This custom-field key already exists.', 409);
            const definition = { id: d.id, objectKey: d.objectKey, key: d.key, label: d.label, description: d.description, type: d.type, options: d.options, active: d.active, version: d.expectedVersion + 1 };
            repo.saveField(definition, user, d.reason);
            return { field: definition };
        });
    }
    function recordInTransaction(object, id) { const native = repo.native(object, id), head = repo.record(object, id); return { objectKey: object, recordId: id, label: native.label, version: head?.version ?? 0, fields: repo.fields(object), values: repo.values(object, id), scope: 'admin_only_custom_annotations' }; }
    function record(user, raw, id) { administrator(user); const object = key(raw); parse(uuid, id); return repo.within(() => recordInTransaction(object, id)); }
    function saveValues(user, raw, id, input) {
        administrator(user);
        const object = key(raw);
        parse(uuid, id);
        const d = parse(valueCommand, input);
        return command(user, d.requestKey, hash({ action: 'save_values', object, recordId: id, ...d }), () => {
            const source = recordInTransaction(object, id);
            if (source.version !== d.expectedVersion)
                fail('Custom values changed. Reload before saving.', 409);
            if (source.version === Number.MAX_SAFE_INTEGER)
                fail("Custom value version needs administrator review.", 409);
            if (repo.eventExists(d.id))
                fail("This value-change identity already exists.", 409);
            if (new Set(d.changes.map(c => c.fieldId)).size !== d.changes.length)
                fail('A field can occur only once in a patch.');
            const changes = d.changes.map(change => {
                const definition = source.fields.find(f => f.id === change.fieldId);
                if (!definition || !definition.active)
                    fail('Choose an active field on this object.', 409);
                if (definition.version !== change.fieldVersion)
                    fail('A field definition changed. Review its current version.', 409);
                const previous = source.values.find(v => v.fieldId === definition.id);
                return { fieldId: definition.id, key: definition.key, label: definition.label, fieldVersion: definition.version, beforeFieldVersion: previous?.fieldVersion ?? null, before: previous?.value ?? null, after: validateValue(definition, change.value) };
            });
            repo.saveValues(object, id, source.version + 1, changes, d.id, user, d.reason);
            return { record: recordInTransaction(object, id) };
        });
    }
    function fieldHistory(user, id, query = {}) { administrator(user); parse(uuid, id); const { page } = parse(pageQuery, query); return repo.within(() => { if (!repo.field(id))
        fail('Custom field not found.', 404); const rows = repo.fieldHistory(id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    function recordHistory(user, raw, id, query = {}) { administrator(user); const object = key(raw); parse(uuid, id); const { page } = parse(pageQuery, query); return repo.within(() => { repo.native(object, id); const rows = repo.recordHistory(object, id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    return { definitions, saveDefinition, record, saveValues, fieldHistory, recordHistory, objectKeys: customFieldObjectKeys };
}
