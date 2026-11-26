import type {openStorage} from "../sqlite.mjs";
export interface NativeQuotedJob {id:string;identifier:string;customerId:string;siteId:string;assetId:string|null;planningDate:string;durationMinutes:number;status:'scheduled';assigned:false;workCategory:'quoted'}
export function createJobHandoff(options:{storage:ReturnType<typeof openStorage>}):{createInTransaction(user:unknown,input:unknown):NativeQuotedJob;invoiceBlocked(id:string):boolean};
