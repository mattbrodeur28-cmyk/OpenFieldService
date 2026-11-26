import { z } from 'zod';
const slug = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), objectKey = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/).max(101);
const field = z.object({ key: slug, label: z.string().min(1).max(100), type: z.enum(['identifier', 'text', 'date', 'datetime', 'integer', 'boolean']), systemManaged: z.boolean() }).strict();
const relation = z.object({ key: slug, target: objectKey, cardinality: z.literal('many_to_one'), required: z.boolean() }).strict();
const object = z.object({ id: z.string().uuid(), key: objectKey, label: z.string().min(1).max(100), kind: z.enum(['record', 'ledger', 'snapshot', 'projection']), storageProfile: z.enum(['service', 'workspace']), writeMode: z.enum(['domain_commands', 'read_only']), fields: z.array(field).min(1).max(100), relations: z.array(relation).max(30) }).strict();
const manifest = z.object({ id: z.string().uuid(), key: slug, label: z.string().min(1).max(100), contractVersion: z.literal(1), availability: z.enum(['source', 'planned']), dependencies: z.array(slug).max(30), objects: z.array(object).max(100) }).strict();
function freeze(value) { if (value && typeof value === 'object') {
    for (const child of Object.values(value))
        freeze(child);
    Object.freeze(value);
} return value; }
/** Definition registration only. No SQL identifiers, CRUD or runtime code comes from metadata. */
export function createModuleRegistry(definitions) {
    const modules = z.array(manifest).min(1).max(100).parse(definitions), byModule = new Map(), byObject = new Map(), ids = new Set();
    const uniqueId = id => { if (ids.has(id))
        throw new Error('Module/object identity is registered twice.'); ids.add(id); };
    for (const module of modules) {
        if (byModule.has(module.key))
            throw new Error(`Module ${module.key} is registered twice.`);
        uniqueId(module.id);
        byModule.set(module.key, module);
        if (new Set(module.dependencies).size !== module.dependencies.length)
            throw new Error(`Duplicate dependencies for ${module.key}.`);
        for (const object of module.objects) {
            if (!object.key.startsWith(module.key + '.'))
                throw new Error(`Object ${object.key} is outside its owning module.`);
            if (byObject.has(object.key))
                throw new Error(`Object ${object.key} is registered twice.`);
            uniqueId(object.id);
            const fields = new Set(object.fields.map(f => f.key)), relations = new Set(object.relations.map(r => r.key));
            if (fields.size !== object.fields.length || relations.size !== object.relations.length)
                throw new Error(`Duplicate field or relation in ${object.key}.`);
            if (!object.fields.some(f => f.key === 'id' && f.type === 'identifier' && f.systemManaged))
                throw new Error(`Object ${object.key} needs a protected native identity.`);
            for (const key of relations)
                if (fields.has(key))
                    throw new Error(`Field/relation name collision in ${object.key}.`);
            byObject.set(object.key, { ...object, moduleKey: module.key });
        }
    }
    const complete = new Set(), visiting = new Set();
    function visit(key) {
        if (complete.has(key))
            return;
        if (visiting.has(key))
            throw new Error('Module dependency cycle.');
        const module = byModule.get(key);
        if (!module)
            throw new Error(`Missing module dependency ${key}.`);
        visiting.add(key);
        for (const dependency of module.dependencies)
            visit(dependency);
        visiting.delete(key);
        complete.add(key);
    }
    for (const module of modules) {
        visit(module.key);
        for (const object of module.objects)
            for (const relation of object.relations) {
                const target = byObject.get(relation.target);
                if (!target)
                    throw new Error(`Missing relation target ${relation.target}.`);
                // Direct references are declarations of required ownership dependencies.
                if (target.moduleKey !== module.key && !module.dependencies.includes(target.moduleKey))
                    throw new Error(`Module ${module.key} must declare dependency ${target.moduleKey}.`);
            }
    }
    const publicObjects = [...byObject.values()].map(object => freeze({ ...object, metadataCoverage: 'identity_label_relations', recordAuthorization: 'owning_service', inverseRelations: [...byObject.values()].flatMap(source => source.relations.filter(rel => rel.target === object.key).map(rel => ({ source: source.key, relationKey: rel.key, cardinality: 'one_to_many' }))) }));
    const objects = new Map(publicObjects.map(object => [object.key, object]));
    const catalog = freeze({ contractVersion: 1, capabilities: { metadataRead: true, metadataWrite: false, generatedCrud: false, runtimeInstall: false, customObjects: false }, modules: modules.map(({ objects, ...module }) => ({ ...module, objectKeys: objects.map(o => o.key) })), objects: publicObjects });
    return Object.freeze({ describe: () => catalog, object: key => objects.get(key) ?? null });
}
