export interface DBEnv {
  DB?: { prepare(sql: string): { bind(...params: unknown[]): { all(): Promise<{ results?: Record<string, unknown>[] }>; first(): Promise<Record<string, unknown> | null>; run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }> } } };
  STORAGE?: { validateSchedule?(job: Record<string, unknown>): boolean; schedulingState?(id: string): { version: number; managed: number } | undefined; query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; meta?: { changes?: number; last_row_id?: number } }> };
}
let current: DBEnv;
export function initDB(env: DBEnv) { current = env; }
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (current.STORAGE) return (await current.STORAGE.query(sql, params)).rows as T[];
  if (current.DB) return ((await current.DB.prepare(sql).bind(...params).all()).results ?? []) as T[];
  throw new Error('Database binding missing');
}
export async function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}
export async function run(sql: string, params: unknown[] = []) {
  const result = current.STORAGE ? await current.STORAGE.query(sql, params) : await current.DB!.prepare(sql).bind(...params).run();
  return { changes: result.meta?.changes ?? 0, lastInsertRowid: Number(result.meta?.last_row_id ?? 0) };
}
