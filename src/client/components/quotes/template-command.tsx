import { commandFailureIsDefinite } from "../../command-recovery.mjs";
import { useEffect, useRef, useState } from "preact/hooks";
import { accountRequest, AccountRequestError } from "../../auth";
import type { QuoteTemplate, TemplateCommand, TemplateDetail, TemplateSummary } from "../../quote-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Dialog, DialogTitle } from "../ui/dialog";
import { Checkbox, Notice, Textarea } from "../ui/surfaces";
import { SearchPicker } from "./search-picker";

export function TemplateCommandDialog({ source, initial, close, saved }: {
  source?: {quoteId:string;revision:number}; initial?:QuoteTemplate;
  close():void; saved(template:QuoteTemplate):void;
}) {
  const [target,setTarget]=useState<QuoteTemplate|null>(initial??null);
  const [name,setName]=useState(initial?.config.name??""), [title,setTitle]=useState(initial?.config.title??""),
    [active,setActive]=useState(initial?.config.active??true), [note,setNote]=useState("");
  const [busy,setBusy]=useState(false), [loading,setLoading]=useState(false), [uncertain,setUncertain]=useState(false),
    [dirty,setDirty]=useState(false), [error,setError]=useState("");
  const pending=useRef<TemplateCommand|null>(null), alive=useRef(true), sequence=useRef(0), guard=useRef({busy,uncertain,dirty});
  guard.current={busy,uncertain,dirty};
  useEffect(()=>{
    alive.current=true;
    const navigate=(event:Event)=>{
      if(guard.current.busy||guard.current.uncertain|| (guard.current.dirty&&!window.confirm("Discard unsaved template changes?"))) event.preventDefault();
    };
    const unload=(event:BeforeUnloadEvent)=>{if(guard.current.busy||guard.current.uncertain||guard.current.dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("ofs:before-navigation",navigate);window.addEventListener("beforeunload",unload);
    return ()=>{alive.current=false;sequence.current++;window.removeEventListener("ofs:before-navigation",navigate);window.removeEventListener("beforeunload",unload);};
  },[]);
  function change(){setDirty(true);setError("");}
  function attemptClose(){if(busy||uncertain)return;if(!dirty||window.confirm("Discard unsaved template changes?"))close();}
  async function select(row:TemplateSummary){
    const current=++sequence.current;setLoading(true);setError("");
    try{
      const result=await accountRequest<TemplateDetail>("/api/sales/quote-templates/"+row.id);
      if(!alive.current||current!==sequence.current)return;
      setTarget(result.template);setName(result.template.config.name);setTitle(result.template.config.title);setActive(result.template.config.active);change();
    }catch(e){if(alive.current&&current===sequence.current)setError((e as Error).message);}
    finally{if(alive.current&&current===sequence.current)setLoading(false);}
  }
  async function submit(){
    if(busy||loading)return;
    const recovering=uncertain&&pending.current!==null;
    setError("");
    if(!pending.current){
      if(!name.trim()||!title.trim()||note.trim().length<10){setError("Enter a name, reusable title and a review note of at least 10 characters.");return;}
      const origin=source??target?.source;if(!origin){setError("Choose a saved source quote first.");return;}
      pending.current={id:target?.id??crypto.randomUUID(),requestKey:crypto.randomUUID(),expectedVersion:target?.currentVersion??0,name,title,active,reviewNote:note,source:origin};
    }
    setBusy(true);
    try{
      const result=await accountRequest<{template:QuoteTemplate}>("/api/sales/quote-templates","POST",pending.current);
      if(!alive.current)return;
      pending.current=null;setUncertain(false);setDirty(false);saved(result.template);
    }catch(e){
      if(!alive.current)return;
      const definite=commandFailureIsDefinite(e instanceof AccountRequestError?e.status:undefined,recovering);
      if(definite)pending.current=null;
      setUncertain(!definite);setError((e as Error).message);
    }finally{if(alive.current)setBusy(false);}
  }
  const disabled=busy||loading||uncertain;
  return <Dialog class="quote-template-command" close={attemptClose}>
    <DialogTitle>{initial?"Manage template":"Save quote as template"}</DialogTitle>
    <p class="workspace-help">Review reusable wording and rates, including any customer-specific text. Customer/site links, billing rules, dates and material cost overrides are not copied.</p>
    {error&&<Notice tone="danger">{error}</Notice>}
    {uncertain&&<Notice tone="warning">The save outcome is uncertain. Retry the exact save before closing; editing is locked.</Notice>}
    {source&&!initial&&<>
      <SearchPicker<TemplateSummary> label="Update an existing template (optional)" endpoint="/api/sales/quote-templates?state=all" selected={target?{id:target.id,label:target.config.name}:null} disabled={disabled} format={row=>`${row.name} · v${row.version}`} change={row=>void select(row)}/>
      {target&&<Button disabled={disabled} onClick={()=>{sequence.current++;setTarget(null);change();}}>Create a separate new template</Button>}
    </>}
    <TextField label="Template name" value={name} maxLength={120} disabled={disabled} onInput={event=>{change();setName(event.currentTarget.value);}}/>
    <TextField label="Reusable quote title" value={title} maxLength={200} disabled={disabled} onInput={event=>{change();setTitle(event.currentTarget.value);}}/>
    <label class="ui-field">Review note<Textarea value={note} maxLength={2000} disabled={disabled} onInput={event=>{change();setNote(event.currentTarget.value);}}/></label>
    <Checkbox label="Active: available for new estimates" checked={active} disabled={disabled} onChange={event=>{change();setActive(event.currentTarget.checked);}}/>
    <p class="workspace-help">{source?`Source quote revision ${source.revision}. Scope and line definitions come from that saved revision.`:"Archiving or restoring appends a new attributed version and preserves historical quote references."}</p>
    <div class="quote-actions"><Button disabled={busy||uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={busy||loading} onClick={()=>void submit()}>{uncertain?"Retry exact save":busy?"Saving…":"Save template version"}</Button></div>
  </Dialog>;
}
