import type {Hono,Context} from "hono";
import type {openStorage} from "../sqlite.mjs";
export function createProjectModule(options:{storage:ReturnType<typeof openStorage>;currentUser(c:Context):unknown;proposalSource?:(user:unknown,quoteId:string)=>unknown}):{app:Hono;projects:unknown};
