import {useEffect,useRef,useState} from "preact/hooks";
import {accountRequest,AccountRequestError} from "../auth";
import {commandFailureIsDefinite} from "../command-recovery.mjs";

/** Exact in-memory command recovery for modal mutations. No durable queue is implied. */
export function useGuardedCommand<Command,Result>(path:string,onSuccess:(result:Result)=>void,send?:(path:string,command:Command)=>Promise<Result>){
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
  const pending=useRef<Command|null>(null),alive=useRef(true),success=useRef(onSuccess),guard=useRef({busy:false,uncertain:false,dirty:false});
  const sender=useRef(send);sender.current=send;
  success.current=onSuccess;
  useEffect(()=>{
    alive.current=true;
    const navigate=(event:Event)=>{const value=guard.current;if(value.busy||value.uncertain||(value.dirty&&!window.confirm("Discard unsaved review changes?")))event.preventDefault();};
    const unload=(event:BeforeUnloadEvent)=>{const value=guard.current;if(value.busy||value.uncertain||value.dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("ofs:before-navigation",navigate);window.addEventListener("beforeunload",unload);
    return()=>{alive.current=false;window.removeEventListener("ofs:before-navigation",navigate);window.removeEventListener("beforeunload",unload);};
  },[]);
  function changed(){guard.current.dirty=true;setError("");}
  function canClose(){const value=guard.current;return !value.busy&&!value.uncertain&&(!value.dirty||window.confirm("Discard unsaved review changes?"));}
  async function run(command:Command){
    if(guard.current.busy)return;
    const recovering=guard.current.uncertain;
    pending.current??=command;guard.current.busy=true;guard.current.dirty=true;setBusy(true);setError("");
    try{
      const result=sender.current?await sender.current(path,pending.current):await accountRequest<Result>(path,"POST",pending.current);
      if(!alive.current)return;
      pending.current=null;guard.current={busy:false,uncertain:false,dirty:false};setUncertain(false);success.current(result);
    }catch(error){
      if(!alive.current)return;
      const definite=commandFailureIsDefinite(error instanceof AccountRequestError?error.status:undefined,recovering);
      if(definite)pending.current=null;
      guard.current.uncertain=!definite;setUncertain(!definite);setError((error as Error).message);
    }finally{if(alive.current){guard.current.busy=false;setBusy(false);}}
  }
  return {busy,uncertain,error,setError,changed,canClose,run};
}
