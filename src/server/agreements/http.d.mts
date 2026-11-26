import type {Hono,Context} from "hono";
import type {openStorage} from "../sqlite.mjs";
export function createAgreementModule(options:{storage:ReturnType<typeof openStorage>;currentUser(c:Context):unknown;issuer?():{version:number;legalName:string;address:string;email:string;phone:string;terms:string}|null;timeZone?():string;clock?():Date}):{app:Hono};
