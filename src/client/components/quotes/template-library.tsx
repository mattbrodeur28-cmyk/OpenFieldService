import { useEffect, useState } from "preact/hooks";
import { accountRequest, useAccount, isAdministrator } from "../../auth";
import { useApp } from "../../context";
import { useConnectivity } from "../../hooks/use-connectivity";
import type { LookupPage, TemplateSummary, TemplateDetail, QuoteTemplate } from "../../quote-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Badge, Notice, LoadingState, EmptyState, Card } from "../ui/surfaces";
import { TemplateCommandDialog } from "./template-command";

export function TemplateLibrary(){
  const {navigate}=useApp(),{user}=useAccount(),{readOnly}=useConnectivity();
  const [data,setData]=useState<LookupPage<TemplateSummary>|null>(null),[search,setSearch]=useState(""),[state,setState]=useState("active"),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[error,setError]=useState("");
  const [selection,setSelection]=useState<{id:string;revision?:number;historyPage?:number}|null>(null),[detail,setDetail]=useState<TemplateDetail|null>(null),[managing,setManaging]=useState<QuoteTemplate|null>(null);
  useEffect(()=>{
    let live=true;setData(null);setError("");
    const query=new URLSearchParams({search,state,page:String(page)});
    const timer=window.setTimeout(()=>{void accountRequest<LookupPage<TemplateSummary>>("/api/sales/quote-templates?"+query).then(result=>{if(live)setData(result);}).catch(e=>{if(live)setError(e.message);});},180);
    return ()=>{live=false;window.clearTimeout(timer);};
  },[search,state,page,refresh]);
  useEffect(()=>{
    let live=true;setDetail(null);if(!selection)return;
    const query=new URLSearchParams({historyPage:String(selection.historyPage??1),...(selection.revision?{revision:String(selection.revision)}:{})});
    void accountRequest<TemplateDetail>(`/api/sales/quote-templates/${selection.id}?${query}`).then(result=>{if(live)setDetail(result);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[selection,refresh]);
  return <div class="page quotes-page">
    <header class="quote-header"><div><Button variant="ghost" onClick={()=>navigate("/sales/quotes")}>← Quotes</Button><h1>Quote templates</h1><p class="workspace-help">Reusable scope, exclusions and estimate lines · Versioned company library</p></div><Button onClick={()=>setRefresh(refresh+1)}>Refresh</Button></header>
    <Notice>Create or revise a template from a saved quote. Applying a template refreshes native material costs and requires price calculation; it never copies customers or creates jobs.</Notice>
    <div class="quote-template-filters"><TextField label="Find templates" value={search} onInput={event=>{setSearch(event.currentTarget.value);setPage(1);}}/><Select label="Status" value={state} options={[{value:"active",label:"Active"},{value:"archived",label:"Archived"},{value:"all",label:"All templates"}]} onValueChange={value=>{setState(value);setPage(1);}}/></div>
    {error&&<Notice tone="danger">{error}</Notice>}
    {!data&&!error&&<LoadingState label="Loading template library…"/>}
    {data&&<><div class="quote-template-grid">{data.rows.map(row=><Card key={row.id}><div class="quote-actions"><Badge>{row.segment}</Badge><Badge tone={row.active?"success":"neutral"}>{row.active?"Active":"Archived"}</Badge></div><h2>{row.name}</h2><p>Version {row.version}</p><Button onClick={()=>{setError("");setSelection({id:row.id});}}>View versions</Button></Card>)}</div>{!data.rows.length&&<EmptyState title="No matching templates">Open a saved quote and choose Save as template to start the library.</EmptyState>}<div class="quote-list-pages"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Previous templates</Button><span>Page {page} · {data.total} templates</span><Button disabled={page*25>=data.total} onClick={()=>setPage(page+1)}>Next templates</Button></div></>}
    {selection&&!detail&&!error&&<LoadingState label="Loading selected template…"/>}
    {detail&&<Card class="quote-template-detail"><header class="quote-header"><div><h2>{detail.template.config.name}</h2><p>Version {detail.template.version} of {detail.template.currentVersion}</p></div><div class="quote-actions">{isAdministrator(user)&&detail.template.version===detail.template.currentVersion&&<Button disabled={readOnly} onClick={()=>setManaging(detail.template)}>Manage / archive</Button>}<Button onClick={()=>{setSelection(null);setDetail(null);}}>Close details</Button></div></header>
      <p class="workspace-help">Source quote revision {detail.template.source.revision} · Published {detail.template.savedAt}</p><h3>{detail.template.config.title}</h3><p class="quote-document-text">{detail.template.config.scope}</p><h3>Exclusions</h3><p class="quote-document-text">{detail.template.config.exclusions||"None specified"}</p><p>{detail.template.config.lines.length} reusable lines · {detail.template.config.segment}</p><Notice>{detail.template.config.reviewNote}</Notice>
      <h3>Version history</h3><div class="quote-actions">{detail.history.map(item=><Button key={item.version} disabled={item.version===detail.template.version} onClick={()=>setSelection({id:detail.template.id,revision:item.version,historyPage:detail.historyPage})}>v{item.version}</Button>)}</div><div class="quote-list-pages"><Button disabled={detail.historyPage===1} onClick={()=>setSelection({id:detail.template.id,revision:detail.template.version,historyPage:detail.historyPage-1})}>Newer versions</Button><Button disabled={!detail.hasMoreHistory} onClick={()=>setSelection({id:detail.template.id,revision:detail.template.version,historyPage:detail.historyPage+1})}>Older versions</Button></div>
      {isAdministrator(user)&&<Button onClick={()=>navigate("/sales/quotes/"+detail.template.source.quoteId)}>Open source quote to revise scope and lines</Button>}
    </Card>}
    {managing&&<TemplateCommandDialog initial={managing} close={()=>setManaging(null)} saved={()=>{setManaging(null);setSelection({id:managing.id});setRefresh(refresh+1);}}/>}
  </div>;
}
