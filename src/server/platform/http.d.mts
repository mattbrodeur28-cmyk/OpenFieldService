import type {Hono,Context} from "hono";
import type {openStorage} from "../sqlite.mjs";
export function createPlatform(options:{storage:ReturnType<typeof openStorage>;currentUser(c:Context):unknown}):{app:Hono};
