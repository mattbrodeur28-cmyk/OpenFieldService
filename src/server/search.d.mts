import type { DatabaseSync } from "node:sqlite";
export function globalSearch(db: DatabaseSync, q: unknown): { query: string; results: Record<string, Array<Record<string, unknown>>> };
