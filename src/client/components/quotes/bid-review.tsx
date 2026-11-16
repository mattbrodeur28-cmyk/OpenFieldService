import {useEffect,useState} from "preact/hooks";
import {accountRequest,useAccount,isAdministrator} from "../../auth";
import {useConnectivity} from "../../hooks/use-connectivity";
import {useGuardedCommand} from "../../hooks/use-guarded-command";
import type {BidReview,ReviewCommand} from "../../review-types";
import {quoteMoney as salesMoney} from "../../quote-input.mjs";
import {Dialog,DialogTitle} from "../ui/dialog";
import {Button} from "../ui/button";
import {Badge,Card,Checkbox,Notice,LoadingState,Textarea} from "../ui/surfaces";

function ReviewDialog({review,action,close,saved}:{review:BidReview;action:"approve"|"revoke";close():void;saved():void}){
  const {readOnly}=useConnectivity();
  const [checked,setChecked]=useState<string[]>([]),[note,setNote]=useState("");
  const command=useGuardedCommand<ReviewCommand,{review:BidReview}>(`/api/sales/quotes/${review.quoteId}/review`,()=>saved());
  const disabled=command.busy||command.uncertain||readOnly;
  const attemptClose=()=>{if(command.canClose())close();};
  function submit(){
    if(!review.policy)return;
    if(note.trim().length<10){command.setError("Record a review note of at least 10 characters.");return;}
    if(action==="approve"&&checked.length!==review.flags.length){command.setError("Acknowledge every current pricing flag before approving.");return;}
    void command.run({id:crypto.randomUUID(),requestKey:crypto.randomUUID(),expectedQuoteVersion:review.revision,expectedPolicyVersion:review.policy.version,expectedEventSequence:review.eventSequence,action,approvalId:action==="revoke"?review.latest?.id??null:null,acknowledgedFlags:action==="approve"?checked:[],note});
  }
  return <Dialog class="bid-review-dialog" close={attemptClose}>
    <DialogTitle>{action==="approve"?"Approve saved bid revision":"Revoke pricing approval"}</DialogTitle>
    <p class="workspace-help">Revision {review.revision} · Policy v{review.policy?.version} · Net {salesMoney(review.financials.netCents)} · Cost {salesMoney(review.financials.costCents)}</p>
    {command.error&&<Notice tone="danger">{command.error}</Notice>}
    {command.uncertain&&<Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact command before closing.</Notice>}
    {action==="approve"?review.flags.map(flag=><Checkbox key={flag.id} label={flag.description} disabled={disabled} checked={checked.includes(flag.id)} onChange={event=>{const selected=event.currentTarget.checked;command.changed();setChecked(current=>selected?[...current,flag.id]:current.filter(id=>id!==flag.id));}}/>):<Notice tone="warning">Revocation blocks pricing qualification for this saved revision until it is reviewed again. Earlier approval evidence remains retained.</Notice>}
    <label class="ui-field">{action==="approve"?"Review and exception rationale":"Revocation reason"}<Textarea value={note} maxLength={2000} disabled={disabled} onInput={event=>{command.changed();setNote(event.currentTarget.value);}}/></label>
    <Notice>This records internal pricing control only. It does not offer the quote, record customer acceptance or create work.</Notice>
    <div class="quote-actions"><Button disabled={command.busy||command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={command.busy||readOnly} onClick={submit}>{command.uncertain?"Retry exact command":action==="approve"?"Approve revision":"Revoke approval"}</Button></div>
  </Dialog>;
}
export function BidReviewPanel({id,revision,disabled,onChanged}:{id:string;revision:number;disabled:boolean;onChanged?():void}){
  const {user}=useAccount(),{readOnly}=useConnectivity();
  const [data,setData]=useState<BidReview|null>(null),[error,setError]=useState(""),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[action,setAction]=useState<"approve"|"revoke"|null>(null);
  useEffect(()=>{let active=true;setData(null);setError("");void accountRequest<BidReview>(`/api/sales/quotes/${id}/review?revision=${revision}&page=${page}`).then(result=>{if(active)setData(result);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[id,revision,page,refresh]);
  useEffect(()=>{const changed=()=>{if(!action)setRefresh(value=>value+1);};window.addEventListener("ofs:sales-config-changed",changed);return()=>window.removeEventListener("ofs:sales-config-changed",changed);},[action]);
  const editable=!!data&&data.revision===data.headVersion&&data.quoteStatus==="draft"&&!!data.policy&&data.state!=="pricing_incomplete"&&isAdministrator(user)&&!disabled&&!readOnly;
  const percent=(value:number|null)=>value===null?"Not defined":`${(value/100).toFixed(2)}%`;
  return <Card>
    <header class="quote-header"><h2>Bid review</h2><Button disabled={!!action} onClick={()=>setRefresh(refresh+1)}>Refresh</Button></header>
    {error&&<Notice tone="danger">{error}</Notice>}{!data&&!error&&<LoadingState label="Evaluating saved bid…"/>}
    {data&&<><Badge tone={data.qualified?"success":"warning"}>{data.state.replaceAll("_"," ")}</Badge><p class="workspace-help">Saved revision {data.revision}{data.policy?` · Policy v${data.policy.version}`:" · Configure policy in Settings"}</p>
      <dl><div><dt>Estimated cost</dt><dd>{salesMoney(data.financials.costCents)}</dd></div><div><dt>Net selling value</dt><dd>{salesMoney(data.financials.netCents)}</dd></div><div><dt>Gross profit</dt><dd>{salesMoney(data.financials.profitCents)}</dd></div><div><dt>Margin / markup</dt><dd>{percent(data.financials.marginBasisPoints)} / {percent(data.financials.markupBasisPoints)}</dd></div></dl>
      {data.flags.map(flag=><p class="workspace-help" key={flag.id}>{flag.description}</p>)}
      <div class="quote-actions"><Button disabled={!editable} onClick={()=>setAction("approve")}>Review / approve</Button>{data.latest?.action==="approve"&&<Button disabled={!editable} onClick={()=>setAction("revoke")}>Revoke</Button>}</div>
      <details><summary>Approval history for this revision</summary>{data.history.length?data.history.map(event=><div key={event.id}><p>{event.action==="approve"?"Approved":"Revoked"} · Policy v{event.policyVersion}</p><p>{event.note}</p></div>):<p class="workspace-help">No manual pricing event recorded.</p>}<div class="quote-actions"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Newer</Button><Button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Older</Button></div></details>
      <p class="workspace-help">Pricing qualification does not record an offer or customer acceptance.</p>
    </>}
    {action&&data&&<ReviewDialog review={data} action={action} close={()=>setAction(null)} saved={()=>{setAction(null);setRefresh(refresh+1);onChanged?.();}}/>}
  </Card>;
}
