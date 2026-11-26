import type {openStorage} from "../sqlite.mjs";
export interface NativeMaintenanceJob {id:string;identifier:string;customerId:string;siteId:string;assetId:string|null;planningDate:string;durationMinutes:number;status:'scheduled';assigned:false;workCategory:'pm'}
export function createMaintenanceJobs(options:{storage:ReturnType<typeof openStorage>}):{createInTransaction(user:unknown,input:unknown):NativeMaintenanceJob};
