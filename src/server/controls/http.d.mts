import type { Hono } from "hono";
export function createControlsModule(opts: { storage: unknown; currentUser: unknown }): { app: Hono; service: unknown };
